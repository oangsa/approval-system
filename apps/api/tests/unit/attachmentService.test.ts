import { describe, expect, it, vi } from "vitest";
import type { AttachmentDTO, UserRole } from "@workflow/contracts";
import { AttachmentService } from "../../src/Applications/Requests/AttachmentService";
import type { IActor } from "../../src/Domains/Identity/Identity";
import {
    PrivateObjectStorageError,
    type IAbandonReservationInput,
    type IAttachmentDownloadRecord,
    type IAttachmentRepository,
    type IAttachmentUnitOfWork,
    type ICreateUploadReservationInput,
    type IPrivateObjectStorage,
} from "../../src/Domains/Requests/AttachmentPorts";
import type { IRequestAccessContext } from "../../src/Domains/Requests/RequestAccessPolicy";
import { RequestError } from "../../src/Domains/Requests/RequestRules";
import { InMemoryPrivateObjectStorage } from "../../src/Infrastructures/Storage";

const NOW = new Date("2026-11-28T06:00:00.000Z");
const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const REVIEWER_ID = "10000000-0000-4000-8000-000000000002";
const ADMIN_ID = "10000000-0000-4000-8000-000000000003";
const REQUEST_ID = "20000000-0000-4000-8000-000000000001";
const WORKING_REVISION_ID = "30000000-0000-4000-8000-000000000001";
const OTHER_REVISION_ID = "30000000-0000-4000-8000-000000000002";
const ATTACHMENT_ID = "40000000-0000-4000-8000-000000000001";

function makeActor(id: string, roles: readonly UserRole[]): IActor
{
    return {
        account: {
            id,
            email: `${id}@example.test`,
            displayName: `User ${id}`,
            passwordHash: "hash",
            isActive: true,
            authVersion: 1,
            createdAt: NOW,
            updatedAt: NOW,
        },
        family: {
            id: "50000000-0000-4000-8000-000000000001",
            userId: id,
            authVersion: 1,
            createdAt: NOW,
            expiresAt: new Date(NOW.getTime() + 3600_000),
            revokedAt: null,
        },
        roles,
        department: null,
    };
}

function pdfBytes(): Uint8Array
{
    return new TextEncoder().encode("%PDF-1.7\n%quote");
}

function makeAttachmentUnit(overrides: Partial<IAttachmentRepository> = {})
{
    const abandonedCalls: IAbandonReservationInput[] = [];
    const repository: IAttachmentRepository = {
        CurrentActor: vi.fn(async (actor) => actor),
        ReadRequestAccessContext: vi.fn(async () => ({
            requestId: REQUEST_ID,
            requesterId: OWNER_ID,
            status: "DRAFT" as const,
            workingRevisionId: WORKING_REVISION_ID,
            submittedRevisionId: null,
            currentApprovers: [],
        })),
        ListByRequest: vi.fn(async () => ({
            items: [],
            pagination: { currentPage: 1, pageSize: 20, totalPages: 0, totalCount: 0, hasPrevious: false, hasNext: false },
        })),
        CountRevisionAttachments: vi.fn(async () => 0),
        CreateUploadReservation: vi.fn(async (input: ICreateUploadReservationInput) => ({
            ...input,
            status: "UPLOADING" as const,
        })),
        FinalizeUpload: vi.fn(async (input) => ({
            status: "FINALIZED" as const,
            attachment: {
                id: input.attachmentId,
                requestId: input.requestId,
                workingOrSubmittedRevisionId: input.revisionId,
                fileName: input.fileName,
                mediaType: input.mediaType,
                sizeBytes: input.sizeBytes,
                uploadedBy: input.uploadedBy,
                uploadedAt: NOW.toISOString(),
            },
        })),
        AbandonReservationAndEnqueueCleanup: vi.fn(async (input: IAbandonReservationInput) =>
        {
            abandonedCalls.push(input);
        }),
        DeleteWorkingAttachment: vi.fn(async () => undefined),
        FindForDownload: vi.fn(async () => null),
        ...overrides,
    };

    const unit: IAttachmentUnitOfWork = {
        Run: (operation) => operation(repository),
    };

    return { repository, unit, abandonedCalls };
}

describe("AttachmentService", () =>
{
    it("ATT-UT-08 rejects upload/delete on PENDING or mismatched workingRevisionId before calling storage", async () =>
    {
        const owner = makeActor(OWNER_ID, ["REQUESTER"]);
        const storage = new InMemoryPrivateObjectStorage();
        const putSpy = vi.spyOn(storage, "PutObject");
        const deleteSpy = vi.spyOn(storage, "DeleteObject");

        const pendingContext: IRequestAccessContext = {
            requestId: REQUEST_ID,
            requesterId: OWNER_ID,
            status: "PENDING",
            workingRevisionId: null,
            submittedRevisionId: WORKING_REVISION_ID,
            currentApprovers: [{ reviewerId: REVIEWER_ID, status: "ACTIONABLE" }],
        };
        const pendingFixture = makeAttachmentUnit({
            ReadRequestAccessContext: vi.fn(async () => pendingContext),
        });
        const pendingService = new AttachmentService(pendingFixture.unit, storage, () => NOW);

        await expect(
            pendingService.UploadAttachment({
                actor: owner,
                requestId: REQUEST_ID,
                fileName: "quote.pdf",
                declaredMediaType: "application/pdf",
                bytes: pdfBytes(),
            }),
        ).rejects.toThrowError(expect.objectContaining<Partial<RequestError>>({ code: "INVALID_REQUEST_TRANSITION" }));

        await expect(
            pendingService.DeleteWorkingAttachment({
                actor: owner,
                requestId: REQUEST_ID,
                attachmentId: ATTACHMENT_ID,
            }),
        ).rejects.toThrowError(expect.objectContaining<Partial<RequestError>>({ code: "INVALID_REQUEST_TRANSITION" }));

        const draftFixture = makeAttachmentUnit();
        const draftService = new AttachmentService(draftFixture.unit, storage, () => NOW);
        await expect(
            draftService.UploadAttachment({
                actor: owner,
                requestId: REQUEST_ID,
                fileName: "quote.pdf",
                declaredMediaType: "application/pdf",
                bytes: pdfBytes(),
                workingRevisionId: OTHER_REVISION_ID,
            }),
        ).rejects.toThrowError(expect.objectContaining<Partial<RequestError>>({ code: "REQUEST_STALE" }));

        expect(putSpy).not.toHaveBeenCalled();
        expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("ATT-UT-09 denies upload/delete by current reviewer or admin-only user with zero storage calls", async () =>
    {
        const reviewer = makeActor(REVIEWER_ID, ["REVIEWER"]);
        const admin = makeActor(ADMIN_ID, ["ADMINISTRATOR"]);
        const storage = new InMemoryPrivateObjectStorage();
        const putSpy = vi.spyOn(storage, "PutObject");
        const deleteSpy = vi.spyOn(storage, "DeleteObject");

        const pendingContext: IRequestAccessContext = {
            requestId: REQUEST_ID,
            requesterId: OWNER_ID,
            status: "PENDING",
            workingRevisionId: null,
            submittedRevisionId: WORKING_REVISION_ID,
            currentApprovers: [{ reviewerId: REVIEWER_ID, status: "ACTIONABLE" }],
        };
        const fixture = makeAttachmentUnit({
            ReadRequestAccessContext: vi.fn(async () => pendingContext),
        });
        const service = new AttachmentService(fixture.unit, storage, () => NOW);

        for (const actor of [reviewer, admin])
        {
            await expect(
                service.UploadAttachment({
                    actor,
                    requestId: REQUEST_ID,
                    fileName: "quote.pdf",
                    declaredMediaType: "application/pdf",
                    bytes: pdfBytes(),
                }),
            ).rejects.toThrowError(expect.objectContaining<Partial<RequestError>>({ code: "NOT_FOUND" }));

            await expect(
                service.DeleteWorkingAttachment({
                    actor,
                    requestId: REQUEST_ID,
                    attachmentId: ATTACHMENT_ID,
                }),
            ).rejects.toThrowError(expect.objectContaining<Partial<RequestError>>({ code: "NOT_FOUND" }));
        }

        expect(putSpy).not.toHaveBeenCalled();
        expect(deleteSpy).not.toHaveBeenCalled();
    });

    it("ATT-UT-10 streams download for authorized participant and maps storage NotFound / Unavailable safely without leaking storageKey", async () =>
    {
        const reviewer = makeActor(REVIEWER_ID, ["REVIEWER"]);
        const storage = new InMemoryPrivateObjectStorage();
        const storageKey = `attachments/${REQUEST_ID}/${WORKING_REVISION_ID}/${ATTACHMENT_ID}`;
        const dto: AttachmentDTO = {
            id: ATTACHMENT_ID,
            requestId: REQUEST_ID,
            workingOrSubmittedRevisionId: WORKING_REVISION_ID,
            fileName: "quote.pdf",
            mediaType: "application/pdf",
            sizeBytes: pdfBytes().byteLength,
            uploadedBy: OWNER_ID,
            uploadedAt: NOW.toISOString(),
        };
        const record: IAttachmentDownloadRecord = {
            attachment: dto,
            storageKey,
            requestContext: {
                requestId: REQUEST_ID,
                requesterId: OWNER_ID,
                status: "PENDING",
                workingRevisionId: null,
                submittedRevisionId: WORKING_REVISION_ID,
                currentApprovers: [{ reviewerId: REVIEWER_ID, status: "ACTIONABLE" }],
            },
            revisionContext: {
                requestId: REQUEST_ID,
                revisionId: WORKING_REVISION_ID,
                submittedAt: NOW,
            },
        };

        const fixture = makeAttachmentUnit({
            FindForDownload: vi.fn(async () => record),
        });
        const service = new AttachmentService(fixture.unit, storage, () => NOW);

        await storage.PutObject({ storageKey, contentType: "application/pdf", bytes: pdfBytes() });
        const downloaded = await service.DownloadAttachment({ actor: reviewer, attachmentId: ATTACHMENT_ID });
        expect(downloaded.attachment).toEqual(dto);
        expect(downloaded.contentLength).toBe(pdfBytes().byteLength);
        const streamed = new Uint8Array(await new Response(downloaded.stream).arrayBuffer());
        expect(streamed).toEqual(pdfBytes());

        await storage.DeleteObject(storageKey);
        await expect(service.DownloadAttachment({ actor: reviewer, attachmentId: ATTACHMENT_ID })).rejects.toThrowError(
            expect.objectContaining<Partial<PrivateObjectStorageError>>({ code: "OBJECT_NOT_FOUND" }),
        );

        const outageStorage: IPrivateObjectStorage = {
            PutObject: vi.fn(),
            ReadObjectStream: vi.fn(async () =>
            {
                throw new Error(`gs://secret-bucket/${storageKey} network timeout`);
            }),
            DeleteObject: vi.fn(),
            HeadObject: vi.fn(),
        };
        const outageService = new AttachmentService(fixture.unit, outageStorage, () => NOW);
        await expect(
            outageService.DownloadAttachment({ actor: reviewer, attachmentId: ATTACHMENT_ID }),
        ).rejects.toSatisfy((error: unknown) =>
            error instanceof PrivateObjectStorageError
            && error.code === "STORAGE_UNAVAILABLE"
            && !error.message.includes(storageKey)
            && !error.message.includes("secret-bucket"),
        );
    });

    it("ATT-UT-11 marks reservation ABANDONED, enqueues cleanup job, and throws STORAGE_UNAVAILABLE when PutObject fails", async () =>
    {
        const owner = makeActor(OWNER_ID, ["REQUESTER"]);
        const storage = new InMemoryPrivateObjectStorage({
            onPutObject: () =>
            {
                throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE", "Injected upload outage");
            },
        });

        const fixture = makeAttachmentUnit();
        const service = new AttachmentService(fixture.unit, storage, () => NOW);

        await expect(
            service.UploadAttachment({
                actor: owner,
                requestId: REQUEST_ID,
                fileName: "quote.pdf",
                declaredMediaType: "application/pdf",
                bytes: pdfBytes(),
                workingRevisionId: WORKING_REVISION_ID,
            }),
        ).rejects.toThrowError(expect.objectContaining<Partial<PrivateObjectStorageError>>({ code: "STORAGE_UNAVAILABLE" }));

        expect(fixture.repository.CreateUploadReservation).toHaveBeenCalledTimes(1);
        expect(fixture.repository.FinalizeUpload).not.toHaveBeenCalled();
        expect(fixture.abandonedCalls).toHaveLength(1);
        expect(fixture.abandonedCalls[0]).toMatchObject({
            reason: "UPLOAD_ABORTED",
        });
    });
});
