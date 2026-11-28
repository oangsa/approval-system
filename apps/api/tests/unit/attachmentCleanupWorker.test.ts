import { describe, expect, it, vi } from "vitest";
import {
    AttachmentCleanupWorker,
    ComputeCleanupBackoffMinutes,
} from "../../src/Applications/Requests/AttachmentCleanupWorker";
import {
    PrivateObjectStorageError,
    type IAttachmentCleanupRepository,
    type IClaimedCleanupJob,
    type IPrivateObjectStorage,
} from "../../src/Domains/Requests/AttachmentPorts";

const NOW = new Date("2026-11-28T06:00:00.000Z");

describe("AttachmentCleanupWorker", () =>
{
    it("ATT-UT-12 computes exponential backoff [1, 2, 4, 8, 16, 32, 60, 60, 60] minutes and transitions attempt 10 to FAILED", async () =>
    {
        const delays = [1, 2, 4, 8, 16, 32, 60, 60, 60];
        for (let attempt = 1; attempt <= 9; attempt++)
        {
            expect(ComputeCleanupBackoffMinutes(attempt)).toBe(delays[attempt - 1]);
        }

        const jobOnTenthAttempt: IClaimedCleanupJob = {
            id: "10000000-0000-4000-8000-000000000001",
            reservationId: null,
            attachmentId: "20000000-0000-4000-8000-000000000001",
            storageKey: "attachments/req/rev/att",
            reason: "WORKING_DELETED",
            attemptCount: 9,
            maxAttempts: 10,
            claimToken: "30000000-0000-4000-8000-000000000001",
        };

        const repository: IAttachmentCleanupRepository = {
            ReconcileExpiredUploadingReservations: vi.fn(async () => 0),
            ReconcileAbandonedTombstones: vi.fn(async () => 0),
            ClaimDueJobs: vi.fn(async () => [jobOnTenthAttempt]),
            MarkJobSucceeded: vi.fn(async () => true),
            MarkJobAttemptFailed: vi.fn(async () => "FAILED" as const),
        };

        const storage: IPrivateObjectStorage = {
            PutObject: vi.fn(),
            ReadObjectStream: vi.fn(),
            DeleteObject: vi.fn(async () =>
            {
                throw new Error("gs://secret-bucket/attachments/req/rev/att failed");
            }),
            HeadObject: vi.fn(),
        };

        const worker = new AttachmentCleanupWorker(repository, storage, () => NOW);
        const summary = await worker.RunOnce();

        expect(summary).toEqual({
            reconciledUploading: 0,
            reconciledTombstones: 0,
            claimedJobs: 1,
            succeededJobs: 0,
            retriedJobs: 0,
            failedJobs: 1,
            staleClaims: 0,
        });
        expect(repository.MarkJobAttemptFailed).toHaveBeenCalledWith(
            jobOnTenthAttempt.id,
            jobOnTenthAttempt.claimToken,
            expect.not.stringContaining("attachments/req/rev/att"),
            NOW,
        );
    });

    it("ATT-UT-13 treats OBJECT_NOT_FOUND as idempotent SUCCEEDED and schedules backoff on transient errors", async () =>
    {
        const notFoundJob: IClaimedCleanupJob = {
            id: "10000000-0000-4000-8000-000000000001",
            reservationId: null,
            attachmentId: "20000000-0000-4000-8000-000000000001",
            storageKey: "attachments/req/rev/missing",
            reason: "STALE_RESERVATION",
            attemptCount: 0,
            maxAttempts: 10,
            claimToken: "30000000-0000-4000-8000-000000000001",
        };
        const transientErrorJob: IClaimedCleanupJob = {
            id: "10000000-0000-4000-8000-000000000002",
            reservationId: null,
            attachmentId: "20000000-0000-4000-8000-000000000002",
            storageKey: "attachments/req/rev/outage",
            reason: "WORKING_DELETED",
            attemptCount: 0,
            maxAttempts: 10,
            claimToken: "30000000-0000-4000-8000-000000000002",
        };

        const repository: IAttachmentCleanupRepository = {
            ReconcileExpiredUploadingReservations: vi.fn(async () => 1),
            ReconcileAbandonedTombstones: vi.fn(async () => 2),
            ClaimDueJobs: vi.fn(async () => [notFoundJob, transientErrorJob]),
            MarkJobSucceeded: vi.fn(async () => true),
            MarkJobAttemptFailed: vi.fn(async () => "RETRY_SCHEDULED" as const),
        };

        const storage: IPrivateObjectStorage = {
            PutObject: vi.fn(),
            ReadObjectStream: vi.fn(),
            DeleteObject: vi.fn(async (key) =>
            {
                if (key === notFoundJob.storageKey)
                {
                    throw new PrivateObjectStorageError("OBJECT_NOT_FOUND");
                }
                throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE", "Transient storage outage");
            }),
            HeadObject: vi.fn(),
        };

        const worker = new AttachmentCleanupWorker(repository, storage, () => NOW);
        const summary = await worker.RunOnce();

        expect(summary).toEqual({
            reconciledUploading: 1,
            reconciledTombstones: 2,
            claimedJobs: 2,
            succeededJobs: 1,
            retriedJobs: 1,
            failedJobs: 0,
            staleClaims: 0,
        });
        expect(repository.MarkJobSucceeded).toHaveBeenCalledWith(notFoundJob.id, notFoundJob.claimToken, NOW);
        expect(repository.MarkJobAttemptFailed).toHaveBeenCalledWith(
            transientErrorJob.id,
            transientErrorJob.claimToken,
            "STORAGE_UNAVAILABLE",
            NOW,
        );
    });
});
