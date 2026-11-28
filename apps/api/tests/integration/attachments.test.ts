import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
    attachmentSchema,
    errorResponseSchema,
    loginResponseSchema,
    MAX_ATTACHMENTS_PER_REVISION,
    MAX_ATTACHMENT_BYTES,
    type AttachmentDTO,
    type AttachmentMediaType,
    type UserRole,
} from "@workflow/contracts";
import { AttachmentService } from "../../src/Applications/Requests/AttachmentService";
import { CommentService } from "../../src/Applications/Requests/CommentService";
import {
    PrivateObjectStorageError,
    type IAttachmentDownloadRecord,
    type IAttachmentRepository,
    type IAttachmentUnitOfWork,
    type IAttachmentUploadReservation,
} from "../../src/Domains/Requests/AttachmentPorts";
import type { ICommentRepository, ICommentUnitOfWork } from "../../src/Domains/Requests/CommentPorts";
import { RequestAccessPolicy, type IRequestAccessContext } from "../../src/Domains/Requests/RequestAccessPolicy";
import { RequestError } from "../../src/Domains/Requests/RequestRules";
import { InMemoryPrivateObjectStorage } from "../../src/Infrastructures/Storage";
import { createApplication } from "../../src/Presentations/createApplication";
import { expectHttpError, identityHttpFixture } from "../helpers/identityHttp";

interface IStoredAttachment
{
    id: string;
    requestId: string;
    revisionId: string;
    uploadedBy: string;
    fileName: string;
    mediaType: AttachmentMediaType;
    sizeBytes: number;
    storageKey: string;
    sha256: string;
    uploadedAt: Date;
}

interface IRevisionMeta
{
    id: string;
    requestId: string;
    submittedAt: Date | null;
}

function pdfBytes(suffix = "1.7"): Uint8Array
{
    return new TextEncoder().encode(`%PDF-${suffix}\n%binary`);
}

function pngBytes(): Uint8Array
{
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
}

function jpegBytes(): Uint8Array
{
    return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
}

function webpBytes(): Uint8Array
{
    return new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x12, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
}

function makeUploadForm(
    file: { bytes: Uint8Array; name: string; type: string } | null,
    workingRevisionId?: string,
): FormData
{
    const form = new FormData();
    if (file)
    {
        const buffer = new ArrayBuffer(file.bytes.byteLength);
        new Uint8Array(buffer).set(file.bytes);
        form.append("file", new File([buffer], file.name, { type: file.type }));
    }
    if (workingRevisionId !== undefined)
    {
        form.append("workingRevisionId", workingRevisionId);
    }
    return form;
}

function createAttachmentsFixture()
{
    const identity = identityHttpFixture();
    const now = new Date("2026-11-28T06:00:00.000Z");

    const actionableReviewerId = "00000000-0000-4000-8000-000000000003";
    const waitingReviewerId = "00000000-0000-4000-8000-000000000004";
    const historicReviewerId = "00000000-0000-4000-8000-000000000005";
    const adminId = "00000000-0000-4000-8000-000000000006";

    const addUser = (id: string, email: string, displayName: string, roles: UserRole[]) =>
    {
        identity.accounts.set(id, {
            id,
            email,
            displayName,
            passwordHash: "hash",
            isActive: true,
            authVersion: 0,
            createdAt: now,
            updatedAt: now,
        });
        identity.identities.set(id, { roles, department: null });
    };

    addUser(actionableReviewerId, "actionable@example.test", "Actionable Reviewer", ["REVIEWER"]);
    addUser(waitingReviewerId, "waiting@example.test", "Waiting Reviewer", ["REVIEWER"]);
    addUser(historicReviewerId, "historic@example.test", "Historic Reviewer", ["REVIEWER"]);
    addUser(adminId, "admin@example.test", "Admin User", ["ADMINISTRATOR"]);

    const requestId = "10000000-0000-4000-8000-000000000001";
    const workingRevisionId = "20000000-0000-4000-8000-000000000001";
    const submittedRevisionId = "20000000-0000-4000-8000-000000000002";

    const revisionsMap = new Map<string, IRevisionMeta>([
        [workingRevisionId, { id: workingRevisionId, requestId, submittedAt: null }],
        [submittedRevisionId, { id: submittedRevisionId, requestId, submittedAt: now }],
    ]);

    const requestContext: IRequestAccessContext = {
        requestId,
        requesterId: identity.account.id,
        status: "DRAFT",
        workingRevisionId,
        submittedRevisionId: null,
        currentApprovers: [],
    };

    const reservations = new Map<string, IAttachmentUploadReservation>();
    const storedAttachments: IStoredAttachment[] = [];
    const cleanupJobs: Array<{ attachmentId: string; storageKey: string; reason: string }> = [];
    let tick = 0;

    const toDto = (item: IStoredAttachment): AttachmentDTO =>
        attachmentSchema.parse({
            id: item.id,
            requestId: item.requestId,
            workingOrSubmittedRevisionId: item.revisionId,
            fileName: item.fileName,
            mediaType: item.mediaType,
            sizeBytes: item.sizeBytes,
            uploadedBy: item.uploadedBy,
            uploadedAt: item.uploadedAt.toISOString(),
        });

    const storage = new InMemoryPrivateObjectStorage();

    const repository: IAttachmentRepository = {
        CurrentActor: async (actor) => actor,
        ReadRequestAccessContext: async (id) => (id === requestId ? requestContext : null),
        ListByRequest: async (id, query, includeWorkingRevision) =>
        {
            const filtered = storedAttachments
                .filter((item) =>
                {
                    if (item.requestId !== id)
                    {
                        return false;
                    }
                    const rev = revisionsMap.get(item.revisionId);
                    if (!rev)
                    {
                        return false;
                    }
                    if (!includeWorkingRevision && rev.submittedAt === null)
                    {
                        return false;
                    }
                    if (query.revisionId && item.revisionId !== query.revisionId)
                    {
                        return false;
                    }
                    return true;
                })
                .sort((a, b) => a.uploadedAt.getTime() - b.uploadedAt.getTime() || a.id.localeCompare(b.id));

            const totalCount = filtered.length;
            const totalPages = Math.ceil(totalCount / query.pageSize);
            const start = (query.pageNumber - 1) * query.pageSize;
            return {
                items: filtered.slice(start, start + query.pageSize).map(toDto),
                pagination: {
                    currentPage: query.pageNumber,
                    pageSize: query.pageSize,
                    totalPages,
                    totalCount,
                    hasPrevious: query.pageNumber > 1,
                    hasNext: query.pageNumber < totalPages,
                },
            };
        },
        CountRevisionAttachments: async (revisionId) =>
            storedAttachments.filter((item) => item.revisionId === revisionId).length,
        CreateUploadReservation: async (input) =>
        {
            const row: IAttachmentUploadReservation = { ...input, status: "UPLOADING" };
            reservations.set(row.id, row);
            return row;
        },
        FinalizeUpload: async (input) =>
        {
            if (!RequestAccessPolicy.CanMutateWorkingAttachment(input.actor, requestContext))
            {
                return { status: "CONFLICT", errorCode: "INVALID_REQUEST_TRANSITION" };
            }
            if (requestContext.workingRevisionId !== input.revisionId)
            {
                return { status: "CONFLICT", errorCode: "REQUEST_STALE" };
            }
            if (storedAttachments.filter((item) => item.revisionId === input.revisionId).length >= MAX_ATTACHMENTS_PER_REVISION)
            {
                return { status: "CONFLICT", errorCode: "VALIDATION_ERROR" };
            }
            const stored: IStoredAttachment = {
                id: input.attachmentId,
                requestId: input.requestId,
                revisionId: input.revisionId,
                uploadedBy: input.uploadedBy,
                fileName: input.fileName,
                mediaType: input.mediaType,
                sizeBytes: input.sizeBytes,
                storageKey: input.storageKey,
                sha256: input.sha256,
                uploadedAt: new Date(now.getTime() + ++tick * 1000),
            };
            storedAttachments.push(stored);
            const res = reservations.get(input.reservationId);
            if (res)
            {
                res.status = "FINALIZED";
            }
            return { status: "FINALIZED", attachment: toDto(stored) };
        },
        AbandonReservationAndEnqueueCleanup: async (input) =>
        {
            const res = reservations.get(input.reservationId);
            if (res)
            {
                res.status = "ABANDONED";
            }
            cleanupJobs.push({
                attachmentId: input.attachmentId,
                storageKey: input.storageKey,
                reason: input.reason,
            });
        },
        DeleteWorkingAttachment: async (reqId, attachmentId, activeWorkingRevisionId) =>
        {
            const index = storedAttachments.findIndex((item) => item.id === attachmentId && item.requestId === reqId);
            if (index === -1)
            {
                throw new RequestError("NOT_FOUND");
            }
            const item = storedAttachments[index]!;
            const rev = revisionsMap.get(item.revisionId);
            if (!rev || rev.submittedAt !== null || item.revisionId !== activeWorkingRevisionId)
            {
                throw new RequestError("INVALID_REQUEST_TRANSITION");
            }
            storedAttachments.splice(index, 1);
            cleanupJobs.push({
                attachmentId,
                storageKey: item.storageKey,
                reason: "WORKING_DELETED",
            });
        },
        FindForDownload: async (attachmentId): Promise<IAttachmentDownloadRecord | null> =>
        {
            const item = storedAttachments.find((entry) => entry.id === attachmentId);
            if (!item)
            {
                return null;
            }
            const rev = revisionsMap.get(item.revisionId);
            if (!rev)
            {
                return null;
            }
            return {
                attachment: toDto(item),
                storageKey: item.storageKey,
                requestContext,
                revisionContext: {
                    requestId: item.requestId,
                    revisionId: item.revisionId,
                    submittedAt: rev.submittedAt,
                },
            };
        },
    };

    const unit: IAttachmentUnitOfWork = {
        Run: (operation) => operation(repository),
    };

    const commentUnit: ICommentUnitOfWork = {
        Run: (operation) =>
            operation({
                CurrentActor: async (actor) => actor,
                ReadRequestAccessContext: async (id) => (id === requestId ? requestContext : null),
                ListByRequest: async () => ({
                    items: [],
                    pagination: { currentPage: 1, pageSize: 20, totalPages: 0, totalCount: 0, hasPrevious: false, hasNext: false },
                }),
                Create: async () =>
                {
                    throw new Error("not used");
                },
            } satisfies ICommentRepository),
    };

    const app = createApplication(
        undefined,
        identity.dependencies,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        {
            comments: new CommentService(commentUnit),
            attachmentStorage: storage,
            attachments: new AttachmentService(unit, storage, () => now),
        },
    );

    const login = async (email: string) =>
    {
        const response = await app.handle(
            new Request("http://localhost/api/v1/auth/login", {
                method: "POST",
                headers: { origin: "http://localhost:3000", "content-type": "application/json" },
                body: JSON.stringify({ email, password: "password" }),
            }),
        );
        expect(response.status).toBe(200);
        return loginResponseSchema.parse(await response.json()).accessToken;
    };

    return {
        identity,
        app,
        login,
        storage,
        requestId,
        workingRevisionId,
        submittedRevisionId,
        requestContext,
        revisionsMap,
        storedAttachments,
        cleanupJobs,
        actionableReviewerId,
        waitingReviewerId,
        historicReviewerId,
        actionableEmail: "actionable@example.test",
        waitingEmail: "waiting@example.test",
        historicEmail: "historic@example.test",
        adminEmail: "admin@example.test",
    };
}

describe("Attachments HTTP API", () =>
{
    it("ATT-API-01 uploads PDF to DRAFT request with matching workingRevisionId, returning 201 + Location without storageKey", async () =>
    {
        const fx = createAttachmentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);

        const response = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                headers: { authorization: `Bearer ${ownerToken}` },
                body: makeUploadForm({ bytes: pdfBytes(), name: "quote.pdf", type: "application/pdf" }, fx.workingRevisionId),
            }),
        );

        expect(response.status).toBe(201);
        expect(response.headers.get("cache-control")).toBe("no-store");
        const dto = attachmentSchema.parse(await response.json());
        expect(dto).toMatchObject({
            requestId: fx.requestId,
            workingOrSubmittedRevisionId: fx.workingRevisionId,
            fileName: "quote.pdf",
            mediaType: "application/pdf",
            uploadedBy: fx.identity.account.id,
        });
        expect(dto).not.toHaveProperty("storageKey");
        expect(response.headers.get("location")).toBe(`/api/v1/attachments/${dto.id}/download`);
        expect(fx.storage.Size()).toBe(1);
    });

    it("ATT-API-02 uploads PNG, JPEG, WEBP, and TXT to RETURNED working revision", async () =>
    {
        const fx = createAttachmentsFixture();
        fx.requestContext.status = "RETURNED";
        fx.requestContext.submittedRevisionId = fx.submittedRevisionId;
        const ownerToken = await fx.login(fx.identity.account.email);

        const files = [
            { bytes: pngBytes(), name: "diagram.png", type: "image/png" },
            { bytes: jpegBytes(), name: "receipt.jpg", type: "image/jpeg" },
            { bytes: webpBytes(), name: "scan.webp", type: "image/webp" },
            { bytes: new TextEncoder().encode("Notes line\n"), name: "notes.txt", type: "text/plain" },
        ];

        for (const item of files)
        {
            const response = await fx.app.handle(
                new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                    method: "POST",
                    headers: { authorization: `Bearer ${ownerToken}` },
                    body: makeUploadForm(item, fx.workingRevisionId),
                }),
            );
            expect(response.status).toBe(201);
            const dto = attachmentSchema.parse(await response.json());
            expect(dto.workingOrSubmittedRevisionId).toBe(fx.workingRevisionId);
        }
        expect(fx.storedAttachments).toHaveLength(4);
    });

    it("ATT-API-03 lists attachments with X-Pagination, no-store, and zero storageKey fields", async () =>
    {
        const fx = createAttachmentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);

        for (let idx = 1; idx <= 3; idx++)
        {
            const upload = await fx.app.handle(
                new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                    method: "POST",
                    headers: { authorization: `Bearer ${ownerToken}` },
                    body: makeUploadForm({ bytes: pdfBytes(String(idx)), name: `doc-${idx}.pdf`, type: "application/pdf" }),
                }),
            );
            expect(upload.status).toBe(201);
        }

        const listRes = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments?pageNumber=1&pageSize=2`, {
                headers: { authorization: `Bearer ${ownerToken}` },
            }),
        );
        expect(listRes.status).toBe(200);
        expect(listRes.headers.get("cache-control")).toBe("no-store");
        expect(JSON.parse(listRes.headers.get("x-pagination")!)).toEqual({
            currentPage: 1,
            pageSize: 2,
            totalPages: 2,
            totalCount: 3,
            hasPrevious: false,
            hasNext: true,
        });
        const items = attachmentSchema.array().parse(await listRes.json());
        expect(items.map((item) => item.fileName)).toEqual(["doc-1.pdf", "doc-2.pdf"]);
    });

    it("ATT-API-04 handles CORS preflight for attachment, comment, and download routes", async () =>
    {
        const fx = createAttachmentsFixture();
        const origin = "http://localhost:3000";

        const attachmentsPreflight = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "OPTIONS",
                headers: {
                    origin,
                    "access-control-request-method": "POST",
                    "access-control-request-headers": "authorization, content-type",
                },
            }),
        );
        expect(attachmentsPreflight.status).toBe(204);
        expect(attachmentsPreflight.headers.get("access-control-allow-methods")).toBe("GET, POST, DELETE");
        expect(attachmentsPreflight.headers.get("access-control-expose-headers")).toContain("X-Pagination");
        expect(attachmentsPreflight.headers.get("access-control-expose-headers")).toContain("X-Request-Id");
        expect(attachmentsPreflight.headers.get("access-control-expose-headers")).toContain("Location");
        expect(attachmentsPreflight.headers.get("access-control-expose-headers")).toContain("Content-Disposition");

        const deletePreflight = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments/${randomUUID()}`, {
                method: "OPTIONS",
                headers: { origin, "access-control-request-method": "DELETE" },
            }),
        );
        expect(deletePreflight.status).toBe(204);
        expect(deletePreflight.headers.get("access-control-allow-methods")).toBe("GET, POST, DELETE");

        const commentsPreflight = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/comments`, {
                method: "OPTIONS",
                headers: { origin, "access-control-request-method": "POST" },
            }),
        );
        expect(commentsPreflight.status).toBe(204);
        expect(commentsPreflight.headers.get("access-control-allow-methods")).toBe("GET, POST");

        const downloadPreflight = await fx.app.handle(
            new Request(`http://localhost/api/v1/attachments/${randomUUID()}/download`, {
                method: "OPTIONS",
                headers: { origin, "access-control-request-method": "GET" },
            }),
        );
        expect(downloadPreflight.status).toBe(204);
        expect(downloadPreflight.headers.get("access-control-allow-methods")).toBe("GET");

        const badOrigin = await fx.app.handle(
            new Request(`http://localhost/api/v1/attachments/${randomUUID()}/download`, {
                method: "OPTIONS",
                headers: { origin: "https://evil.example", "access-control-request-method": "GET" },
            }),
        );
        expect(badOrigin.status).toBe(403);
    });

    it("ATT-API-05 rejects files exceeding 10 MiB with 413 FILE_TOO_LARGE without storing object or metadata", async () =>
    {
        const fx = createAttachmentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);
        const oversized = new Uint8Array(MAX_ATTACHMENT_BYTES + 1);
        oversized.set([0x25, 0x50, 0x44, 0x46, 0x2d], 0);

        const response = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                headers: { authorization: `Bearer ${ownerToken}` },
                body: makeUploadForm({ bytes: oversized, name: "huge.pdf", type: "application/pdf" }),
            }),
        );

        expect(response.status).toBe(413);
        const body = errorResponseSchema.parse(await response.json());
        expect(body.code).toBe("FILE_TOO_LARGE");
        expect(fx.storage.Size()).toBe(0);
        expect(fx.storedAttachments).toHaveLength(0);
    });

    it("ATT-API-05b rejects an oversized streamed body early without reservation or PutObject", async () =>
    {
        const fx = createAttachmentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);
        const limit = MAX_ATTACHMENT_BYTES + 1024 * 1024;
        const chunk = new Uint8Array(256 * 1024);
        const pulledByRequest: number[] = [];
        const boundary = "----boundedtest";

        const buildRequest = (): Request =>
        {
            const index = pulledByRequest.push(0) - 1;
            const stream = new ReadableStream<Uint8Array>({
                pull(controller)
                {
                    if (pulledByRequest[index]! > limit * 20)
                    {
                        controller.close();
                        return;
                    }
                    pulledByRequest[index] = pulledByRequest[index]! + chunk.byteLength;
                    controller.enqueue(chunk);
                },
            });
            return new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${ownerToken}`,
                    "content-type": `multipart/form-data; boundary=${boundary}`,
                },
                body: stream,
                duplex: "half",
            } as RequestInit);
        };

        const responses = await Promise.all([1, 2, 3, 4, 5].map(() => fx.app.handle(buildRequest())));

        for (const response of responses)
        {
            expect(response.status).toBe(413);
            expect(errorResponseSchema.parse(await response.json()).code).toBe("FILE_TOO_LARGE");
        }
        expect(pulledByRequest).toHaveLength(5);
        for (const pulled of pulledByRequest)
        {
            expect(pulled).toBeLessThan(limit * 2);
        }
        expect(fx.storage.Size()).toBe(0);
        expect(fx.storedAttachments).toHaveLength(0);
    });

    it("ATT-API-05c rejects an oversized declared Content-Length before reading the body", async () =>
    {
        const fx = createAttachmentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);

        const response = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${ownerToken}`,
                    "content-type": "multipart/form-data; boundary=x",
                    "content-length": String(MAX_ATTACHMENT_BYTES * 3),
                },
                body: "--x--",
            }),
        );

        expect(response.status).toBe(413);
        expect(fx.storage.Size()).toBe(0);
        expect(fx.storedAttachments).toHaveLength(0);
    });

    it("ATT-API-06 rejects SVG, HTML, and EXE disguised as PDF with 415 UNSUPPORTED_MEDIA_TYPE", async () =>
    {
        const fx = createAttachmentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);

        const payloads = [
            { bytes: new TextEncoder().encode("<svg></svg>"), name: "vector.svg", type: "image/svg+xml" },
            { bytes: new TextEncoder().encode("<html></html>"), name: "page.html", type: "text/html" },
            { bytes: new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), name: "malware.pdf", type: "application/pdf" },
        ];

        for (const item of payloads)
        {
            const response = await fx.app.handle(
                new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                    method: "POST",
                    headers: { authorization: `Bearer ${ownerToken}` },
                    body: makeUploadForm(item),
                }),
            );
            expect(response.status).toBe(415);
            const body = errorResponseSchema.parse(await response.json());
            expect(body.code).toBe("UNSUPPORTED_MEDIA_TYPE");
        }

        expect(fx.storage.Size()).toBe(0);
        expect(fx.storedAttachments).toHaveLength(0);
    });

    it("ATT-API-07 handles malformed multipart, missing file, 0-byte file, and mismatched workingRevisionId safely", async () =>
    {
        const fx = createAttachmentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);

        const malformed = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                headers: {
                    authorization: `Bearer ${ownerToken}`,
                    "content-type": "multipart/form-data; boundary=broken",
                },
                body: "not-valid-multipart-payload",
            }),
        );
        await expectHttpError(malformed, 400);

        const missingFile = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                headers: { authorization: `Bearer ${ownerToken}` },
                body: makeUploadForm(null, fx.workingRevisionId),
            }),
        );
        expect(missingFile.status).toBe(422);
        expect(errorResponseSchema.parse(await missingFile.json()).code).toBe("VALIDATION_ERROR");

        const emptyFile = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                headers: { authorization: `Bearer ${ownerToken}` },
                body: makeUploadForm({ bytes: new Uint8Array(0), name: "empty.pdf", type: "application/pdf" }),
            }),
        );
        expect(emptyFile.status).toBe(422);
        expect(errorResponseSchema.parse(await emptyFile.json()).code).toBe("VALIDATION_ERROR");

        const staleRevision = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                headers: { authorization: `Bearer ${ownerToken}` },
                body: makeUploadForm({ bytes: pdfBytes(), name: "quote.pdf", type: "application/pdf" }, randomUUID()),
            }),
        );
        expect(staleRevision.status).toBe(409);
        expect(errorResponseSchema.parse(await staleRevision.json()).code).toBe("REQUEST_STALE");
    });

    it("ATT-API-08 rejects 11th attachment on same working revision with 422 VALIDATION_ERROR", async () =>
    {
        const fx = createAttachmentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);

        for (let idx = 1; idx <= MAX_ATTACHMENTS_PER_REVISION; idx++)
        {
            const res = await fx.app.handle(
                new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                    method: "POST",
                    headers: { authorization: `Bearer ${ownerToken}` },
                    body: makeUploadForm({ bytes: pdfBytes(String(idx)), name: `f-${idx}.pdf`, type: "application/pdf" }),
                }),
            );
            expect(res.status).toBe(201);
        }

        const eleventh = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                headers: { authorization: `Bearer ${ownerToken}` },
                body: makeUploadForm({ bytes: pdfBytes("11"), name: "f-11.pdf", type: "application/pdf" }),
            }),
        );
        expect(eleventh.status).toBe(422);
        expect(errorResponseSchema.parse(await eleventh.json()).code).toBe("VALIDATION_ERROR");
        expect(fx.storedAttachments).toHaveLength(10);
    });

    it("ATT-API-09 returns 401 UNAUTHENTICATED with no-store for anonymous callers across all attachment endpoints", async () =>
    {
        const fx = createAttachmentsFixture();
        const attachmentId = randomUUID();

        for (const req of [
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`),
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                body: makeUploadForm({ bytes: pdfBytes(), name: "quote.pdf", type: "application/pdf" }),
            }),
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments/${attachmentId}`, {
                method: "DELETE",
            }),
            new Request(`http://localhost/api/v1/attachments/${attachmentId}/download`),
        ])
        {
            const response = await fx.app.handle(req);
            await expectHttpError(response, 401);
        }
    });

    it("ATT-API-10 denies POST and DELETE by current PENDING reviewers without mutating attachments or storage", async () =>
    {
        const fx = createAttachmentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);
        const upload = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                headers: { authorization: `Bearer ${ownerToken}` },
                body: makeUploadForm({ bytes: pdfBytes(), name: "evidence.pdf", type: "application/pdf" }),
            }),
        );
        const created = attachmentSchema.parse(await upload.json());

        fx.revisionsMap.get(fx.workingRevisionId)!.submittedAt = new Date();
        fx.requestContext.status = "PENDING";
        fx.requestContext.workingRevisionId = null;
        fx.requestContext.submittedRevisionId = fx.workingRevisionId;
        fx.requestContext.currentApprovers = [
            { reviewerId: fx.actionableReviewerId, status: "ACTIONABLE" },
            { reviewerId: fx.waitingReviewerId, status: "WAITING" },
        ];

        for (const email of [fx.actionableEmail, fx.waitingEmail])
        {
            const token = await fx.login(email);
            const postRes = await fx.app.handle(
                new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                    method: "POST",
                    headers: { authorization: `Bearer ${token}` },
                    body: makeUploadForm({ bytes: pdfBytes(), name: "hack.pdf", type: "application/pdf" }),
                }),
            );
            expect([403, 404, 409]).toContain(postRes.status);

            const delRes = await fx.app.handle(
                new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments/${created.id}`, {
                    method: "DELETE",
                    headers: { authorization: `Bearer ${token}` },
                }),
            );
            expect([403, 404, 409]).toContain(delRes.status);
        }

        expect(fx.storedAttachments).toHaveLength(1);
        expect(fx.storage.Size()).toBe(1);
    });

    it("ATT-API-11 returns indistinguishable 404 NOT_FOUND for foreign requester, historic reviewer, and unrelated admin", async () =>
    {
        const fx = createAttachmentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);
        const upload = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                headers: { authorization: `Bearer ${ownerToken}` },
                body: makeUploadForm({ bytes: pdfBytes(), name: "private.pdf", type: "application/pdf" }),
            }),
        );
        const created = attachmentSchema.parse(await upload.json());

        fx.revisionsMap.get(fx.workingRevisionId)!.submittedAt = new Date();
        fx.requestContext.status = "PENDING";
        fx.requestContext.workingRevisionId = null;
        fx.requestContext.submittedRevisionId = fx.workingRevisionId;
        fx.requestContext.currentApprovers = [
            { reviewerId: fx.actionableReviewerId, status: "ACTIONABLE" },
            { reviewerId: fx.historicReviewerId, status: "APPROVED" },
        ];

        for (const email of [fx.identity.other.email, fx.historicEmail, fx.adminEmail])
        {
            const token = await fx.login(email);
            await expectHttpError(
                await fx.app.handle(
                    new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                        headers: { authorization: `Bearer ${token}` },
                    }),
                ),
                404,
            );
            await expectHttpError(
                await fx.app.handle(
                    new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                        method: "POST",
                        headers: { authorization: `Bearer ${token}` },
                        body: makeUploadForm({ bytes: pdfBytes(), name: "nope.pdf", type: "application/pdf" }),
                    }),
                ),
                404,
            );
            await expectHttpError(
                await fx.app.handle(
                    new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments/${created.id}`, {
                        method: "DELETE",
                        headers: { authorization: `Bearer ${token}` },
                    }),
                ),
                404,
            );
            await expectHttpError(
                await fx.app.handle(
                    new Request(`http://localhost/api/v1/attachments/${created.id}/download`, {
                        headers: { authorization: `Bearer ${token}` },
                    }),
                ),
                404,
            );
        }
    });

    it("ATT-API-12 returns 409 INVALID_REQUEST_TRANSITION when owner attempts upload/delete on PENDING or APPROVED request", async () =>
    {
        const fx = createAttachmentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);
        const upload = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                headers: { authorization: `Bearer ${ownerToken}` },
                body: makeUploadForm({ bytes: pdfBytes(), name: "submitted.pdf", type: "application/pdf" }),
            }),
        );
        const created = attachmentSchema.parse(await upload.json());

        fx.revisionsMap.get(fx.workingRevisionId)!.submittedAt = new Date();
        fx.requestContext.workingRevisionId = null;
        fx.requestContext.submittedRevisionId = fx.workingRevisionId;

        for (const status of ["PENDING", "APPROVED"] as const)
        {
            fx.requestContext.status = status;
            const postRes = await fx.app.handle(
                new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                    method: "POST",
                    headers: { authorization: `Bearer ${ownerToken}` },
                    body: makeUploadForm({ bytes: pdfBytes(), name: "late.pdf", type: "application/pdf" }),
                }),
            );
            expect(postRes.status).toBe(409);
            expect(errorResponseSchema.parse(await postRes.json()).code).toBe("INVALID_REQUEST_TRANSITION");

            const delRes = await fx.app.handle(
                new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments/${created.id}`, {
                    method: "DELETE",
                    headers: { authorization: `Bearer ${ownerToken}` },
                }),
            );
            expect(delRes.status).toBe(409);
            expect(errorResponseSchema.parse(await delRes.json()).code).toBe("INVALID_REQUEST_TRANSITION");
        }

        expect(fx.storedAttachments).toHaveLength(1);
    });

    it("ATT-API-13 streams exact binary bytes and required security headers to owner and current PENDING reviewer", async () =>
    {
        const fx = createAttachmentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);
        const payload = pdfBytes("exact-content");

        const upload = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                headers: { authorization: `Bearer ${ownerToken}` },
                body: makeUploadForm({ bytes: payload, name: "quote.pdf", type: "application/pdf" }),
            }),
        );
        const created = attachmentSchema.parse(await upload.json());

        fx.revisionsMap.get(fx.workingRevisionId)!.submittedAt = new Date();
        fx.requestContext.status = "PENDING";
        fx.requestContext.workingRevisionId = null;
        fx.requestContext.submittedRevisionId = fx.workingRevisionId;
        fx.requestContext.currentApprovers = [{ reviewerId: fx.actionableReviewerId, status: "ACTIONABLE" }];

        const reviewerToken = await fx.login(fx.actionableEmail);
        for (const token of [ownerToken, reviewerToken])
        {
            const download = await fx.app.handle(
                new Request(`http://localhost/api/v1/attachments/${created.id}/download`, {
                    headers: { authorization: `Bearer ${token}` },
                }),
            );
            expect(download.status).toBe(200);
            expect(download.headers.get("cache-control")).toBe("no-store");
            expect(download.headers.get("x-content-type-options")).toBe("nosniff");
            expect(download.headers.get("content-type")).toBe("application/pdf");
            expect(download.headers.get("content-disposition")).toContain("attachment;");
            expect(download.headers.get("content-length")).toBe(String(payload.byteLength));
            const received = new Uint8Array(await download.arrayBuffer());
            expect(received).toEqual(payload);
        }
    });

    it("ATT-API-14 sanitizes Unicode/special Content-Disposition filenames and maps storage outage to 503 without key leakage", async () =>
    {
        const fx = createAttachmentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);

        const upload = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                headers: { authorization: `Bearer ${ownerToken}` },
                body: makeUploadForm({ bytes: pdfBytes(), name: "รายงาน \"Q4\" (2026)!.pdf", type: "application/pdf" }),
            }),
        );
        const created = attachmentSchema.parse(await upload.json());

        const download = await fx.app.handle(
            new Request(`http://localhost/api/v1/attachments/${created.id}/download`, {
                headers: { authorization: `Bearer ${ownerToken}` },
            }),
        );
        expect(download.status).toBe(200);
        const disposition = download.headers.get("content-disposition")!;
        expect(disposition).toMatch(/^attachment; filename="[^"]+"; filename\*=UTF-8''/);
        expect(disposition).toContain("%21");

        fx.storage.SetFaultHooks({
            onReadObjectStream: (key) =>
            {
                throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE", `gs://secret-bucket/${key}`);
            },
        });

        const outage = await fx.app.handle(
            new Request(`http://localhost/api/v1/attachments/${created.id}/download`, {
                headers: { authorization: `Bearer ${ownerToken}` },
            }),
        );
        const body = await expectHttpError(outage, 503);
        expect(JSON.stringify(body)).not.toContain("secret-bucket");
        expect(JSON.stringify(body)).not.toContain(fx.storedAttachments[0]!.storageKey);
    });

    it("ATT-API-15 deletes working attachment returning 204 and omits/404s it from subsequent list and download", async () =>
    {
        const fx = createAttachmentsFixture();
        const ownerToken = await fx.login(fx.identity.account.email);

        const upload = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                method: "POST",
                headers: { authorization: `Bearer ${ownerToken}` },
                body: makeUploadForm({ bytes: pdfBytes(), name: "temp.pdf", type: "application/pdf" }),
            }),
        );
        const created = attachmentSchema.parse(await upload.json());

        const deleted = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments/${created.id}`, {
                method: "DELETE",
                headers: { authorization: `Bearer ${ownerToken}` },
            }),
        );
        expect(deleted.status).toBe(204);
        expect(deleted.headers.get("cache-control")).toBe("no-store");
        expect(fx.cleanupJobs).toEqual([
            expect.objectContaining({
                attachmentId: created.id,
                reason: "WORKING_DELETED",
            }),
        ]);

        const listAfter = await fx.app.handle(
            new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
                headers: { authorization: `Bearer ${ownerToken}` },
            }),
        );
        expect(listAfter.status).toBe(200);
        expect(await listAfter.json()).toEqual([]);

        const downloadAfter = await fx.app.handle(
            new Request(`http://localhost/api/v1/attachments/${created.id}/download`, {
                headers: { authorization: `Bearer ${ownerToken}` },
            }),
        );
        await expectHttpError(downloadAfter, 404);
    });
});
