import type { AttachmentDTO, AttachmentMediaType, AttachmentQuery, IFieldIssue, IPageResult } from "@workflow/contracts";
import type { IActor } from "../Identity/Identity";
import type { IAttachmentRevisionContext, IRequestAccessContext } from "./RequestAccessPolicy";

export type PrivateObjectStorageErrorCode = "OBJECT_NOT_FOUND" | "STORAGE_UNAVAILABLE";

export class PrivateObjectStorageError extends Error
{
    constructor(public readonly code: PrivateObjectStorageErrorCode, message?: string)
    {
        super(message ?? code);
        this.name = "PrivateObjectStorageError";
    }
}

export interface IPutObjectInput
{
    storageKey: string;
    contentType: string;
    bytes: Uint8Array;
}

export interface IReadObjectStreamResult
{
    stream: ReadableStream<Uint8Array>;
    contentLength?: number;
}

export interface IHeadObjectResult
{
    exists: boolean;
    sizeBytes?: number;
    contentType?: string;
}

export interface IPrivateObjectStorage
{
    PutObject(input: IPutObjectInput): Promise<void>;
    ReadObjectStream(storageKey: string): Promise<IReadObjectStreamResult>;
    DeleteObject(storageKey: string): Promise<void>;
    HeadObject(storageKey: string): Promise<IHeadObjectResult>;
}

export type AttachmentCleanupReason = "UPLOAD_ABORTED" | "COMMIT_CONFLICT" | "WORKING_DELETED" | "STALE_RESERVATION";

export interface IAttachmentUploadReservation
{
    id: string;
    attachmentId: string;
    requestId: string;
    revisionId: string;
    uploadedBy: string;
    storageKey: string;
    fileName: string;
    mediaType: AttachmentMediaType;
    sizeBytes: number;
    sha256: string;
    status: "UPLOADING" | "FINALIZED" | "ABANDONED";
    expiresAt: Date;
}

export interface ICreateUploadReservationInput
{
    id: string;
    attachmentId: string;
    requestId: string;
    revisionId: string;
    uploadedBy: string;
    storageKey: string;
    fileName: string;
    mediaType: AttachmentMediaType;
    sizeBytes: number;
    sha256: string;
    expiresAt: Date;
}

export interface IFinalizeAttachmentUploadInput
{
    actor: IActor;
    reservationId: string;
    attachmentId: string;
    requestId: string;
    revisionId: string;
    uploadedBy: string;
    storageKey: string;
    fileName: string;
    mediaType: AttachmentMediaType;
    sizeBytes: number;
    sha256: string;
}

export type FinalizeAttachmentConflictCode =
    | "NOT_FOUND"
    | "FORBIDDEN"
    | "INVALID_REQUEST_TRANSITION"
    | "REQUEST_STALE"
    | "VALIDATION_ERROR";

export type FinalizeAttachmentUploadResult =
    | { status: "FINALIZED"; attachment: AttachmentDTO }
    | { status: "CONFLICT"; errorCode: FinalizeAttachmentConflictCode; details?: IFieldIssue[] };

export interface IAbandonReservationInput
{
    reservationId: string;
    attachmentId: string;
    storageKey: string;
    reason: "UPLOAD_ABORTED" | "COMMIT_CONFLICT";
}

export interface IAttachmentDownloadRecord
{
    attachment: AttachmentDTO;
    storageKey: string;
    requestContext: IRequestAccessContext;
    revisionContext: IAttachmentRevisionContext;
}

export interface IAttachmentRepository
{
    CurrentActor(actor: IActor): Promise<IActor>;
    ReadRequestAccessContext(requestId: string, lock?: false | "share" | "update"): Promise<IRequestAccessContext | null>;
    ListByRequest(requestId: string, query: AttachmentQuery, includeWorkingRevision: boolean): Promise<IPageResult<AttachmentDTO>>;
    CountRevisionAttachments(revisionId: string): Promise<number>;
    CreateUploadReservation(input: ICreateUploadReservationInput): Promise<IAttachmentUploadReservation>;
    FinalizeUpload(input: IFinalizeAttachmentUploadInput): Promise<FinalizeAttachmentUploadResult>;
    AbandonReservationAndEnqueueCleanup(input: IAbandonReservationInput): Promise<void>;
    DeleteWorkingAttachment(requestId: string, attachmentId: string, workingRevisionId: string): Promise<void>;
    FindForDownload(attachmentId: string): Promise<IAttachmentDownloadRecord | null>;
}

export interface IAttachmentUnitOfWork
{
    Run<T>(operation: (repository: IAttachmentRepository) => Promise<T>): Promise<T>;
}

export interface IClaimedCleanupJob
{
    id: string;
    reservationId: string | null;
    attachmentId: string;
    storageKey: string;
    reason: AttachmentCleanupReason;
    attemptCount: number;
    maxAttempts: number;
    claimToken: string;
}

export type CleanupJobFailureOutcome = "RETRY_SCHEDULED" | "FAILED" | "STALE_CLAIM";

export interface IAttachmentCleanupRepository
{
    ReconcileExpiredUploadingReservations(now: Date, limit: number): Promise<number>;
    ReconcileAbandonedTombstones(now: Date, limit: number): Promise<number>;
    ClaimDueJobs(now: Date, batchSize: number, leaseDurationMs: number): Promise<IClaimedCleanupJob[]>;
    MarkJobSucceeded(jobId: string, claimToken: string, now: Date): Promise<boolean>;
    MarkJobAttemptFailed(jobId: string, claimToken: string, errorMessage: string, now: Date): Promise<CleanupJobFailureOutcome>;
}
