import { z } from "zod";

export const ALLOWED_ATTACHMENT_MEDIA_TYPES = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "text/plain",
] as const;

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_REVISION = 10;
export const MAX_COMMENT_BODY_LENGTH = 4000;

export const commentAuthorSchema = z.strictObject({
    id: z.uuid(),
    displayName: z.string().trim().min(1),
});

export const commentSchema = z.strictObject({
    id: z.uuid(),
    requestId: z.uuid(),
    author: commentAuthorSchema,
    body: z.string().min(1).max(MAX_COMMENT_BODY_LENGTH),
    createdAt: z.iso.datetime(),
});

export const createCommentSchema = z.strictObject({
    body: z.string().trim().min(1).max(MAX_COMMENT_BODY_LENGTH),
});

export const commentQuerySchema = z.strictObject({
    pageNumber: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const attachmentMediaTypeSchema = z.enum(ALLOWED_ATTACHMENT_MEDIA_TYPES);

export const attachmentSchema = z.strictObject({
    id: z.uuid(),
    requestId: z.uuid(),
    workingOrSubmittedRevisionId: z.uuid(),
    fileName: z.string().min(1).max(255),
    mediaType: attachmentMediaTypeSchema,
    sizeBytes: z.number().int().min(1).max(MAX_ATTACHMENT_BYTES),
    uploadedBy: z.uuid(),
    uploadedAt: z.iso.datetime(),
});

export const attachmentQuerySchema = z.strictObject({
    pageNumber: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    revisionId: z.uuid().optional(),
});

export type CommentAuthor = z.infer<typeof commentAuthorSchema>;
export type CommentDTO = z.infer<typeof commentSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type CommentQuery = z.infer<typeof commentQuerySchema>;
export type AttachmentMediaType = z.infer<typeof attachmentMediaTypeSchema>;
export type AttachmentDTO = z.infer<typeof attachmentSchema>;
export type AttachmentQuery = z.infer<typeof attachmentQuerySchema>;
