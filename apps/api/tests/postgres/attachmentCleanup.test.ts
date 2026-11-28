import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, expect, test } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
    attachmentSchema,
    type CreateRequest,
    type PublishedRequestType,
    type UserRole,
} from "@workflow/contracts";
import { createTestDatabase } from "../helpers/testDatabase";
import { AttachmentCleanupWorker } from "../../src/Applications/Requests/AttachmentCleanupWorker";
import { AttachmentService } from "../../src/Applications/Requests/AttachmentService";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import type { IActor } from "../../src/Domains/Identity/Identity";
import { PrivateObjectStorageError } from "../../src/Domains/Requests/AttachmentPorts";
import { readEnvironment } from "../../src/Infrastructures/Configuration/environment";
import { AttachmentCleanupRepository } from "../../src/Infrastructures/Database/Repositories/AttachmentCleanupRepository";
import { AttachmentUnitOfWork } from "../../src/Infrastructures/Database/Repositories/AttachmentRepository";
import { IdentityRepository } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import { RequestUnitOfWork } from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { seededDefinition } from "../../src/Infrastructures/Database/seedRequests";
import { assertTestDatabaseTarget } from "../../src/Infrastructures/Database/testDatabaseTargetGuard";
import {
    approvalPolicyVersions,
    attachmentCleanupJobs,
    attachments,
    attachmentUploadReservations,
    departmentMemberships,
    departments,
    requestTypes,
    requestTypeVersions,
    reviewerAssignmentRules,
    sessionFamilies,
    userRoles,
    users,
} from "../../src/Infrastructures/Database/schema";
import { TokenProvider } from "../../src/Infrastructures/Security/TokenProvider";
import { InMemoryPrivateObjectStorage } from "../../src/Infrastructures/Storage";
import { createIdentityComposition } from "../../src/Presentations/composition";
import { createApplication } from "../../src/Presentations/createApplication";

const execFileAsync = promisify(execFile);

const database = createTestDatabase();
const observer = createTestDatabase();
const db = database.connection;

const requestService = new RequestService(new RequestUnitOfWork(db));

afterAll(async () =>
{
    await database.Close();
    await observer.Close();
});

function sha256Hex(bytes: Uint8Array): string
{
    return createHash("sha256").update(bytes).digest("hex");
}

function pdfBytes(label: string): Uint8Array
{
    return new TextEncoder().encode(`%PDF-1.7\n%cleanup-${label}\n`);
}

async function seedActor(displayName: string, roles: readonly UserRole[]): Promise<{ id: string; actor: IActor }>
{
    const id = randomUUID();
    const familyId = randomUUID();
    await db.transaction(async (tx) =>
    {
        await tx.insert(users).values({
            id,
            email: `${id}@example.test`,
            displayName,
            passwordHash: "not-for-login",
        });
        await tx.insert(userRoles).values(roles.map((roleCode) => ({ userId: id, roleCode })));
        await tx.insert(sessionFamilies).values({
            id: familyId,
            userId: id,
            authVersion: 0,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 3_600_000),
        });
    });

    const actor = (await new IdentityRepository(db).ReadCurrentIdentity(id, familyId))!;
    return { id, actor };
}

async function seedDraftFixture()
{
    const owner = await seedActor("Cleanup Owner", ["REQUESTER"]);
    const reviewer = await seedActor("Cleanup Reviewer", ["REVIEWER"]);
    const departmentId = randomUUID();
    const typeId = randomUUID();
    const versionId = randomUUID();
    const policyId = randomUUID();

    const definition: PublishedRequestType = {
        ...seededDefinition,
        id: typeId,
        versionId,
        code: `REC_${typeId.slice(0, 8)}`,
        monetary: false,
        supportsLineItems: false,
    };

    await db.transaction(async (tx) =>
    {
        await tx.insert(departments).values({
            id: departmentId,
            code: `DEPT_${departmentId.slice(0, 8)}`,
            name: "Operations",
        });
        await tx.insert(departmentMemberships).values({
            userId: owner.id,
            departmentId,
            isPrimary: true,
        });
        await tx.insert(requestTypes).values({ id: typeId, code: definition.code });
        await tx.insert(requestTypeVersions).values({
            id: versionId,
            typeId,
            versionNumber: 1,
            definition,
        });
        await tx.update(requestTypes).set({ publishedVersionId: versionId }).where(eq(requestTypes.id, typeId));
        await tx.insert(approvalPolicyVersions).values({
            id: policyId,
            typeId,
            code: `POL_${policyId.slice(0, 8)}`,
            versionNumber: 1,
            priority: 1,
            stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 480 }],
        });
        await tx.insert(reviewerAssignmentRules).values({
            id: randomUUID(),
            assignmentKey: "review",
            departmentId,
            reviewerId: reviewer.id,
        });
    });

    const content: CreateRequest = {
        typeId,
        formDefinitionVersionId: versionId,
        title: "Cleanup test request",
        justification: "Verify durable reservation reconciliation and cleanup worker",
        priority: "MEDIUM",
        fields: { category: "OPERATIONS" },
    };

    const draft = await requestService.Mutate(owner.actor, "create", null, content, randomUUID());
    return {
        owner,
        draft,
        requestId: draft.id,
        workingRevisionId: draft.workingRevision!.id,
    };
}

test("ATT-REC-01 expired UPLOADING reservation with committed attachments row heals to FINALIZED and preserves live object", async () =>
{
    const fx = await seedDraftFixture();
    const attachmentId = randomUUID();
    const reservationId = randomUUID();
    const storageKey = `attachments/${fx.requestId}/${fx.workingRevisionId}/${attachmentId}`;
    const payload = pdfBytes("rec-01");
    const now = new Date();
    const storage = new InMemoryPrivateObjectStorage();
    await storage.PutObject({ storageKey, contentType: "application/pdf", bytes: payload });

    await db.transaction(async (tx) =>
    {
        await tx.insert(attachments).values({
            id: attachmentId,
            requestId: fx.requestId,
            revisionId: fx.workingRevisionId,
            uploadedBy: fx.owner.id,
            fileName: "committed.pdf",
            mediaType: "application/pdf",
            sizeBytes: payload.byteLength,
            storageKey,
            sha256: sha256Hex(payload),
            uploadedAt: new Date(now.getTime() - 120_000),
        });
        await tx.insert(attachmentUploadReservations).values({
            id: reservationId,
            attachmentId,
            requestId: fx.requestId,
            revisionId: fx.workingRevisionId,
            uploadedBy: fx.owner.id,
            storageKey,
            fileName: "committed.pdf",
            mediaType: "application/pdf",
            sizeBytes: payload.byteLength,
            sha256: sha256Hex(payload),
            status: "UPLOADING",
            createdAt: new Date(now.getTime() - 400_000),
            updatedAt: new Date(now.getTime() - 400_000),
            expiresAt: new Date(now.getTime() - 60_000),
        });
    });

    try
    {
        const worker = new AttachmentCleanupWorker(new AttachmentCleanupRepository(db), storage, () => now);
        const summary = await worker.RunOnce({ now });
        expect(summary.reconciledUploading).toBeGreaterThanOrEqual(1);

        const healed = (await observer.connection
            .select()
            .from(attachmentUploadReservations)
            .where(eq(attachmentUploadReservations.id, reservationId)))[0]!;
        expect(healed.status).toBe("FINALIZED");
        expect(healed.finalizedAt).not.toBeNull();
        expect(storage.Has(storageKey)).toBe(true);
        expect(await observer.connection.select().from(attachments).where(eq(attachments.id, attachmentId))).toHaveLength(1);
        expect(await observer.connection.select().from(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.storageKey, storageKey))).toHaveLength(0);
    }
    finally
    {
        await db.delete(attachmentUploadReservations).where(eq(attachmentUploadReservations.id, reservationId));
        await db.delete(attachments).where(eq(attachments.id, attachmentId));
    }
});

test("ATT-REC-02 expired UPLOADING reservation without attachments row transitions to ABANDONED, deletes orphan object, and marks job SUCCEEDED", async () =>
{
    const fx = await seedDraftFixture();
    const attachmentId = randomUUID();
    const reservationId = randomUUID();
    const storageKey = `attachments/${fx.requestId}/${fx.workingRevisionId}/${attachmentId}`;
    const payload = pdfBytes("rec-02");
    const now = new Date();
    const storage = new InMemoryPrivateObjectStorage();
    await storage.PutObject({ storageKey, contentType: "application/pdf", bytes: payload });

    await db.insert(attachmentUploadReservations).values({
        id: reservationId,
        attachmentId,
        requestId: fx.requestId,
        revisionId: fx.workingRevisionId,
        uploadedBy: fx.owner.id,
        storageKey,
        fileName: "orphan.pdf",
        mediaType: "application/pdf",
        sizeBytes: payload.byteLength,
        sha256: sha256Hex(payload),
        status: "UPLOADING",
        createdAt: new Date(now.getTime() - 400_000),
        updatedAt: new Date(now.getTime() - 400_000),
        expiresAt: new Date(now.getTime() - 60_000),
    });

    try
    {
        const worker = new AttachmentCleanupWorker(new AttachmentCleanupRepository(db), storage, () => now);
        const summary = await worker.RunOnce({ now });
        expect(summary.reconciledUploading).toBeGreaterThanOrEqual(1);
        expect(summary.succeededJobs).toBeGreaterThanOrEqual(1);

        const abandoned = (await observer.connection
            .select()
            .from(attachmentUploadReservations)
            .where(eq(attachmentUploadReservations.id, reservationId)))[0]!;
        expect(abandoned.status).toBe("ABANDONED");
        expect(abandoned.abandonedAt).not.toBeNull();
        expect(storage.Has(storageKey)).toBe(false);

        const jobs = await observer.connection
            .select()
            .from(attachmentCleanupJobs)
            .where(eq(attachmentCleanupJobs.reservationId, reservationId));
        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({
            reason: "STALE_RESERVATION",
            status: "SUCCEEDED",
            storageKey,
        });
        expect(jobs[0]?.completedAt).not.toBeNull();
    }
    finally
    {
        await db.delete(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.reservationId, reservationId));
        await db.delete(attachmentUploadReservations).where(eq(attachmentUploadReservations.id, reservationId));
    }
});

test("ATT-REC-03 unexpired UPLOADING reservation is left untouched", async () =>
{
    const fx = await seedDraftFixture();
    const attachmentId = randomUUID();
    const reservationId = randomUUID();
    const storageKey = `attachments/${fx.requestId}/${fx.workingRevisionId}/${attachmentId}`;
    const payload = pdfBytes("rec-03");
    const now = new Date();
    const storage = new InMemoryPrivateObjectStorage();
    await storage.PutObject({ storageKey, contentType: "application/pdf", bytes: payload });

    await db.insert(attachmentUploadReservations).values({
        id: reservationId,
        attachmentId,
        requestId: fx.requestId,
        revisionId: fx.workingRevisionId,
        uploadedBy: fx.owner.id,
        storageKey,
        fileName: "inflight.pdf",
        mediaType: "application/pdf",
        sizeBytes: payload.byteLength,
        sha256: sha256Hex(payload),
        status: "UPLOADING",
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(now.getTime() + 180_000),
    });

    try
    {
        const worker = new AttachmentCleanupWorker(new AttachmentCleanupRepository(db), storage, () => now);
        await worker.RunOnce({ now });

        const current = (await observer.connection
            .select()
            .from(attachmentUploadReservations)
            .where(eq(attachmentUploadReservations.id, reservationId)))[0]!;
        expect(current.status).toBe("UPLOADING");
        expect(current.finalizedAt).toBeNull();
        expect(current.abandonedAt).toBeNull();
        expect(storage.Has(storageKey)).toBe(true);
        expect(await observer.connection.select().from(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.storageKey, storageKey))).toHaveLength(0);
    }
    finally
    {
        await db.delete(attachmentUploadReservations).where(eq(attachmentUploadReservations.id, reservationId));
    }
});

test("ATT-REC-04 ABANDONED tombstone missing cleanup job is reconciled and orphan object is deleted", async () =>
{
    const fx = await seedDraftFixture();
    const attachmentId = randomUUID();
    const reservationId = randomUUID();
    const storageKey = `attachments/${fx.requestId}/${fx.workingRevisionId}/${attachmentId}`;
    const payload = pdfBytes("rec-04");
    const now = new Date();
    const storage = new InMemoryPrivateObjectStorage();
    await storage.PutObject({ storageKey, contentType: "application/pdf", bytes: payload });

    await db.insert(attachmentUploadReservations).values({
        id: reservationId,
        attachmentId,
        requestId: fx.requestId,
        revisionId: fx.workingRevisionId,
        uploadedBy: fx.owner.id,
        storageKey,
        fileName: "tombstone.pdf",
        mediaType: "application/pdf",
        sizeBytes: payload.byteLength,
        sha256: sha256Hex(payload),
        status: "ABANDONED",
        createdAt: new Date(now.getTime() - 120_000),
        updatedAt: new Date(now.getTime() - 60_000),
        expiresAt: new Date(now.getTime() - 60_000),
        abandonedAt: new Date(now.getTime() - 60_000),
    });

    try
    {
        const worker = new AttachmentCleanupWorker(new AttachmentCleanupRepository(db), storage, () => now);
        const summary = await worker.RunOnce({ now });
        expect(summary.reconciledTombstones).toBeGreaterThanOrEqual(1);
        expect(summary.succeededJobs).toBeGreaterThanOrEqual(1);
        expect(storage.Has(storageKey)).toBe(false);

        const jobs = await observer.connection
            .select()
            .from(attachmentCleanupJobs)
            .where(eq(attachmentCleanupJobs.reservationId, reservationId));
        expect(jobs).toHaveLength(1);
        expect(jobs[0]).toMatchObject({
            reason: "STALE_RESERVATION",
            status: "SUCCEEDED",
            storageKey,
        });
    }
    finally
    {
        await db.delete(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.reservationId, reservationId));
        await db.delete(attachmentUploadReservations).where(eq(attachmentUploadReservations.id, reservationId));
    }
});

test("ATT-REC-05 concurrent worker runs use FOR UPDATE SKIP LOCKED to claim disjoint jobs and delete each object once", async () =>
{
    const now = new Date();
    const storage = new InMemoryPrivateObjectStorage();
    const deleteCounts = new Map<string, number>();

    storage.SetFaultHooks({
        onDeleteObject: async (key) =>
        {
            deleteCounts.set(key, (deleteCounts.get(key) ?? 0) + 1);
            await Promise.resolve();
        },
    });

    const jobSpecs = Array.from({ length: 6 }, (_, index) =>
    {
        const id = randomUUID();
        const attachmentId = randomUUID();
        return {
            id,
            attachmentId,
            storageKey: `attachments/skip-locked/${index}/${attachmentId}`,
        };
    });

    for (const spec of jobSpecs)
    {
        await storage.PutObject({
            storageKey: spec.storageKey,
            contentType: "application/pdf",
            bytes: pdfBytes(spec.id),
        });
    }

    await db.insert(attachmentCleanupJobs).values(
        jobSpecs.map((spec, index) => ({
            id: spec.id,
            reservationId: null,
            attachmentId: spec.attachmentId,
            storageKey: spec.storageKey,
            reason: "WORKING_DELETED" as const,
            status: "PENDING" as const,
            attemptCount: 0,
            maxAttempts: 10,
            nextAttemptAt: new Date(now.getTime() - (10 - index) * 1000),
            createdAt: now,
            updatedAt: now,
        })),
    );

    const jobIds = jobSpecs.map((spec) => spec.id);
    try
    {
        // Hold explicit FOR UPDATE row locks on the first two jobs and prove ClaimDueJobs skips them immediately.
        const lockedIds = [jobSpecs[0]!.id, jobSpecs[1]!.id];
        const unlockedIds = jobSpecs.slice(2).map((spec) => spec.id);
        let lockAcquired!: () => void;
        let releaseLock!: () => void;
        const lockReady = new Promise<void>((resolve) =>
        {
            lockAcquired = resolve;
        });
        const lockHold = new Promise<void>((resolve) =>
        {
            releaseLock = resolve;
        });

        const lockHolder = db.transaction(async (tx) =>
        {
            await tx.execute(sql`
                SELECT id FROM public.attachment_cleanup_jobs
                WHERE id IN (${lockedIds[0]}, ${lockedIds[1]})
                FOR UPDATE
            `);
            lockAcquired();
            await lockHold;
        });

        let claimedWhileLocked: Awaited<ReturnType<AttachmentCleanupRepository["ClaimDueJobs"]>>;
        try
        {
            await lockReady;
            const observerRepo = new AttachmentCleanupRepository(observer.connection);
            claimedWhileLocked = await observerRepo.ClaimDueJobs(now, 10, 60_000);
        }
        finally
        {
            releaseLock();
            await lockHolder;
        }

        const claimedLockedSet = new Set(claimedWhileLocked.map((job) => job.id));
        for (const id of lockedIds)
        {
            expect(claimedLockedSet.has(id)).toBe(false);
        }
        for (const id of unlockedIds)
        {
            expect(claimedLockedSet.has(id)).toBe(true);
        }

        // Reset all 6 jobs back to PENDING so two concurrent AttachmentCleanupWorker runs race over the full batch.
        await db
            .update(attachmentCleanupJobs)
            .set({
                status: "PENDING",
                claimToken: null,
                leaseExpiresAt: null,
                updatedAt: now,
            })
            .where(inArray(attachmentCleanupJobs.id, jobIds));

        const workerA = new AttachmentCleanupWorker(new AttachmentCleanupRepository(db), storage, () => now);
        const workerB = new AttachmentCleanupWorker(new AttachmentCleanupRepository(observer.connection), storage, () => now);

        const [summaryA, summaryB] = await Promise.all([
            workerA.RunOnce({ now, batchSize: 3 }),
            workerB.RunOnce({ now, batchSize: 3 }),
        ]);

        expect(summaryA.claimedJobs + summaryB.claimedJobs).toBe(6);
        expect(summaryA.succeededJobs + summaryB.succeededJobs).toBe(6);
        expect(summaryA.staleClaims + summaryB.staleClaims).toBe(0);

        for (const spec of jobSpecs)
        {
            expect(deleteCounts.get(spec.storageKey)).toBe(1);
            expect(storage.Has(spec.storageKey)).toBe(false);
        }

        const completedRows = await observer.connection
            .select()
            .from(attachmentCleanupJobs)
            .where(inArray(attachmentCleanupJobs.id, jobIds));
        expect(completedRows.every((row) => row.status === "SUCCEEDED")).toBe(true);
    }
    finally
    {
        await db.delete(attachmentCleanupJobs).where(inArray(attachmentCleanupJobs.id, jobIds));
    }
});

test("ATT-REC-06 expired PROCESSING lease is reclaimed by second worker while stale claim_token updates 0 rows", async () =>
{
    const now = new Date();
    const jobId = randomUUID();
    const attachmentId = randomUUID();
    const staleClaimToken = randomUUID();
    const storageKey = `attachments/lease-reclaim/${attachmentId}`;
    const storage = new InMemoryPrivateObjectStorage();
    await storage.PutObject({ storageKey, contentType: "application/pdf", bytes: pdfBytes("rec-06") });

    await db.insert(attachmentCleanupJobs).values({
        id: jobId,
        reservationId: null,
        attachmentId,
        storageKey,
        reason: "WORKING_DELETED",
        status: "PROCESSING",
        attemptCount: 0,
        maxAttempts: 10,
        nextAttemptAt: new Date(now.getTime() - 600_000),
        leaseExpiresAt: new Date(now.getTime() - 10_000),
        claimToken: staleClaimToken,
        createdAt: new Date(now.getTime() - 600_000),
        updatedAt: new Date(now.getTime() - 310_000),
    });

    try
    {
        const observerRepo = new AttachmentCleanupRepository(observer.connection);
        const workerB = new AttachmentCleanupWorker(observerRepo, storage, () => now);
        const summary = await workerB.RunOnce({ now });
        expect(summary.claimedJobs).toBeGreaterThanOrEqual(1);
        expect(summary.succeededJobs).toBeGreaterThanOrEqual(1);
        expect(storage.Has(storageKey)).toBe(false);

        const staleRepo = new AttachmentCleanupRepository(db);
        expect(await staleRepo.MarkJobSucceeded(jobId, staleClaimToken, now)).toBe(false);
        expect(await staleRepo.MarkJobAttemptFailed(jobId, staleClaimToken, "STALE_WORKER_ERROR", now)).toBe("STALE_CLAIM");

        const row = (await observer.connection.select().from(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.id, jobId)))[0]!;
        expect(row.status).toBe("SUCCEEDED");
        expect(row.claimToken).toBeNull();
        expect(row.leaseExpiresAt).toBeNull();
        expect(row.lastError).toBeNull();
    }
    finally
    {
        await db.delete(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.id, jobId));
    }
});

test("ATT-REC-07 fault-injectable storage fails attempts 1..3 with sanitized errors and backoff (+1m, +2m, +4m) then succeeds on attempt 4", async () =>
{
    const baseTime = new Date("2026-11-28T06:00:00.000Z");
    const jobId = randomUUID();
    const attachmentId = randomUUID();
    const storageKey = `attachments/backoff/${attachmentId}`;
    const storage = new InMemoryPrivateObjectStorage();
    await storage.PutObject({ storageKey, contentType: "application/pdf", bytes: pdfBytes("rec-07") });

    let deleteAttempts = 0;
    storage.SetFaultHooks({
        onDeleteObject: async (key) =>
        {
            deleteAttempts++;
            if (deleteAttempts <= 3)
            {
                throw new Error(`gs://approval-system-attachments/${key} transient outage #${deleteAttempts}`);
            }
        },
    });

    await db.insert(attachmentCleanupJobs).values({
        id: jobId,
        reservationId: null,
        attachmentId,
        storageKey,
        reason: "COMMIT_CONFLICT",
        status: "PENDING",
        attemptCount: 0,
        maxAttempts: 10,
        nextAttemptAt: baseTime,
        createdAt: baseTime,
        updatedAt: baseTime,
    });

    try
    {
        const worker = new AttachmentCleanupWorker(new AttachmentCleanupRepository(db), storage);

        const t1 = baseTime;
        const r1 = await worker.RunOnce({ now: t1 });
        expect(r1.retriedJobs).toBe(1);
        const j1 = (await observer.connection.select().from(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.id, jobId)))[0]!;
        expect(j1.status).toBe("PENDING");
        expect(j1.attemptCount).toBe(1);
        expect(j1.nextAttemptAt.getTime()).toBe(t1.getTime() + 1 * 60_000);
        expect(j1.lastError).toBe("[redacted] transient outage #1");
        expect(j1.lastError).not.toContain(storageKey);

        const t2 = new Date(t1.getTime() + 1 * 60_000);
        const r2 = await worker.RunOnce({ now: t2 });
        expect(r2.retriedJobs).toBe(1);
        const j2 = (await observer.connection.select().from(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.id, jobId)))[0]!;
        expect(j2.attemptCount).toBe(2);
        expect(j2.nextAttemptAt.getTime()).toBe(t2.getTime() + 2 * 60_000);

        const t3 = new Date(t2.getTime() + 2 * 60_000);
        const r3 = await worker.RunOnce({ now: t3 });
        expect(r3.retriedJobs).toBe(1);
        const j3 = (await observer.connection.select().from(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.id, jobId)))[0]!;
        expect(j3.attemptCount).toBe(3);
        expect(j3.nextAttemptAt.getTime()).toBe(t3.getTime() + 4 * 60_000);

        const t4 = new Date(t3.getTime() + 4 * 60_000);
        const r4 = await worker.RunOnce({ now: t4 });
        expect(r4.succeededJobs).toBe(1);
        const j4 = (await observer.connection.select().from(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.id, jobId)))[0]!;
        expect(j4.status).toBe("SUCCEEDED");
        expect(j4.completedAt).not.toBeNull();
        expect(storage.Has(storageKey)).toBe(false);
    }
    finally
    {
        await db.delete(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.id, jobId));
    }
});

test("ATT-REC-08 job at attempt_count = 9 and max_attempts = 10 transitions to FAILED on attempt 10 and clears lease fields", async () =>
{
    const now = new Date();
    const jobId = randomUUID();
    const attachmentId = randomUUID();
    const storageKey = `attachments/exhausted/${attachmentId}`;
    const storage = new InMemoryPrivateObjectStorage({
        onDeleteObject: async () =>
        {
            throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE", "Persistent storage failure");
        },
    });

    await db.insert(attachmentCleanupJobs).values({
        id: jobId,
        reservationId: null,
        attachmentId,
        storageKey,
        reason: "WORKING_DELETED",
        status: "PENDING",
        attemptCount: 9,
        maxAttempts: 10,
        nextAttemptAt: now,
        createdAt: new Date(now.getTime() - 3_600_000),
        updatedAt: now,
    });

    try
    {
        const worker = new AttachmentCleanupWorker(new AttachmentCleanupRepository(db), storage, () => now);
        const summary = await worker.RunOnce({ now });
        expect(summary.failedJobs).toBe(1);

        const failed = (await observer.connection.select().from(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.id, jobId)))[0]!;
        expect(failed.status).toBe("FAILED");
        expect(failed.attemptCount).toBe(10);
        expect(failed.leaseExpiresAt).toBeNull();
        expect(failed.claimToken).toBeNull();
        expect(failed.lastError).toBe("STORAGE_UNAVAILABLE");
    }
    finally
    {
        await db.delete(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.id, jobId));
    }
});

test("ATT-REC-09 HTTP DELETE succeeds 204 while storage is offline and cleanup worker deletes object once storage recovers", async () =>
{
    const fx = await seedDraftFixture();
    const storage = new InMemoryPrivateObjectStorage();
    const attachmentService = new AttachmentService(new AttachmentUnitOfWork(db), storage);

    const environment = readEnvironment({
        NODE_ENV: "test",
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        AUTH_JWT_SECRET: "issue13-rec09-pg-test-secret-0123456789012",
        AUTH_JWT_ISSUER: "issue13-pg-tests",
        AUTH_JWT_AUDIENCE: "issue13-api",
        AUTH_ALLOWED_ORIGINS: "http://localhost:3000",
        AUTH_COOKIE_SECURE: "false",
    });
    const identity = await createIdentityComposition(environment, database);
    const app = createApplication(
        undefined,
        identity,
        requestService,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { attachments: attachmentService, attachmentStorage: storage },
    );
    const token = await new TokenProvider(
        environment.AUTH_JWT_SECRET,
        { Now: () => new Date() },
        environment.AUTH_JWT_ISSUER,
        environment.AUTH_JWT_AUDIENCE,
    ).Sign(fx.owner.id, fx.owner.actor.family.id, fx.owner.actor.account.authVersion);

    const form = new FormData();
    const bytes = pdfBytes("rec-09-offline");
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    form.append("file", new File([buffer], "offline-delete.pdf", { type: "application/pdf" }));
    form.append("workingRevisionId", fx.workingRevisionId);

    const uploadRes = await app.handle(
        new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments`, {
            method: "POST",
            headers: { authorization: `Bearer ${token}` },
            body: form,
        }),
    );
    expect(uploadRes.status).toBe(201);
    const uploaded = attachmentSchema.parse(await uploadRes.json());
    const storedKey = storage.Keys().find((key) => key.includes(uploaded.id))!;
    expect(storedKey).toBeDefined();

    // Simulate storage outage during HTTP DELETE: DELETE still succeeds 204 atomically.
    storage.SetFaultHooks({
        onDeleteObject: async () =>
        {
            throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE", "Storage offline");
        },
    });

    const deleteRes = await app.handle(
        new Request(`http://localhost/api/v1/requests/${fx.requestId}/attachments/${uploaded.id}`, {
            method: "DELETE",
            headers: { authorization: `Bearer ${token}` },
        }),
    );
    expect(deleteRes.status).toBe(204);
    expect(storage.Has(storedKey)).toBe(true);

    const pendingJob = (await observer.connection
        .select()
        .from(attachmentCleanupJobs)
        .where(and(eq(attachmentCleanupJobs.attachmentId, uploaded.id), eq(attachmentCleanupJobs.reason, "WORKING_DELETED"))))[0]!;
    expect(pendingJob.status).toBe("PENDING");

    try
    {
        // Recover storage and run cleanup worker.
        storage.ClearFaultHooks();
        const worker = new AttachmentCleanupWorker(new AttachmentCleanupRepository(db), storage);
        const summary = await worker.RunOnce();
        expect(summary.succeededJobs).toBeGreaterThanOrEqual(1);
        expect(storage.Has(storedKey)).toBe(false);

        const completedJob = (await observer.connection
            .select()
            .from(attachmentCleanupJobs)
            .where(eq(attachmentCleanupJobs.id, pendingJob.id)))[0]!;
        expect(completedJob.status).toBe("SUCCEEDED");
    }
    finally
    {
        await db.delete(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.id, pendingJob.id));
        await db.delete(attachmentUploadReservations).where(eq(attachmentUploadReservations.attachmentId, uploaded.id));
    }
});

test("ATT-REC-10 CLI script apps/api/scripts/cleanup-attachments.ts processes due jobs against test DB and exits 0 cleanly", async () =>
{
    const fx = await seedDraftFixture();
    const testDatabaseUrl = assertTestDatabaseTarget(process.env);
    const jobId = randomUUID();
    const attachmentId = randomUUID();
    const reservationId = randomUUID();
    const expiredAttachmentId = randomUUID();
    const now = new Date();
    const jobStorageKey = `attachments/cli-job/${attachmentId}`;
    const expiredStorageKey = `attachments/cli-res/${expiredAttachmentId}`;

    await db.insert(attachmentCleanupJobs).values({
        id: jobId,
        reservationId: null,
        attachmentId,
        storageKey: jobStorageKey,
        reason: "WORKING_DELETED",
        status: "PENDING",
        attemptCount: 0,
        maxAttempts: 10,
        nextAttemptAt: new Date(now.getTime() - 5_000),
        createdAt: now,
        updatedAt: now,
    });

    await db.insert(attachmentUploadReservations).values({
        id: reservationId,
        attachmentId: expiredAttachmentId,
        requestId: fx.requestId,
        revisionId: fx.workingRevisionId,
        uploadedBy: fx.owner.id,
        storageKey: expiredStorageKey,
        fileName: "cli-expired.pdf",
        mediaType: "application/pdf",
        sizeBytes: 32,
        sha256: "d".repeat(64),
        status: "UPLOADING",
        createdAt: new Date(now.getTime() - 400_000),
        updatedAt: new Date(now.getTime() - 400_000),
        expiresAt: new Date(now.getTime() - 60_000),
    });

    try
    {
        const apiRoot = fileURLToPath(new URL("../..", import.meta.url));
        const result = await execFileAsync(
            process.execPath,
            ["--import", "tsx", "scripts/cleanup-attachments.ts"],
            {
                cwd: apiRoot,
                env: {
                    ...process.env,
                    NODE_ENV: "test",
                    DATABASE_URL: testDatabaseUrl,
                    ATTACHMENT_STORAGE_DRIVER: "memory",
                },
            },
        );

        const lastLine = result.stdout.trim().split(/\r?\n/).filter(Boolean).pop() ?? "{}";
        const parsed = JSON.parse(lastLine) as {
            code: string;
            reconciledUploading: number;
            succeededJobs: number;
        };
        expect(parsed.code).toBe("ATTACHMENT_CLEANUP_COMPLETED");
        expect(parsed.reconciledUploading).toBeGreaterThanOrEqual(1);
        expect(parsed.succeededJobs).toBeGreaterThanOrEqual(2);

        const finishedJob = (await observer.connection
            .select()
            .from(attachmentCleanupJobs)
            .where(eq(attachmentCleanupJobs.id, jobId)))[0]!;
        expect(finishedJob.status).toBe("SUCCEEDED");

        const finishedReservation = (await observer.connection
            .select()
            .from(attachmentUploadReservations)
            .where(eq(attachmentUploadReservations.id, reservationId)))[0]!;
        expect(finishedReservation.status).toBe("ABANDONED");

        const reconciledJob = (await observer.connection
            .select()
            .from(attachmentCleanupJobs)
            .where(eq(attachmentCleanupJobs.reservationId, reservationId)))[0]!;
        expect(reconciledJob.status).toBe("SUCCEEDED");
    }
    finally
    {
        await db.delete(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.id, jobId));
        await db.delete(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.reservationId, reservationId));
        await db.delete(attachmentUploadReservations).where(eq(attachmentUploadReservations.id, reservationId));
    }
});

test("ATT-REC-11 expired reservation already reclaimed by cleanup cannot finalize a dangling attachment", async () =>
{
    const fx = await seedDraftFixture();
    const storage = new InMemoryPrivateObjectStorage();
    const unit = new AttachmentUnitOfWork(db);
    const cleanupRepo = new AttachmentCleanupRepository(db);
    const worker = new AttachmentCleanupWorker(cleanupRepo, storage);

    const bytes = pdfBytes("expiry-race");
    const attachmentId = randomUUID();
    const reservationId = randomUUID();
    const storageKey = `requests/${fx.requestId}/revisions/${fx.workingRevisionId}/${attachmentId}/expiry-race.pdf`;
    const pastExpiry = new Date(Date.now() - 60_000);

    try
    {
        await unit.Run((repo) =>
            repo.CreateUploadReservation({
                id: reservationId,
                attachmentId,
                requestId: fx.requestId,
                revisionId: fx.workingRevisionId,
                uploadedBy: fx.owner.id,
                storageKey,
                fileName: "expiry-race.pdf",
                mediaType: "application/pdf",
                sizeBytes: bytes.byteLength,
                sha256: sha256Hex(bytes),
                expiresAt: pastExpiry,
            }),
        );

        await storage.PutObject({ storageKey, contentType: "application/pdf", bytes });

        // Cleanup runs after the 5-minute reservation TTL expires and removes the unfinalized object.
        const summary = await worker.RunOnce({ now: new Date() });
        expect(summary.reconciledUploading).toBeGreaterThanOrEqual(1);
        expect(summary.succeededJobs).toBeGreaterThanOrEqual(1);
        expect(storage.Has(storageKey)).toBe(false);

        // Late finalization after cleanup must reject with REQUEST_STALE and never insert dangling metadata.
        const finalized = await unit.Run((repo) =>
            repo.FinalizeUpload({
                actor: fx.owner.actor,
                reservationId,
                attachmentId,
                requestId: fx.requestId,
                revisionId: fx.workingRevisionId,
                uploadedBy: fx.owner.id,
                storageKey,
                fileName: "expiry-race.pdf",
                mediaType: "application/pdf",
                sizeBytes: bytes.byteLength,
                sha256: sha256Hex(bytes),
            }),
        );

        expect(finalized).toEqual({ status: "CONFLICT", errorCode: "REQUEST_STALE" });

        const rows = await observer.connection
            .select()
            .from(attachments)
            .where(eq(attachments.id, attachmentId));
        expect(rows).toHaveLength(0);
    }
    finally
    {
        await db.delete(attachmentCleanupJobs).where(eq(attachmentCleanupJobs.reservationId, reservationId));
        await db.delete(attachmentUploadReservations).where(eq(attachmentUploadReservations.id, reservationId));
    }
});
