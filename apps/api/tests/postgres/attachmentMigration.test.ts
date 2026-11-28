import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase } from "../helpers/testDatabase";
import {
    attachmentCleanupJobs,
    attachments,
    attachmentUploadReservations,
    requestComments,
    requestRevisions,
    requests,
    requestTypes,
    requestTypeVersions,
    users,
} from "../../src/Infrastructures/Database/schema";
import { seededDefinition } from "../../src/Infrastructures/Database/seedRequests";

const database = createTestDatabase();
afterAll(() => database.Close());

interface IPostgresErrorShape
{
    code?: string;
    message?: string;
    cause?: unknown;
}

function readPostgresError(error: unknown): { code: string | undefined; message: string }
{
    if (typeof error !== "object" || error === null)
    {
        return { code: undefined, message: String(error) };
    }
    const candidate = error as IPostgresErrorShape;
    if (typeof candidate.code === "string")
    {
        return { code: candidate.code, message: candidate.message ?? "" };
    }
    if (typeof candidate.cause === "object" && candidate.cause !== null)
    {
        const cause = candidate.cause as IPostgresErrorShape;
        return { code: cause.code, message: cause.message ?? candidate.message ?? "" };
    }
    return { code: undefined, message: candidate.message ?? "" };
}

async function expectSqlState(operation: () => Promise<unknown>, expectedCode: string, expectedMessagePattern?: RegExp): Promise<void>
{
    let caught: unknown;
    try
    {
        await operation();
    }
    catch (error)
    {
        caught = error;
    }
    expect(caught).toBeDefined();
    const pgError = readPostgresError(caught);
    expect(pgError.code).toBe(expectedCode);
    if (expectedMessagePattern)
    {
        expect(pgError.message).toMatch(expectedMessagePattern);
    }
}

async function seedRequestPair(tx: Parameters<Parameters<typeof database.connection.transaction>[0]>[0])
{
    const ownerId = randomUUID();
    const typeId = randomUUID();
    const versionId = randomUUID();
    const requestOneId = randomUUID();
    const requestTwoId = randomUUID();
    const revisionOneId = randomUUID();
    const revisionTwoId = randomUUID();

    await tx.insert(users).values({
        id: ownerId,
        email: `${ownerId}@example.test`,
        displayName: "Migration Fixture Owner",
        passwordHash: "not-for-login",
    });
    await tx.insert(requestTypes).values({ id: typeId, code: `MIG_${typeId.slice(0, 8)}` });
    await tx.insert(requestTypeVersions).values({
        id: versionId,
        typeId,
        versionNumber: 1,
        definition: { ...seededDefinition, id: typeId, versionId, code: `MIG_${typeId.slice(0, 8)}` },
    });
    await tx.insert(requests).values([
        {
            id: requestOneId,
            requesterId: ownerId,
            typeId,
            title: "Request One",
            justification: "Migration verification request one",
            priority: "MEDIUM",
            status: "DRAFT",
        },
        {
            id: requestTwoId,
            requesterId: ownerId,
            typeId,
            title: "Request Two",
            justification: "Migration verification request two",
            priority: "MEDIUM",
            status: "DRAFT",
        },
    ]);
    await tx.insert(requestRevisions).values([
        {
            id: revisionOneId,
            requestId: requestOneId,
            typeId,
            formDefinitionVersionId: versionId,
            revisionNumber: 1,
            fields: { category: "OPERATIONS" },
        },
        {
            id: revisionTwoId,
            requestId: requestTwoId,
            typeId,
            formDefinitionVersionId: versionId,
            revisionNumber: 1,
            fields: { category: "OPERATIONS" },
        },
    ]);
    return { ownerId, requestOneId, requestTwoId, revisionOneId, revisionTwoId };
}

test("MIG-13-01 migration 0017 applies cleanly with zero data loss on existing tables", async () =>
{
    const migration = readFileSync(new URL("../../src/Infrastructures/Database/migrations/0017_polite_absorbing_man.sql", import.meta.url), "utf8");
    const statements = migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean);

    await expect(database.connection.transaction(async (tx) =>
    {
        await tx.execute(sql`DROP TABLE IF EXISTS public.attachment_cleanup_jobs`);
        await tx.execute(sql`DROP TABLE IF EXISTS public.attachment_upload_reservations`);
        await tx.execute(sql`DROP TABLE IF EXISTS public.attachments`);
        await tx.execute(sql`DROP TABLE IF EXISTS public.request_comments`);
        await tx.execute(sql`DROP FUNCTION IF EXISTS public.protect_submitted_attachment()`);
        await tx.execute(sql`ALTER TABLE public.request_revisions DROP CONSTRAINT IF EXISTS request_revisions_request_id_id_uq`);

        const seeded = await seedRequestPair(tx);
        await tx.execute(sql`
            UPDATE public.request_revisions
            SET submitted_at = now(), submitted_by = ${seeded.ownerId}
            WHERE id = ${seeded.revisionTwoId}
        `);
        const requestsBefore = await tx.execute(sql`SELECT id, status, title FROM public.requests ORDER BY id`);
        const revisionsBefore = await tx.execute(sql`SELECT id, request_id, revision_number, submitted_at FROM public.request_revisions ORDER BY id`);

        for (const statement of statements)
        {
            await tx.execute(sql.raw(statement));
        }

        const requestsAfter = await tx.execute(sql`SELECT id, status, title FROM public.requests ORDER BY id`);
        const revisionsAfter = await tx.execute(sql`SELECT id, request_id, revision_number, submitted_at FROM public.request_revisions ORDER BY id`);
        expect(Array.from(requestsAfter)).toEqual(Array.from(requestsBefore));
        expect(Array.from(revisionsAfter)).toEqual(Array.from(revisionsBefore));
        throw new Error("rollback-mig-13-01");
    })).rejects.toThrow("rollback-mig-13-01");
});

test("MIG-13-02 request_revisions enforces unique (request_id, id) constraint", async () =>
{
    const constraints = await database.connection.execute<{ name: string; definition: string }>(sql`
        SELECT conname AS name, pg_get_constraintdef(oid) AS definition
        FROM pg_constraint
        WHERE conrelid = 'public.request_revisions'::regclass
          AND conname = 'request_revisions_request_id_id_uq'
    `);
    expect(constraints).toHaveLength(1);
    expect(constraints[0]?.definition).toBe("UNIQUE (request_id, id)");
});

test("MIG-13-03 collaboration tables, check constraints, and indexes match SDS §3", async () =>
{
    const tables = await database.connection.execute<{ tablename: string }>(sql`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN ('request_comments', 'attachments', 'attachment_upload_reservations', 'attachment_cleanup_jobs')
        ORDER BY tablename
    `);
    expect(tables.map((row) => row.tablename)).toEqual([
        "attachment_cleanup_jobs",
        "attachment_upload_reservations",
        "attachments",
        "request_comments",
    ]);

    const indexes = await database.connection.execute<{ indexname: string }>(sql`
        SELECT indexname
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexname IN (
              'request_comments_request_created_id_idx',
              'attachments_request_revision_uploaded_idx',
              'attachments_revision_idx',
              'attachment_upload_res_status_exp_idx',
              'attachment_cleanup_jobs_due_idx',
              'attachment_cleanup_jobs_lease_idx',
              'attachment_cleanup_jobs_storage_key_pending_uq'
          )
        ORDER BY indexname
    `);
    expect(indexes.map((row) => row.indexname)).toEqual([
        "attachment_cleanup_jobs_due_idx",
        "attachment_cleanup_jobs_lease_idx",
        "attachment_cleanup_jobs_storage_key_pending_uq",
        "attachment_upload_res_status_exp_idx",
        "attachments_request_revision_uploaded_idx",
        "attachments_revision_idx",
        "request_comments_request_created_id_idx",
    ]);

    await expect(database.connection.transaction(async (tx) =>
    {
        const { ownerId, requestOneId, revisionOneId } = await seedRequestPair(tx);
        const validSha = "a".repeat(64);

        await expectSqlState(
            () => tx.transaction((nested) => nested.insert(requestComments).values({
                id: randomUUID(),
                requestId: requestOneId,
                authorId: ownerId,
                body: "   ",
            })),
            "23514",
        );
        await expectSqlState(
            () => tx.transaction((nested) => nested.insert(requestComments).values({
                id: randomUUID(),
                requestId: requestOneId,
                authorId: ownerId,
                body: "x".repeat(4001),
            })),
            "23514",
        );

        await expectSqlState(
            () => tx.transaction((nested) => nested.insert(attachments).values({
                id: randomUUID(),
                requestId: requestOneId,
                revisionId: revisionOneId,
                uploadedBy: ownerId,
                fileName: "   ",
                mediaType: "application/pdf",
                sizeBytes: 100,
                storageKey: `k-${randomUUID()}`,
                sha256: validSha,
            })),
            "23514",
        );
        await expectSqlState(
            () => tx.transaction((nested) => nested.insert(attachments).values({
                id: randomUUID(),
                requestId: requestOneId,
                revisionId: revisionOneId,
                uploadedBy: ownerId,
                fileName: "a.pdf",
                mediaType: "application/pdf",
                sizeBytes: 0,
                storageKey: `k-${randomUUID()}`,
                sha256: validSha,
            })),
            "23514",
        );
        await expectSqlState(
            () => tx.transaction((nested) => nested.insert(attachments).values({
                id: randomUUID(),
                requestId: requestOneId,
                revisionId: revisionOneId,
                uploadedBy: ownerId,
                fileName: "a.pdf",
                mediaType: "application/pdf",
                sizeBytes: 10485761,
                storageKey: `k-${randomUUID()}`,
                sha256: validSha,
            })),
            "23514",
        );
        await expectSqlState(
            () => tx.transaction((nested) => nested.insert(attachments).values({
                id: randomUUID(),
                requestId: requestOneId,
                revisionId: revisionOneId,
                uploadedBy: ownerId,
                fileName: "a.pdf",
                mediaType: "application/pdf",
                sizeBytes: 100,
                storageKey: `k-${randomUUID()}`,
                sha256: "INVALID",
            })),
            "23514",
        );

        await expectSqlState(
            () => tx.transaction((nested) => nested.execute(sql`
                INSERT INTO public.attachment_upload_reservations (
                    id, attachment_id, request_id, revision_id, uploaded_by, storage_key, file_name, media_type, size_bytes, sha256, status, expires_at
                ) VALUES (
                    ${randomUUID()}, ${randomUUID()}, ${requestOneId}, ${revisionOneId}, ${ownerId}, ${`r-${randomUUID()}`}, 'a.pdf', 'application/pdf', 100, ${validSha}, 'INVALID_STATUS', now() + interval '5 minutes'
                )
            `)),
            "23514",
        );
        await expectSqlState(
            () => tx.transaction((nested) => nested.execute(sql`
                INSERT INTO public.attachment_cleanup_jobs (
                    id, attachment_id, storage_key, reason, status, attempt_count, max_attempts
                ) VALUES (
                    ${randomUUID()}, ${randomUUID()}, ${`c-${randomUUID()}`}, 'INVALID_REASON', 'PENDING', 0, 10
                )
            `)),
            "23514",
        );
        await expectSqlState(
            () => tx.transaction((nested) => nested.execute(sql`
                INSERT INTO public.attachment_cleanup_jobs (
                    id, attachment_id, storage_key, reason, status, attempt_count, max_attempts
                ) VALUES (
                    ${randomUUID()}, ${randomUUID()}, ${`c-${randomUUID()}`}, 'WORKING_DELETED', 'PENDING', -1, 10
                )
            `)),
            "23514",
        );
        await expectSqlState(
            () => tx.transaction((nested) => nested.execute(sql`
                INSERT INTO public.attachment_cleanup_jobs (
                    id, attachment_id, storage_key, reason, status, attempt_count, max_attempts
                ) VALUES (
                    ${randomUUID()}, ${randomUUID()}, ${`c-${randomUUID()}`}, 'WORKING_DELETED', 'PENDING', 0, 0
                )
            `)),
            "23514",
        );
        throw new Error("rollback-mig-13-03");
    })).rejects.toThrow("rollback-mig-13-03");
});

test("MIG-13-04 composite foreign keys reject cross-request revision references", async () =>
{
    await expect(database.connection.transaction(async (tx) =>
    {
        const { ownerId, requestOneId, revisionTwoId } = await seedRequestPair(tx);
        const sha = "b".repeat(64);

        await expectSqlState(
            () => tx.transaction((nested) => nested.insert(attachments).values({
                id: randomUUID(),
                requestId: requestOneId,
                revisionId: revisionTwoId,
                uploadedBy: ownerId,
                fileName: "cross-request.pdf",
                mediaType: "application/pdf",
                sizeBytes: 256,
                storageKey: `cross-${randomUUID()}`,
                sha256: sha,
            })),
            "23503",
        );

        await expectSqlState(
            () => tx.transaction((nested) => nested.insert(attachmentUploadReservations).values({
                id: randomUUID(),
                attachmentId: randomUUID(),
                requestId: requestOneId,
                revisionId: revisionTwoId,
                uploadedBy: ownerId,
                storageKey: `cross-res-${randomUUID()}`,
                fileName: "cross-request.pdf",
                mediaType: "application/pdf",
                sizeBytes: 256,
                sha256: sha,
                status: "UPLOADING",
                expiresAt: new Date(Date.now() + 300000),
            })),
            "23503",
        );

        throw new Error("rollback-mig-13-04");
    })).rejects.toThrow("rollback-mig-13-04");
});

test("MIG-13-05 protect_submitted_attachment blocks submitted mutations and working updates", async () =>
{
    await expect(database.connection.transaction(async (tx) =>
    {
        const { ownerId, requestOneId, revisionOneId } = await seedRequestPair(tx);
        const workingAttachmentId = randomUUID();
        const submittedAttachmentId = randomUUID();
        const sha = "c".repeat(64);

        await tx.insert(attachments).values({
            id: workingAttachmentId,
            requestId: requestOneId,
            revisionId: revisionOneId,
            uploadedBy: ownerId,
            fileName: "working.pdf",
            mediaType: "application/pdf",
            sizeBytes: 512,
            storageKey: `working-${workingAttachmentId}`,
            sha256: sha,
        });

        await expectSqlState(
            () => tx.transaction((nested) => nested.execute(sql`
                UPDATE public.attachments SET file_name = 'tampered.pdf' WHERE id = ${workingAttachmentId}
            `)),
            "23514",
        );
        await expectSqlState(
            () => tx.transaction((nested) => nested.execute(sql`
                UPDATE public.attachments SET sha256 = ${"d".repeat(64)} WHERE id = ${workingAttachmentId}
            `)),
            "23514",
        );

        await tx.insert(attachments).values({
            id: submittedAttachmentId,
            requestId: requestOneId,
            revisionId: revisionOneId,
            uploadedBy: ownerId,
            fileName: "evidence.pdf",
            mediaType: "application/pdf",
            sizeBytes: 1024,
            storageKey: `submitted-${submittedAttachmentId}`,
            sha256: sha,
        });
        await tx.execute(sql`DELETE FROM public.attachments WHERE id = ${workingAttachmentId}`);

        await tx.execute(sql`
            UPDATE public.request_revisions
            SET submitted_at = now(), submitted_by = ${ownerId}
            WHERE id = ${revisionOneId}
        `);

        await expectSqlState(
            () => tx.transaction((nested) => nested.insert(attachments).values({
                id: randomUUID(),
                requestId: requestOneId,
                revisionId: revisionOneId,
                uploadedBy: ownerId,
                fileName: "late.pdf",
                mediaType: "application/pdf",
                sizeBytes: 128,
                storageKey: `late-${randomUUID()}`,
                sha256: sha,
            })),
            "23514",
            /Submitted attachments are immutable/,
        );

        await expectSqlState(
            () => tx.transaction((nested) => nested.execute(sql`
                UPDATE public.attachments SET file_name = 'rewritten.pdf' WHERE id = ${submittedAttachmentId}
            `)),
            "23514",
            /Submitted attachments are immutable/,
        );

        await expectSqlState(
            () => tx.transaction((nested) => nested.execute(sql`
                DELETE FROM public.attachments WHERE id = ${submittedAttachmentId}
            `)),
            "23514",
            /Submitted attachments are immutable/,
        );

        throw new Error("rollback-mig-13-05");
    })).rejects.toThrow("rollback-mig-13-05");
});

test("MIG-13-06 partial unique index allows historical jobs and blocks duplicate active storage keys", async () =>
{
    await expect(database.connection.transaction(async (tx) =>
    {
        const storageKey = `requests/test/${randomUUID()}/file.pdf`;
        await tx.insert(attachmentCleanupJobs).values([
            {
                id: randomUUID(),
                attachmentId: randomUUID(),
                storageKey,
                reason: "WORKING_DELETED",
                status: "SUCCEEDED",
                completedAt: new Date(),
            },
            {
                id: randomUUID(),
                attachmentId: randomUUID(),
                storageKey,
                reason: "STALE_RESERVATION",
                status: "FAILED",
            },
            {
                id: randomUUID(),
                attachmentId: randomUUID(),
                storageKey,
                reason: "COMMIT_CONFLICT",
                status: "PENDING",
            },
        ]);

        await expectSqlState(
            () => tx.transaction((nested) => nested.insert(attachmentCleanupJobs).values({
                id: randomUUID(),
                attachmentId: randomUUID(),
                storageKey,
                reason: "UPLOAD_ABORTED",
                status: "PENDING",
            })),
            "23505",
        );

        await expectSqlState(
            () => tx.transaction((nested) => nested.insert(attachmentCleanupJobs).values({
                id: randomUUID(),
                attachmentId: randomUUID(),
                storageKey,
                reason: "UPLOAD_ABORTED",
                status: "PROCESSING",
            })),
            "23505",
        );

        throw new Error("rollback-mig-13-06");
    })).rejects.toThrow("rollback-mig-13-06");
});

test("MIG-13-08 prior migrations 0000-0016 remain intact and Drizzle snapshot matches schema.ts", () =>
{
    const migrationsDirectory = fileURLToPath(new URL("../../src/Infrastructures/Database/migrations", import.meta.url));
    const journal = JSON.parse(readFileSync(`${migrationsDirectory}/meta/_journal.json`, "utf8")) as {
        entries: Array<{ idx: number; tag: string }>;
    };
    const expectedTags = [
        "0000_fast_the_santerians",
        "0001_legal_longshot",
        "0002_submission-immutability",
        "0003_tranquil_iceman",
        "0004_tiresome_quicksilver",
        "0005_productive_bromley",
        "0006_tidy_ironclad",
        "0007_immutable-decision-history",
        "0008_harsh_lester",
        "0009_withdrawal-audit-note",
        "0010_fine_dreaming_celestial",
        "0011_even_blue_blade",
        "0012_policy-lifecycle-backfill",
        "0013_grey_exodus",
        "0014_jittery_mysterio",
        "0015_parallel_moon_knight",
        "0016_strong_sway",
        "0017_polite_absorbing_man",
    ];
    expect(journal.entries.map((entry) => entry.tag)).toEqual(expectedTags);
    for (const tag of expectedTags)
    {
        expect(existsSync(`${migrationsDirectory}/${tag}.sql`)).toBe(true);
    }

    const apiRoot = fileURLToPath(new URL("../..", import.meta.url));
    const check = spawnSync("npx", ["drizzle-kit", "check"], {
        cwd: apiRoot,
        shell: process.platform === "win32",
        encoding: "utf8",
        env: { ...process.env, NODE_ENV: "test" },
    });
    expect(check.status, check.stderr || check.stdout).toBe(0);
});
