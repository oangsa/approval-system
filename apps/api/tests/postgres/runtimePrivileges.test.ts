import { ConfigurationService } from "../../src/Applications/Policies/ConfigurationService";
import { ConfigurationRepository } from "../../src/Infrastructures/Database/Repositories/ConfigurationRepository";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase } from "../helpers/testDatabase";
import { fixtureUsers } from "../helpers/identityFixtures";
import { IdentityRepository } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import { RequestRepository } from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { DecisionRepository } from "../../src/Infrastructures/Database/Repositories/DecisionRepository";
import { seededTypeId, seededVersionId } from "../../src/Infrastructures/Database/seedRequests";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import { RequestTypeService } from "../../src/Applications/RequestTypes/RequestTypeService";
import { DecisionService } from "../../src/Applications/Approvals/DecisionService";
import { RequestTypeRepository } from "../../src/Infrastructures/Database/Repositories/RequestTypeRepository";

const database = createTestDatabase();
afterAll(() => database.Close());
test("scoped runtime grants support submission/decision without schema or account administration", async () =>
{
    await expect(database.connection.transaction(async (tx) =>
    {
        // Role and test records roll back together in guarded workflow_test only.
        await tx.execute(sql`CREATE ROLE approval_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
        const grants = readFileSync(new URL("../../../../deploy/runtime-grants.sql", import.meta.url), "utf8")
            .replace(/^BEGIN;|^COMMIT;/gm, "")
            .replace("GRANT CONNECT ON DATABASE postgres", "GRANT CONNECT ON DATABASE workflow_test");
        // This reviewed file contains only GRANT statements and line comments.
        for (const statement of grants.split(";").filter((value) => value.trim())) await tx.execute(sql.raw(statement));
        await tx.execute(sql`SET LOCAL ROLE approval_runtime`);
        const permissions = await tx.execute<{ schemaCreate: boolean; passwordUpdate: boolean; auditUpdate: boolean; assignmentKeyUpdate: boolean; routingUpdate: boolean; migrationAccess: boolean }>(sql`
            SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS "schemaCreate",
                has_column_privilege(current_user, 'public.users', 'password_hash', 'UPDATE') AS "passwordUpdate",
                has_table_privilege(current_user, 'public.audit_events', 'UPDATE') AS "auditUpdate",
                has_column_privilege(current_user, 'public.reviewer_assignment_rules', 'assignment_key', 'UPDATE') AS "assignmentKeyUpdate",
                has_column_privilege(current_user, 'public.reviewer_assignment_rules', 'reviewer_id', 'UPDATE') AS "routingUpdate",
                has_schema_privilege(current_user, 'drizzle', 'USAGE') AS "migrationAccess"
        `);
        expect(permissions[0]).toEqual({ schemaCreate: false, passwordUpdate: false, auditUpdate: false, assignmentKeyUpdate: false, routingUpdate: true, migrationAccess: false });
        const collaborationPermissions = await tx.execute<{
            commentInsert: boolean;
            commentUpdate: boolean;
            commentDelete: boolean;
            attachmentDelete: boolean;
            attachmentUpdate: boolean;
            reservationStatusUpdate: boolean;
            reservationKeyUpdate: boolean;
            reservationDelete: boolean;
            cleanupStatusUpdate: boolean;
            cleanupKeyUpdate: boolean;
            cleanupDelete: boolean;
        }>(sql`
            SELECT has_table_privilege(current_user, 'public.request_comments', 'INSERT') AS "commentInsert",
                has_table_privilege(current_user, 'public.request_comments', 'UPDATE') AS "commentUpdate",
                has_table_privilege(current_user, 'public.request_comments', 'DELETE') AS "commentDelete",
                has_table_privilege(current_user, 'public.attachments', 'DELETE') AS "attachmentDelete",
                has_table_privilege(current_user, 'public.attachments', 'UPDATE') AS "attachmentUpdate",
                has_column_privilege(current_user, 'public.attachment_upload_reservations', 'status', 'UPDATE') AS "reservationStatusUpdate",
                has_column_privilege(current_user, 'public.attachment_upload_reservations', 'storage_key', 'UPDATE') AS "reservationKeyUpdate",
                has_table_privilege(current_user, 'public.attachment_upload_reservations', 'DELETE') AS "reservationDelete",
                has_column_privilege(current_user, 'public.attachment_cleanup_jobs', 'status', 'UPDATE') AS "cleanupStatusUpdate",
                has_column_privilege(current_user, 'public.attachment_cleanup_jobs', 'storage_key', 'UPDATE') AS "cleanupKeyUpdate",
                has_table_privilege(current_user, 'public.attachment_cleanup_jobs', 'DELETE') AS "cleanupDelete"
        `);
        expect(collaborationPermissions[0]).toEqual({
            commentInsert: true,
            commentUpdate: false,
            commentDelete: false,
            attachmentDelete: true,
            attachmentUpdate: false,
            reservationStatusUpdate: true,
            reservationKeyUpdate: false,
            reservationDelete: false,
            cleanupStatusUpdate: true,
            cleanupKeyUpdate: false,
            cleanupDelete: false,
        });
        const identities = new IdentityRepository(tx);
        const actors = [];
        for (const fixture of [fixtureUsers[0]!, fixtureUsers[2]!])
        {
            const familyId = randomUUID();
            await identities.InsertFamily({ id: familyId, userId: fixture.id, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000), revokedAt: null });
            actors.push((await identities.ReadCurrentIdentity(fixture.id, familyId))!);
        }
        const requester = actors[0]!;
        const reviewer = actors[1]!;
        const requests = new RequestService({ Run: async (operation) => operation(new RequestRepository(tx)) });
        const draft = await requests.Mutate(requester, "create", null, { typeId: seededTypeId, formDefinitionVersionId: seededVersionId, title: "Runtime privilege fixture", justification: "Verify restricted database access", priority: "MEDIUM", fields: { category: "OPERATIONS" } }, randomUUID());
        const commentId = randomUUID();
        await tx.execute(sql`INSERT INTO public.request_comments (id, request_id, author_id, body) VALUES (${commentId}, ${draft.id}, ${requester.account.id}, 'Runtime comment')`);
        const commentRows = await tx.execute<{ id: string }>(sql`SELECT id FROM public.request_comments WHERE id = ${commentId}`);
        expect(commentRows).toHaveLength(1);
        await expect(tx.transaction(async (nested) => nested.execute(sql`UPDATE public.request_comments SET body = 'Edited' WHERE id = ${commentId}`))).rejects.toThrow();
        await expect(tx.transaction(async (nested) => nested.execute(sql`DELETE FROM public.request_comments WHERE id = ${commentId}`))).rejects.toThrow();

        const workingRevisionId = draft.workingRevision!.id;
        const reservationId = randomUUID();
        const attachmentId = randomUUID();
        const storageKey = `requests/${draft.id}/revisions/${workingRevisionId}/${attachmentId}/test.pdf`;
        const sha256 = "a".repeat(64);
        await tx.execute(sql`
            INSERT INTO public.attachment_upload_reservations (
                id, attachment_id, request_id, revision_id, uploaded_by, storage_key, file_name, media_type, size_bytes, sha256, status, expires_at
            ) VALUES (
                ${reservationId}, ${attachmentId}, ${draft.id}, ${workingRevisionId}, ${requester.account.id}, ${storageKey}, 'test.pdf', 'application/pdf', 128, ${sha256}, 'UPLOADING', now() + interval '5 minutes'
            )
        `);
        await tx.execute(sql`UPDATE public.attachment_upload_reservations SET status = 'FINALIZED', updated_at = now(), finalized_at = now() WHERE id = ${reservationId}`);
        await expect(tx.transaction(async (nested) => nested.execute(sql`UPDATE public.attachment_upload_reservations SET storage_key = 'tampered' WHERE id = ${reservationId}`))).rejects.toThrow();
        await expect(tx.transaction(async (nested) => nested.execute(sql`DELETE FROM public.attachment_upload_reservations WHERE id = ${reservationId}`))).rejects.toThrow();

        await tx.execute(sql`
            INSERT INTO public.attachments (
                id, request_id, revision_id, uploaded_by, file_name, media_type, size_bytes, storage_key, sha256
            ) VALUES (
                ${attachmentId}, ${draft.id}, ${workingRevisionId}, ${requester.account.id}, 'test.pdf', 'application/pdf', 128, ${storageKey}, ${sha256}
            )
        `);
        const attachmentRows = await tx.execute<{ id: string }>(sql`SELECT id FROM public.attachments WHERE id = ${attachmentId}`);
        expect(attachmentRows).toHaveLength(1);
        await expect(tx.transaction(async (nested) => nested.execute(sql`UPDATE public.attachments SET file_name = 'renamed.pdf' WHERE id = ${attachmentId}`))).rejects.toThrow();
        await expect(tx.transaction(async (nested) => nested.execute(sql`ALTER TABLE public.attachments DISABLE TRIGGER immutable_attachment`))).rejects.toThrow();
        await tx.execute(sql`DELETE FROM public.attachments WHERE id = ${attachmentId}`);

        const cleanupJobId = randomUUID();
        await tx.execute(sql`
            INSERT INTO public.attachment_cleanup_jobs (
                id, reservation_id, attachment_id, storage_key, reason, status
            ) VALUES (
                ${cleanupJobId}, ${reservationId}, ${attachmentId}, ${storageKey}, 'WORKING_DELETED', 'PENDING'
            )
        `);
        await tx.execute(sql`UPDATE public.attachment_cleanup_jobs SET status = 'SUCCEEDED', attempt_count = 1, completed_at = now(), updated_at = now() WHERE id = ${cleanupJobId}`);
        await expect(tx.transaction(async (nested) => nested.execute(sql`UPDATE public.attachment_cleanup_jobs SET storage_key = 'tampered' WHERE id = ${cleanupJobId}`))).rejects.toThrow();
        await expect(tx.transaction(async (nested) => nested.execute(sql`DELETE FROM public.attachment_cleanup_jobs WHERE id = ${cleanupJobId}`))).rejects.toThrow();
        const submitted = await requests.Mutate(requester, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
        expect(submitted.status).toBe("PENDING");
        const updatedStages = await tx.execute<{ activatedAt: Date }>(sql`
            UPDATE public.approval_stages SET activated_at = activated_at
            WHERE cycle_id = ${submitted.currentCycleId} RETURNING activated_at AS "activatedAt"
        `);
        expect(updatedStages).toHaveLength(1);
        expect(updatedStages[0]!.activatedAt).not.toBeNull();
        const decisions = new DecisionService({ Run: async (operation) => operation(new DecisionRepository(tx)) });
        const decision = await decisions.Decide(reviewer, submitted.currentApprovers[0]!.slotId, { decision: "APPROVE", expectedVersion: 0 }, randomUUID());
        expect(decision.requestStatus).toBe("APPROVED");

        const adminId = randomUUID();
        const adminFamilyId = randomUUID();
        const existingAdmin = (await tx.execute<{ id: string }>(sql`SELECT ur.user_id AS id FROM public.user_roles ur JOIN public.users u ON u.id = ur.user_id WHERE ur.role_code = 'ADMINISTRATOR' AND u.is_active = true LIMIT 1`))[0];
        expect(existingAdmin).toBeDefined();
        await identities.InsertFamily({ id: adminFamilyId, userId: existingAdmin!.id, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000), revokedAt: null });
        const adminActor = (await identities.ReadCurrentIdentity(existingAdmin!.id, adminFamilyId))!;
        const requestTypes = new RequestTypeService({ Run: async (operation) => operation(new RequestTypeRepository(tx)) });
        const createdType = await requestTypes.Create(adminActor, { code: `RT_${adminId.slice(0, 8)}`, name: { en: "Runtime Type" }, monetary: false, supportsLineItems: false, fields: [] }, randomUUID());
        const publishedType = await requestTypes.Publish(adminActor, createdType.id, { expectedVersion: createdType.version }, randomUUID());
        expect(publishedType.versionNumber).toBe(1);
        await requestTypes.SetEnabled(adminActor, createdType.id, false, { expectedVersion: createdType.version + 1 }, randomUUID());
        const configuration = new ConfigurationService({ Run: async (operation) => operation(new ConfigurationRepository(tx)) });
        const mapping = await configuration.Assignment(adminActor, null, { key: `runtime-${randomUUID()}`, departmentId: null, reviewerUserIds: [reviewer.account.id], isActive: true });
        expect((await configuration.Assignment(adminActor, mapping.id, { expectedVersion: 0, isActive: false })).version).toBe(1);
        const draftPolicy = await configuration.CreatePolicy(adminActor, { code: `runtime-${randomUUID()}`, typeId: createdType.id, departmentId: null, priority: 10, minAmount: null, maxAmount: null, stages: [{ stageNumber: 1, reviewerAssignmentKeys: [mapping.key], slaBusinessMinutes: 480 }] });
        const publishedPolicy = await configuration.PolicyAction(adminActor, draftPolicy.id, "publish", { expectedVersion: 0 }, randomUUID());
        expect(publishedPolicy.versionNumber).toBe(1);
        const budget = await configuration.Budget(adminActor, null, { typeId: createdType.id, departmentId: null, maxAmount: "100.10", isActive: true });
        expect((await configuration.Budget(adminActor, budget.id, { expectedVersion: 0, maxAmount: "100.20" })).version).toBe(1);
        throw new Error("rollback-runtime-fixture");
    })).rejects.toThrow("rollback-runtime-fixture");
});
