import { randomUUID } from "node:crypto";
import type { AttachmentDTO, AttachmentQuery, IPageResult } from "@workflow/contracts";
import type { IActor } from "../../Domains/Identity/Identity";
import {
    PrivateObjectStorageError,
    type IAttachmentUnitOfWork,
    type IPrivateObjectStorage,
} from "../../Domains/Requests/AttachmentPorts";
import { ValidateAttachmentUpload } from "../../Domains/Requests/AttachmentRules";
import { RequestAccessPolicy } from "../../Domains/Requests/RequestAccessPolicy";
import { RequestError } from "../../Domains/Requests/RequestRules";

const UPLOAD_RESERVATION_TTL_MS = 5 * 60 * 1000;

export interface IUploadAttachmentInput
{
    actor: IActor;
    requestId: string;
    fileName: string;
    declaredMediaType: string;
    bytes: Uint8Array;
    workingRevisionId?: string;
}

export interface IDeleteWorkingAttachmentInput
{
    actor: IActor;
    requestId: string;
    attachmentId: string;
}

export interface IDownloadAttachmentInput
{
    actor: IActor;
    attachmentId: string;
}

export interface IDownloadAttachmentResult
{
    attachment: AttachmentDTO;
    stream: ReadableStream<Uint8Array>;
    contentLength: number;
}

/**
 * Application service coordinating private attachment listing, reservation-backed uploads,
 * working-revision deletions, and authorized binary streaming downloads.
 */
export class AttachmentService
{
    constructor(
        private readonly unit: IAttachmentUnitOfWork,
        private readonly storage: IPrivateObjectStorage,
        private readonly now: () => Date = () => new Date(),
    )
    {
    }

    public async ListAttachments(actor: IActor, requestId: string, query: AttachmentQuery): Promise<IPageResult<AttachmentDTO>>
    {
        const normalizedRequestId = requestId.toLowerCase();
        const normalizedQuery: AttachmentQuery = {
            ...query,
            ...(query.revisionId ? { revisionId: query.revisionId.toLowerCase() } : {}),
        };

        return this.unit.Run(async (repository) =>
        {
            const currentActor = await repository.CurrentActor(actor);
            const context = await repository.ReadRequestAccessContext(normalizedRequestId, "share");
            if (!context)
            {
                throw new RequestError("NOT_FOUND");
            }

            RequestAccessPolicy.AssertCanReadCurrentRequest(currentActor, context);
            const includeWorkingRevision =
                currentActor.account.id === context.requesterId
                && currentActor.roles.includes("REQUESTER");

            return repository.ListByRequest(normalizedRequestId, normalizedQuery, includeWorkingRevision);
        });
    }

    public async UploadAttachment(input: IUploadAttachmentInput): Promise<AttachmentDTO>
    {
        const normalizedRequestId = input.requestId.toLowerCase();
        const normalizedSuppliedRevisionId = input.workingRevisionId?.toLowerCase();

        const staged = await this.unit.Run(async (repository) =>
        {
            const currentActor = await repository.CurrentActor(input.actor);
            const context = await repository.ReadRequestAccessContext(normalizedRequestId, "update");
            if (!context)
            {
                throw new RequestError("NOT_FOUND");
            }

            RequestAccessPolicy.AssertCanMutateWorkingAttachment(currentActor, context);
            const activeWorkingRevisionId = context.workingRevisionId!;
            if (normalizedSuppliedRevisionId && normalizedSuppliedRevisionId !== activeWorkingRevisionId.toLowerCase())
            {
                throw new RequestError("REQUEST_STALE");
            }

            const existingCount = await repository.CountRevisionAttachments(activeWorkingRevisionId);
            const attachmentId = randomUUID();
            const validated = ValidateAttachmentUpload({
                requestId: normalizedRequestId,
                revisionId: activeWorkingRevisionId,
                attachmentId,
                fileName: input.fileName,
                declaredMediaType: input.declaredMediaType,
                bytes: input.bytes,
                existingRevisionAttachmentCount: existingCount,
            });

            const reservation = await repository.CreateUploadReservation({
                id: randomUUID(),
                attachmentId,
                requestId: normalizedRequestId,
                revisionId: activeWorkingRevisionId,
                uploadedBy: currentActor.account.id,
                storageKey: validated.storageKey,
                fileName: validated.fileName,
                mediaType: validated.mediaType,
                sizeBytes: validated.sizeBytes,
                sha256: validated.sha256,
                expiresAt: new Date(this.now().getTime() + UPLOAD_RESERVATION_TTL_MS),
            });

            return { currentActor, reservation };
        });

        try
        {
            await this.storage.PutObject({
                storageKey: staged.reservation.storageKey,
                contentType: staged.reservation.mediaType,
                bytes: input.bytes,
            });
        }
        catch (error)
        {
            try
            {
                await this.unit.Run((repository) =>
                    repository.AbandonReservationAndEnqueueCleanup({
                        reservationId: staged.reservation.id,
                        attachmentId: staged.reservation.attachmentId,
                        storageKey: staged.reservation.storageKey,
                        reason: "UPLOAD_ABORTED",
                    }),
                );
            }
            catch
            {
                // Stale reservation reconciliation handles expired UPLOADING rows if compensation fails.
            }

            if (error instanceof PrivateObjectStorageError && error.code === "STORAGE_UNAVAILABLE")
            {
                throw error;
            }
            throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE", "Private object storage is unavailable.");
        }

        const finalized = await this.unit.Run((repository) =>
            repository.FinalizeUpload({
                actor: staged.currentActor,
                reservationId: staged.reservation.id,
                attachmentId: staged.reservation.attachmentId,
                requestId: staged.reservation.requestId,
                revisionId: staged.reservation.revisionId,
                uploadedBy: staged.reservation.uploadedBy,
                storageKey: staged.reservation.storageKey,
                fileName: staged.reservation.fileName,
                mediaType: staged.reservation.mediaType,
                sizeBytes: staged.reservation.sizeBytes,
                sha256: staged.reservation.sha256,
            }),
        );

        if (finalized.status === "CONFLICT")
        {
            throw new RequestError(finalized.errorCode, finalized.details ?? []);
        }

        return finalized.attachment;
    }

    public async DeleteWorkingAttachment(input: IDeleteWorkingAttachmentInput): Promise<void>
    {
        const normalizedRequestId = input.requestId.toLowerCase();
        const normalizedAttachmentId = input.attachmentId.toLowerCase();

        await this.unit.Run(async (repository) =>
        {
            const currentActor = await repository.CurrentActor(input.actor);
            const context = await repository.ReadRequestAccessContext(normalizedRequestId, "update");
            if (!context)
            {
                throw new RequestError("NOT_FOUND");
            }

            RequestAccessPolicy.AssertCanMutateWorkingAttachment(currentActor, context);
            await repository.DeleteWorkingAttachment(
                normalizedRequestId,
                normalizedAttachmentId,
                context.workingRevisionId!,
            );
        });
    }

    public async DownloadAttachment(input: IDownloadAttachmentInput): Promise<IDownloadAttachmentResult>
    {
        const normalizedAttachmentId = input.attachmentId.toLowerCase();

        const record = await this.unit.Run(async (repository) =>
        {
            const currentActor = await repository.CurrentActor(input.actor);
            const found = await repository.FindForDownload(normalizedAttachmentId);
            if (!found)
            {
                throw new RequestError("NOT_FOUND");
            }

            RequestAccessPolicy.AssertCanDownloadAttachment(
                currentActor,
                found.requestContext,
                found.revisionContext,
            );
            return found;
        });

        try
        {
            const streamResult = await this.storage.ReadObjectStream(record.storageKey);
            return {
                attachment: record.attachment,
                stream: streamResult.stream,
                contentLength: streamResult.contentLength ?? record.attachment.sizeBytes,
            };
        }
        catch (error)
        {
            if (error instanceof PrivateObjectStorageError)
            {
                throw error;
            }
            throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE", "Private object storage is unavailable.");
        }
    }
}
