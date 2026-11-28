import { randomUUID } from "node:crypto";
import { and, asc, count, eq, isNotNull } from "drizzle-orm";
import {
    attachmentSchema,
    MAX_ATTACHMENTS_PER_REVISION,
    type AttachmentDTO,
    type AttachmentMediaType,
    type AttachmentQuery,
    type IPageResult,
} from "@workflow/contracts";
import type { IActor } from "../../../Domains/Identity/Identity";
import type {
    FinalizeAttachmentConflictCode,
    FinalizeAttachmentUploadResult,
    IAbandonReservationInput,
    IAttachmentDownloadRecord,
    IAttachmentRepository,
    IAttachmentUnitOfWork,
    IAttachmentUploadReservation,
    ICreateUploadReservationInput,
    IFinalizeAttachmentUploadInput,
} from "../../../Domains/Requests/AttachmentPorts";
import { RequestAccessPolicy, type IRequestAccessContext } from "../../../Domains/Requests/RequestAccessPolicy";
import { RequestError } from "../../../Domains/Requests/RequestRules";
import type { Database } from "../Database";
import {
    attachmentCleanupJobs,
    attachments,
    attachmentUploadReservations,
    requestRevisions,
} from "../schema";
import { ReadRequestAccessContextFromTransaction, type RepositoryTransaction } from "./CommentRepository";
import { RequestRepository } from "./RequestRepository";

type Connection = Database["connection"];

export class AttachmentRepository implements IAttachmentRepository
{
    constructor(private readonly db: RepositoryTransaction)
    {
    }

    public CurrentActor(actor: IActor): Promise<IActor>
    {
        return new RequestRepository(this.db).CurrentActor(actor);
    }

    public ReadRequestAccessContext(requestId: string, lock: false | "share" | "update" = false): Promise<IRequestAccessContext | null>
    {
        return ReadRequestAccessContextFromTransaction(this.db, requestId, lock);
    }

    public async ListByRequest(
        requestId: string,
        query: AttachmentQuery,
        includeWorkingRevision: boolean,
    ): Promise<IPageResult<AttachmentDTO>>
    {
        const predicates = [
            eq(attachments.requestId, requestId),
            eq(requestRevisions.requestId, requestId),
        ];
        if (!includeWorkingRevision)
        {
            predicates.push(isNotNull(requestRevisions.submittedAt));
        }
        if (query.revisionId)
        {
            predicates.push(eq(attachments.revisionId, query.revisionId));
        }

        const where = and(...predicates);
        const totalCount = (await this.db
            .select({ value: count() })
            .from(attachments)
            .innerJoin(
                requestRevisions,
                and(
                    eq(attachments.requestId, requestRevisions.requestId),
                    eq(attachments.revisionId, requestRevisions.id),
                ),
            )
            .where(where))[0]!.value;

        const rows = await this.db
            .select({
                id: attachments.id,
                requestId: attachments.requestId,
                revisionId: attachments.revisionId,
                fileName: attachments.fileName,
                mediaType: attachments.mediaType,
                sizeBytes: attachments.sizeBytes,
                uploadedBy: attachments.uploadedBy,
                uploadedAt: attachments.uploadedAt,
            })
            .from(attachments)
            .innerJoin(
                requestRevisions,
                and(
                    eq(attachments.requestId, requestRevisions.requestId),
                    eq(attachments.revisionId, requestRevisions.id),
                ),
            )
            .where(where)
            .orderBy(asc(attachments.uploadedAt), asc(attachments.id))
            .limit(query.pageSize)
            .offset((query.pageNumber - 1) * query.pageSize);

        const totalPages = Math.ceil(totalCount / query.pageSize);
        return {
            items: rows.map((row) =>
                attachmentSchema.parse({
                    id: row.id,
                    requestId: row.requestId,
                    workingOrSubmittedRevisionId: row.revisionId,
                    fileName: row.fileName,
                    mediaType: row.mediaType,
                    sizeBytes: row.sizeBytes,
                    uploadedBy: row.uploadedBy,
                    uploadedAt: row.uploadedAt.toISOString(),
                }),
            ),
            pagination: {
                currentPage: query.pageNumber,
                pageSize: query.pageSize,
                totalPages,
                totalCount,
                hasPrevious: query.pageNumber > 1,
                hasNext: query.pageNumber < totalPages,
            },
        };
    }

    public async CountRevisionAttachments(revisionId: string): Promise<number>
    {
        return (await this.db
            .select({ value: count() })
            .from(attachments)
            .where(eq(attachments.revisionId, revisionId)))[0]!.value;
    }

    public async CreateUploadReservation(input: ICreateUploadReservationInput): Promise<IAttachmentUploadReservation>
    {
        const now = new Date();
        await this.db.insert(attachmentUploadReservations).values({
            id: input.id,
            attachmentId: input.attachmentId,
            requestId: input.requestId,
            revisionId: input.revisionId,
            uploadedBy: input.uploadedBy,
            storageKey: input.storageKey,
            fileName: input.fileName,
            mediaType: input.mediaType,
            sizeBytes: input.sizeBytes,
            sha256: input.sha256,
            status: "UPLOADING",
            createdAt: now,
            updatedAt: now,
            expiresAt: input.expiresAt,
        });

        return {
            ...input,
            status: "UPLOADING",
        };
    }

    public async FinalizeUpload(input: IFinalizeAttachmentUploadInput): Promise<FinalizeAttachmentUploadResult>
    {
        const currentActor = await this.CurrentActor(input.actor);
        const context = await this.ReadRequestAccessContext(input.requestId, "update");

        let conflictCode: FinalizeAttachmentConflictCode | null = null;
        if (!context)
        {
            conflictCode = "NOT_FOUND";
        }
        else if (!RequestAccessPolicy.CanMutateWorkingAttachment(currentActor, context))
        {
            if (!currentActor.account.isActive || (currentActor.account.id === context.requesterId && !currentActor.roles.includes("REQUESTER")))
            {
                conflictCode = "FORBIDDEN";
            }
            else if (currentActor.account.id !== context.requesterId)
            {
                conflictCode = "NOT_FOUND";
            }
            else
            {
                conflictCode = "INVALID_REQUEST_TRANSITION";
            }
        }
        else if (context.workingRevisionId?.toLowerCase() !== input.revisionId.toLowerCase())
        {
            conflictCode = "REQUEST_STALE";
        }

        if (conflictCode !== null)
        {
            await this.AbandonReservationAndEnqueueCleanup({
                reservationId: input.reservationId,
                attachmentId: input.attachmentId,
                storageKey: input.storageKey,
                reason: "COMMIT_CONFLICT",
            });
            return { status: "CONFLICT", errorCode: conflictCode };
        }

        const existingCount = await this.CountRevisionAttachments(input.revisionId);
        if (existingCount >= MAX_ATTACHMENTS_PER_REVISION)
        {
            await this.AbandonReservationAndEnqueueCleanup({
                reservationId: input.reservationId,
                attachmentId: input.attachmentId,
                storageKey: input.storageKey,
                reason: "COMMIT_CONFLICT",
            });
            return {
                status: "CONFLICT",
                errorCode: "VALIDATION_ERROR",
                details: [
                    {
                        field: "file",
                        code: "VALIDATION_ERROR",
                        message: `A revision can contain at most ${MAX_ATTACHMENTS_PER_REVISION} attachments.`,
                    },
                ],
            };
        }

        const reservationRow = (await this.db
            .select({ status: attachmentUploadReservations.status })
            .from(attachmentUploadReservations)
            .where(eq(attachmentUploadReservations.id, input.reservationId))
            .for("update"))[0];

        if (!reservationRow || reservationRow.status !== "UPLOADING")
        {
            await this.AbandonReservationAndEnqueueCleanup({
                reservationId: input.reservationId,
                attachmentId: input.attachmentId,
                storageKey: input.storageKey,
                reason: "COMMIT_CONFLICT",
            });
            return { status: "CONFLICT", errorCode: "REQUEST_STALE" };
        }

        const now = new Date();
        await this.db.insert(attachments).values({
            id: input.attachmentId,
            requestId: input.requestId,
            revisionId: input.revisionId,
            uploadedBy: input.uploadedBy,
            fileName: input.fileName,
            mediaType: input.mediaType,
            sizeBytes: input.sizeBytes,
            storageKey: input.storageKey,
            sha256: input.sha256,
            uploadedAt: now,
        });

        await this.db
            .update(attachmentUploadReservations)
            .set({
                status: "FINALIZED",
                finalizedAt: now,
                updatedAt: now,
            })
            .where(eq(attachmentUploadReservations.id, input.reservationId));

        return {
            status: "FINALIZED",
            attachment: attachmentSchema.parse({
                id: input.attachmentId,
                requestId: input.requestId,
                workingOrSubmittedRevisionId: input.revisionId,
                fileName: input.fileName,
                mediaType: input.mediaType,
                sizeBytes: input.sizeBytes,
                uploadedBy: input.uploadedBy,
                uploadedAt: now.toISOString(),
            }),
        };
    }

    public async AbandonReservationAndEnqueueCleanup(input: IAbandonReservationInput): Promise<void>
    {
        const now = new Date();
        await this.db
            .update(attachmentUploadReservations)
            .set({
                status: "ABANDONED",
                abandonedAt: now,
                updatedAt: now,
            })
            .where(
                and(
                    eq(attachmentUploadReservations.id, input.reservationId),
                    eq(attachmentUploadReservations.status, "UPLOADING"),
                ),
            );

        await this.db
            .insert(attachmentCleanupJobs)
            .values({
                id: randomUUID(),
                reservationId: input.reservationId,
                attachmentId: input.attachmentId,
                storageKey: input.storageKey,
                reason: input.reason,
                status: "PENDING",
                attemptCount: 0,
                maxAttempts: 10,
                nextAttemptAt: now,
                createdAt: now,
                updatedAt: now,
            })
            .onConflictDoNothing();
    }

    public async DeleteWorkingAttachment(
        requestId: string,
        attachmentId: string,
        workingRevisionId: string,
    ): Promise<void>
    {
        const attachmentRow = (await this.db
            .select()
            .from(attachments)
            .where(and(eq(attachments.id, attachmentId), eq(attachments.requestId, requestId)))
            .for("update"))[0];

        if (!attachmentRow)
        {
            throw new RequestError("NOT_FOUND");
        }

        const revisionRow = (await this.db
            .select({ submittedAt: requestRevisions.submittedAt })
            .from(requestRevisions)
            .where(and(eq(requestRevisions.id, attachmentRow.revisionId), eq(requestRevisions.requestId, requestId))))[0];

        if (!revisionRow || revisionRow.submittedAt !== null || attachmentRow.revisionId !== workingRevisionId)
        {
            throw new RequestError("INVALID_REQUEST_TRANSITION");
        }

        const reservation = (await this.db
            .select({ id: attachmentUploadReservations.id })
            .from(attachmentUploadReservations)
            .where(eq(attachmentUploadReservations.attachmentId, attachmentId)))[0];

        await this.db
            .delete(attachments)
            .where(and(eq(attachments.id, attachmentId), eq(attachments.requestId, requestId)));

        const now = new Date();
        await this.db
            .insert(attachmentCleanupJobs)
            .values({
                id: randomUUID(),
                reservationId: reservation?.id ?? null,
                attachmentId,
                storageKey: attachmentRow.storageKey,
                reason: "WORKING_DELETED",
                status: "PENDING",
                attemptCount: 0,
                maxAttempts: 10,
                nextAttemptAt: now,
                createdAt: now,
                updatedAt: now,
            })
            .onConflictDoNothing();
    }

    public async FindForDownload(attachmentId: string): Promise<IAttachmentDownloadRecord | null>
    {
        const row = (await this.db
            .select({
                id: attachments.id,
                requestId: attachments.requestId,
                revisionId: attachments.revisionId,
                fileName: attachments.fileName,
                mediaType: attachments.mediaType,
                sizeBytes: attachments.sizeBytes,
                uploadedBy: attachments.uploadedBy,
                uploadedAt: attachments.uploadedAt,
                storageKey: attachments.storageKey,
                submittedAt: requestRevisions.submittedAt,
            })
            .from(attachments)
            .innerJoin(
                requestRevisions,
                and(
                    eq(attachments.requestId, requestRevisions.requestId),
                    eq(attachments.revisionId, requestRevisions.id),
                ),
            )
            .where(eq(attachments.id, attachmentId)))[0];

        if (!row)
        {
            return null;
        }

        const requestContext = await this.ReadRequestAccessContext(row.requestId, "share");
        if (!requestContext)
        {
            return null;
        }

        return {
            attachment: attachmentSchema.parse({
                id: row.id,
                requestId: row.requestId,
                workingOrSubmittedRevisionId: row.revisionId,
                fileName: row.fileName,
                mediaType: row.mediaType as AttachmentMediaType,
                sizeBytes: row.sizeBytes,
                uploadedBy: row.uploadedBy,
                uploadedAt: row.uploadedAt.toISOString(),
            }),
            storageKey: row.storageKey,
            requestContext,
            revisionContext: {
                requestId: row.requestId,
                revisionId: row.revisionId,
                submittedAt: row.submittedAt,
            },
        };
    }
}

export class AttachmentUnitOfWork implements IAttachmentUnitOfWork
{
    constructor(private readonly db: Connection)
    {
    }

    public Run<T>(operation: (repository: IAttachmentRepository) => Promise<T>): Promise<T>
    {
        return this.db.transaction((tx) => operation(new AttachmentRepository(tx)));
    }
}
