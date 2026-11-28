import { randomUUID } from "node:crypto";
import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import { ComputeCleanupBackoffMinutes } from "../../../Applications/Requests/AttachmentCleanupWorker";
import type {
    CleanupJobFailureOutcome,
    IAttachmentCleanupRepository,
    IClaimedCleanupJob,
} from "../../../Domains/Requests/AttachmentPorts";
import type { Database } from "../Database";
import {
    attachmentCleanupJobs,
    attachments,
    attachmentUploadReservations,
} from "../schema";

type Connection = Database["connection"];

export class AttachmentCleanupRepository implements IAttachmentCleanupRepository
{
    constructor(private readonly db: Connection)
    {
    }

    public ReconcileExpiredUploadingReservations(now: Date, limit: number): Promise<number>
    {
        return this.db.transaction(async (tx) =>
        {
            const expired = await tx
                .select()
                .from(attachmentUploadReservations)
                .where(
                    and(
                        eq(attachmentUploadReservations.status, "UPLOADING"),
                        lte(attachmentUploadReservations.expiresAt, now),
                    ),
                )
                .orderBy(asc(attachmentUploadReservations.expiresAt), asc(attachmentUploadReservations.id))
                .limit(limit)
                .for("update", { skipLocked: true });

            for (const reservation of expired)
            {
                const existingAttachment = (await tx
                    .select({ id: attachments.id })
                    .from(attachments)
                    .where(eq(attachments.id, reservation.attachmentId)))[0];

                if (existingAttachment)
                {
                    await tx
                        .update(attachmentUploadReservations)
                        .set({
                            status: "FINALIZED",
                            finalizedAt: now,
                            updatedAt: now,
                        })
                        .where(eq(attachmentUploadReservations.id, reservation.id));
                    continue;
                }

                await tx
                    .update(attachmentUploadReservations)
                    .set({
                        status: "ABANDONED",
                        abandonedAt: now,
                        updatedAt: now,
                    })
                    .where(eq(attachmentUploadReservations.id, reservation.id));

                await tx
                    .insert(attachmentCleanupJobs)
                    .values({
                        id: randomUUID(),
                        reservationId: reservation.id,
                        attachmentId: reservation.attachmentId,
                        storageKey: reservation.storageKey,
                        reason: "STALE_RESERVATION",
                        status: "PENDING",
                        attemptCount: 0,
                        maxAttempts: 10,
                        nextAttemptAt: now,
                        createdAt: now,
                        updatedAt: now,
                    })
                    .onConflictDoNothing();
            }

            return expired.length;
        });
    }

    public ReconcileAbandonedTombstones(now: Date, limit: number): Promise<number>
    {
        return this.db.transaction(async (tx) =>
        {
            const tombstones = await tx
                .select()
                .from(attachmentUploadReservations)
                .where(
                    and(
                        eq(attachmentUploadReservations.status, "ABANDONED"),
                        sql`NOT EXISTS (
                            SELECT 1 FROM attachment_cleanup_jobs AS j
                            WHERE j.reservation_id = ${attachmentUploadReservations.id}
                               OR j.storage_key = ${attachmentUploadReservations.storageKey}
                        )`,
                    ),
                )
                .orderBy(asc(attachmentUploadReservations.abandonedAt), asc(attachmentUploadReservations.id))
                .limit(limit)
                .for("update", { skipLocked: true });

            for (const tombstone of tombstones)
            {
                await tx
                    .insert(attachmentCleanupJobs)
                    .values({
                        id: randomUUID(),
                        reservationId: tombstone.id,
                        attachmentId: tombstone.attachmentId,
                        storageKey: tombstone.storageKey,
                        reason: "STALE_RESERVATION",
                        status: "PENDING",
                        attemptCount: 0,
                        maxAttempts: 10,
                        nextAttemptAt: now,
                        createdAt: now,
                        updatedAt: now,
                    })
                    .onConflictDoNothing();
            }

            return tombstones.length;
        });
    }

    public ClaimDueJobs(now: Date, batchSize: number, leaseDurationMs: number): Promise<IClaimedCleanupJob[]>
    {
        return this.db.transaction(async (tx) =>
        {
            const dueJobs = await tx
                .select()
                .from(attachmentCleanupJobs)
                .where(
                    or(
                        and(eq(attachmentCleanupJobs.status, "PENDING"), lte(attachmentCleanupJobs.nextAttemptAt, now)),
                        and(eq(attachmentCleanupJobs.status, "PROCESSING"), lte(attachmentCleanupJobs.leaseExpiresAt, now)),
                    ),
                )
                .orderBy(
                    asc(attachmentCleanupJobs.nextAttemptAt),
                    asc(attachmentCleanupJobs.createdAt),
                    asc(attachmentCleanupJobs.id),
                )
                .limit(batchSize)
                .for("update", { skipLocked: true });

            const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
            const claimed: IClaimedCleanupJob[] = [];

            for (const job of dueJobs)
            {
                const claimToken = randomUUID();
                await tx
                    .update(attachmentCleanupJobs)
                    .set({
                        status: "PROCESSING",
                        claimToken,
                        leaseExpiresAt,
                        updatedAt: now,
                    })
                    .where(eq(attachmentCleanupJobs.id, job.id));

                claimed.push({
                    id: job.id,
                    reservationId: job.reservationId,
                    attachmentId: job.attachmentId,
                    storageKey: job.storageKey,
                    reason: job.reason,
                    attemptCount: job.attemptCount,
                    maxAttempts: job.maxAttempts,
                    claimToken,
                });
            }

            return claimed;
        });
    }

    public async MarkJobSucceeded(jobId: string, claimToken: string, now: Date): Promise<boolean>
    {
        const updated = await this.db
            .update(attachmentCleanupJobs)
            .set({
                status: "SUCCEEDED",
                completedAt: now,
                leaseExpiresAt: null,
                claimToken: null,
                updatedAt: now,
            })
            .where(and(eq(attachmentCleanupJobs.id, jobId), eq(attachmentCleanupJobs.claimToken, claimToken)))
            .returning({ id: attachmentCleanupJobs.id });

        return updated.length > 0;
    }

    public MarkJobAttemptFailed(
        jobId: string,
        claimToken: string,
        errorMessage: string,
        now: Date,
    ): Promise<CleanupJobFailureOutcome>
    {
        return this.db.transaction(async (tx) =>
        {
            const row = (await tx
                .select({
                    id: attachmentCleanupJobs.id,
                    attemptCount: attachmentCleanupJobs.attemptCount,
                    maxAttempts: attachmentCleanupJobs.maxAttempts,
                })
                .from(attachmentCleanupJobs)
                .where(and(eq(attachmentCleanupJobs.id, jobId), eq(attachmentCleanupJobs.claimToken, claimToken)))
                .for("update"))[0];

            if (!row)
            {
                return "STALE_CLAIM";
            }

            const nextAttemptCount = row.attemptCount + 1;
            const exhausted = nextAttemptCount >= row.maxAttempts;
            if (exhausted)
            {
                await tx
                    .update(attachmentCleanupJobs)
                    .set({
                        status: "FAILED",
                        attemptCount: nextAttemptCount,
                        lastError: errorMessage,
                        leaseExpiresAt: null,
                        claimToken: null,
                        updatedAt: now,
                    })
                    .where(and(eq(attachmentCleanupJobs.id, jobId), eq(attachmentCleanupJobs.claimToken, claimToken)));

                return "FAILED";
            }

            const delayMinutes = ComputeCleanupBackoffMinutes(nextAttemptCount);
            const nextAttemptAt = new Date(now.getTime() + delayMinutes * 60_000);
            await tx
                .update(attachmentCleanupJobs)
                .set({
                    status: "PENDING",
                    attemptCount: nextAttemptCount,
                    lastError: errorMessage,
                    nextAttemptAt,
                    leaseExpiresAt: null,
                    claimToken: null,
                    updatedAt: now,
                })
                .where(and(eq(attachmentCleanupJobs.id, jobId), eq(attachmentCleanupJobs.claimToken, claimToken)));

            return "RETRY_SCHEDULED";
        });
    }
}
