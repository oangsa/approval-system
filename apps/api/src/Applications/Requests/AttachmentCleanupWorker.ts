import {
    PrivateObjectStorageError,
    type IAttachmentCleanupRepository,
    type IPrivateObjectStorage,
} from "../../Domains/Requests/AttachmentPorts";

const BACKOFF_SCHEDULE_MINUTES = [1, 2, 4, 8, 16, 32, 60, 60, 60] as const;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_RECONCILE_LIMIT = 100;
const DEFAULT_LEASE_DURATION_MS = 5 * 60 * 1000;
const MAX_ERROR_MESSAGE_LENGTH = 500;

export interface IAttachmentCleanupRunOptions
{
    now?: Date;
    batchSize?: number;
    reconcileLimit?: number;
    leaseDurationMs?: number;
}

export interface IAttachmentCleanupRunSummary
{
    reconciledUploading: number;
    reconciledTombstones: number;
    claimedJobs: number;
    succeededJobs: number;
    retriedJobs: number;
    failedJobs: number;
    staleClaims: number;
}

/**
 * Computes exponential backoff delay in minutes before the next cleanup retry:
 * [1, 2, 4, 8, 16, 32, 60, 60, 60] for attempts 1..9 before terminal FAILED on attempt 10.
 */
export function ComputeCleanupBackoffMinutes(attemptCount: number): number
{
    if (!Number.isInteger(attemptCount) || attemptCount <= 1)
    {
        return BACKOFF_SCHEDULE_MINUTES[0];
    }

    const index = Math.min(attemptCount - 1, BACKOFF_SCHEDULE_MINUTES.length - 1);
    return BACKOFF_SCHEDULE_MINUTES[index]!;
}

function sanitizeCleanupError(error: unknown, storageKey: string): string
{
    if (error instanceof PrivateObjectStorageError)
    {
        return error.code;
    }

    if (error instanceof Error)
    {
        const sanitized = error.message
            .split(storageKey).join("[redacted]")
            .replace(/gs:\/\/[^\s]+/gi, "[redacted]")
            .replace(/https?:\/\/[^\s]+/gi, "[redacted]")
            .replace(/[\r\n\t]+/g, " ")
            .trim();
        if (sanitized)
        {
            return sanitized.slice(0, MAX_ERROR_MESSAGE_LENGTH);
        }
    }

    return "STORAGE_CLEANUP_FAILED";
}

/**
 * Coordinates durable upload reservation reconciliation, tombstone recovery,
 * leased job claiming, and idempotent object deletion retries.
 */
export class AttachmentCleanupWorker
{
    constructor(
        private readonly repository: IAttachmentCleanupRepository,
        private readonly storage: IPrivateObjectStorage,
        private readonly now: () => Date = () => new Date(),
    )
    {
    }

    public async RunOnce(options: IAttachmentCleanupRunOptions = {}): Promise<IAttachmentCleanupRunSummary>
    {
        const now = options.now ?? this.now();
        const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
        const reconcileLimit = options.reconcileLimit ?? DEFAULT_RECONCILE_LIMIT;
        const leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;

        const reconciledUploading = await this.repository.ReconcileExpiredUploadingReservations(now, reconcileLimit);
        const reconciledTombstones = await this.repository.ReconcileAbandonedTombstones(now, reconcileLimit);
        const claimed = await this.repository.ClaimDueJobs(now, batchSize, leaseDurationMs);

        let succeededJobs = 0;
        let retriedJobs = 0;
        let failedJobs = 0;
        let staleClaims = 0;

        for (const job of claimed)
        {
            try
            {
                await this.storage.DeleteObject(job.storageKey);
                const marked = await this.repository.MarkJobSucceeded(job.id, job.claimToken, now);
                if (marked)
                {
                    succeededJobs++;
                }
                else
                {
                    staleClaims++;
                }
            }
            catch (error)
            {
                if (error instanceof PrivateObjectStorageError && error.code === "OBJECT_NOT_FOUND")
                {
                    const marked = await this.repository.MarkJobSucceeded(job.id, job.claimToken, now);
                    if (marked)
                    {
                        succeededJobs++;
                    }
                    else
                    {
                        staleClaims++;
                    }
                    continue;
                }

                const outcome = await this.repository.MarkJobAttemptFailed(
                    job.id,
                    job.claimToken,
                    sanitizeCleanupError(error, job.storageKey),
                    now,
                );
                if (outcome === "RETRY_SCHEDULED")
                {
                    retriedJobs++;
                }
                else if (outcome === "FAILED")
                {
                    failedJobs++;
                }
                else
                {
                    staleClaims++;
                }
            }
        }

        return {
            reconciledUploading,
            reconciledTombstones,
            claimedJobs: claimed.length,
            succeededJobs,
            retriedJobs,
            failedJobs,
            staleClaims,
        };
    }
}
