import { describe, expect, expectTypeOf, it } from "vitest";
import {
    ALLOWED_ATTACHMENT_MEDIA_TYPES,
    MAX_ATTACHMENTS_PER_REVISION,
    MAX_ATTACHMENT_BYTES,
    MAX_COMMENT_BODY_LENGTH,
    attachmentMediaTypeSchema,
    attachmentQuerySchema,
    attachmentSchema,
    commentAuthorSchema,
    commentQuerySchema,
    commentSchema,
    createCommentSchema,
    errorResponseSchema,
    type AttachmentDTO,
    type AttachmentMediaType,
    type AttachmentQuery,
    type CommentAuthor,
    type CommentDTO,
    type CommentQuery,
    type CreateCommentInput,
} from "../src";

const sampleCommentId = "10000000-0000-4000-8000-000000000001";
const sampleRequestId = "10000000-0000-4000-8000-000000000002";
const sampleUserId = "10000000-0000-4000-8000-000000000003";
const sampleRevisionId = "10000000-0000-4000-8000-000000000004";
const sampleAttachmentId = "10000000-0000-4000-8000-000000000005";
const sampleTimestamp = "2026-11-28T05:00:00.000Z";

describe("collaboration contracts", () =>
{
    it("CMT-CT-01 validates frozen CommentDTO shape and rejects missing or extra fields", () =>
    {
        const validComment: CommentDTO = {
            id: sampleCommentId,
            requestId: sampleRequestId,
            author: {
                id: sampleUserId,
                displayName: "Requester One",
            },
            body: "Please review the updated vendor quote.",
            createdAt: sampleTimestamp,
        };

        expect(commentSchema.parse(validComment)).toEqual(validComment);
        expect(Object.keys(commentSchema.shape)).toEqual(["id", "requestId", "author", "body", "createdAt"]);
        expectTypeOf<CommentAuthor>().toEqualTypeOf<{ id: string; displayName: string }>();
        expectTypeOf<CommentDTO>().toEqualTypeOf<{
            id: string;
            requestId: string;
            author: { id: string; displayName: string };
            body: string;
            createdAt: string;
        }>();

        expect(commentAuthorSchema.safeParse({ id: sampleUserId, displayName: "  Ada  " }).data).toEqual({
            id: sampleUserId,
            displayName: "Ada",
        });

        for (const invalid of [
            { ...validComment, extraField: "forbidden" },
            { ...validComment, author: { ...validComment.author, email: "leak@example.test" } },
            { ...validComment, author: { id: sampleUserId, displayName: "   " } },
            { ...validComment, id: "not-a-uuid" },
            { ...validComment, requestId: "not-a-uuid" },
            { ...validComment, body: "" },
            { ...validComment, body: "x".repeat(MAX_COMMENT_BODY_LENGTH + 1) },
            { ...validComment, createdAt: "2026-11-28T12:00:00+07:00" },
            { id: sampleCommentId, requestId: sampleRequestId, author: validComment.author, body: "Missing createdAt" },
        ])
        {
            expect(commentSchema.safeParse(invalid).success).toBe(false);
        }
    });

    it("CMT-CT-02 validates createCommentSchema trimming, bounds, and strictness", () =>
    {
        const parsed = createCommentSchema.parse({ body: "  Line 1\nLine 2  " });
        expect(parsed).toEqual({ body: "Line 1\nLine 2" });
        expectTypeOf<CreateCommentInput>().toEqualTypeOf<{ body: string }>();

        expect(createCommentSchema.parse({ body: "x".repeat(MAX_COMMENT_BODY_LENGTH) }).body).toHaveLength(
            MAX_COMMENT_BODY_LENGTH,
        );
        expect(createCommentSchema.parse({ body: `  ${"x".repeat(MAX_COMMENT_BODY_LENGTH)}  ` }).body).toHaveLength(
            MAX_COMMENT_BODY_LENGTH,
        );

        for (const invalid of [
            {},
            { body: "" },
            { body: "   \n\t  " },
            { body: "x".repeat(MAX_COMMENT_BODY_LENGTH + 1) },
            { body: "Valid comment", requestId: sampleRequestId },
            { body: "Valid comment", authorId: sampleUserId },
            { body: "Valid comment", unknownKey: true },
        ])
        {
            expect(createCommentSchema.safeParse(invalid).success).toBe(false);
        }
    });

    it("CMT-CT-03 validates commentQuerySchema defaults, coercion, and bounds", () =>
    {
        expect(commentQuerySchema.parse({})).toEqual({ pageNumber: 1, pageSize: 20 });
        expect(commentQuerySchema.parse({ pageNumber: "3", pageSize: "50" })).toEqual({ pageNumber: 3, pageSize: 50 });
        expect(commentQuerySchema.parse({ pageNumber: 10000, pageSize: 100 })).toEqual({ pageNumber: 10000, pageSize: 100 });
        expectTypeOf<CommentQuery>().toEqualTypeOf<{ pageNumber: number; pageSize: number }>();

        for (const invalid of [
            { pageNumber: 0 },
            { pageNumber: -1 },
            { pageNumber: 10001 },
            { pageNumber: 1.5 },
            { pageNumber: "abc" },
            { pageSize: 0 },
            { pageSize: -5 },
            { pageSize: 101 },
            { pageSize: 2.5 },
            { pageSize: "nan" },
            { pageNumber: 1, pageSize: 20, authorId: sampleUserId },
        ])
        {
            expect(commentQuerySchema.safeParse(invalid).success).toBe(false);
        }
    });

    it("ATT-CT-01 validates frozen AttachmentDTO shape and rejects private storage fields", () =>
    {
        const validAttachment: AttachmentDTO = {
            id: sampleAttachmentId,
            requestId: sampleRequestId,
            workingOrSubmittedRevisionId: sampleRevisionId,
            fileName: "vendor-quote.pdf",
            mediaType: "application/pdf",
            sizeBytes: 2048,
            uploadedBy: sampleUserId,
            uploadedAt: sampleTimestamp,
        };

        expect(attachmentSchema.parse(validAttachment)).toEqual(validAttachment);
        expect(attachmentSchema.parse({ ...validAttachment, sizeBytes: MAX_ATTACHMENT_BYTES }).sizeBytes).toBe(
            MAX_ATTACHMENT_BYTES,
        );

        for (const invalid of [
            { ...validAttachment, storageKey: "requests/r1/file.pdf" },
            { ...validAttachment, sha256: "a".repeat(64) },
            { ...validAttachment, bucket: "approval-system-attachments" },
            { ...validAttachment, signedUrl: "https://storage.googleapis.com/signed" },
            { ...validAttachment, extra: "unexpected" },
            { ...validAttachment, fileName: "" },
            { ...validAttachment, fileName: "a".repeat(256) },
            { ...validAttachment, sizeBytes: 0 },
            { ...validAttachment, sizeBytes: -1 },
            { ...validAttachment, sizeBytes: 12.5 },
            { ...validAttachment, sizeBytes: MAX_ATTACHMENT_BYTES + 1 },
            { ...validAttachment, uploadedAt: "2026-11-28T12:00:00+07:00" },
            { id: sampleAttachmentId, requestId: sampleRequestId },
        ])
        {
            expect(attachmentSchema.safeParse(invalid).success).toBe(false);
        }
    });

    it("ATT-CT-02 validates attachment constants, media types, and absence of storageKey", () =>
    {
        expect(ALLOWED_ATTACHMENT_MEDIA_TYPES).toEqual([
            "application/pdf",
            "image/png",
            "image/jpeg",
            "image/webp",
            "text/plain",
        ]);
        expect(MAX_ATTACHMENT_BYTES).toBe(10485760);
        expect(MAX_ATTACHMENTS_PER_REVISION).toBe(10);
        expect(MAX_COMMENT_BODY_LENGTH).toBe(4000);

        for (const mediaType of ALLOWED_ATTACHMENT_MEDIA_TYPES)
        {
            expect(attachmentMediaTypeSchema.parse(mediaType)).toBe(mediaType);
        }

        for (const disallowed of ["image/svg+xml", "text/html", "application/zip", "application/x-msdownload"])
        {
            expect(attachmentMediaTypeSchema.safeParse(disallowed).success).toBe(false);
            expect(
                attachmentSchema.safeParse({
                    id: sampleAttachmentId,
                    requestId: sampleRequestId,
                    workingOrSubmittedRevisionId: sampleRevisionId,
                    fileName: "bad.svg",
                    mediaType: disallowed,
                    sizeBytes: 128,
                    uploadedBy: sampleUserId,
                    uploadedAt: sampleTimestamp,
                }).success,
            ).toBe(false);
        }

        const schemaKeys = Object.keys(attachmentSchema.shape);
        expect(schemaKeys).not.toContain("storageKey");
        expect(schemaKeys).not.toContain("sha256");
        expect(schemaKeys).not.toContain("bucket");
        expect(schemaKeys).not.toContain("signedUrl");
        expectTypeOf<keyof AttachmentDTO>().toEqualTypeOf<
            "id" | "requestId" | "workingOrSubmittedRevisionId" | "fileName" | "mediaType" | "sizeBytes" | "uploadedBy" | "uploadedAt"
        >();
        expectTypeOf<AttachmentMediaType>().toEqualTypeOf<
            "application/pdf" | "image/png" | "image/jpeg" | "image/webp" | "text/plain"
        >();
    });

    it("ATT-CT-03 validates attachmentQuerySchema defaults, optional revisionId, and bounds", () =>
    {
        expect(attachmentQuerySchema.parse({})).toEqual({ pageNumber: 1, pageSize: 20 });
        expect(
            attachmentQuerySchema.parse({ pageNumber: "2", pageSize: "10", revisionId: sampleRevisionId }),
        ).toEqual({
            pageNumber: 2,
            pageSize: 10,
            revisionId: sampleRevisionId,
        });
        expectTypeOf<AttachmentQuery>().toEqualTypeOf<{
            pageNumber: number;
            pageSize: number;
            revisionId?: string | undefined;
        }>();

        for (const invalid of [
            { revisionId: "not-a-uuid" },
            { revisionId: "" },
            { pageNumber: 0 },
            { pageNumber: -1 },
            { pageNumber: 10001 },
            { pageNumber: 1.2 },
            { pageSize: 0 },
            { pageSize: -1 },
            { pageSize: 101 },
            { pageSize: 3.5 },
            { pageNumber: 1, pageSize: 20, storageKey: "forbidden" },
        ])
        {
            expect(attachmentQuerySchema.safeParse(invalid).success).toBe(false);
        }
    });

    it("ATT-CT-04 validates errorResponseSchema for 413 FILE_TOO_LARGE and 415 UNSUPPORTED_MEDIA_TYPE", () =>
    {
        const tooLargePayload = {
            statusCode: 413,
            code: "FILE_TOO_LARGE",
            message: "Upload exceeds the maximum permitted file size",
            error: "Payload Too Large",
            requestId: sampleRequestId,
        };
        const unsupportedMediaPayload = {
            statusCode: 415,
            code: "UNSUPPORTED_MEDIA_TYPE",
            message: "File type is not supported",
            error: "Unsupported Media Type",
            requestId: sampleRequestId,
        };

        expect(errorResponseSchema.parse(tooLargePayload)).toEqual(tooLargePayload);
        expect(errorResponseSchema.parse(unsupportedMediaPayload)).toEqual(unsupportedMediaPayload);

        for (const invalid of [
            { ...tooLargePayload, stack: "Error: internal" },
            { ...tooLargePayload, storageKey: "secret/key" },
            { ...unsupportedMediaPayload, details: [{ field: "file", code: "BAD", message: "bad", extra: "leak" }] },
        ])
        {
            expect(errorResponseSchema.safeParse(invalid).success).toBe(false);
        }
    });
});
