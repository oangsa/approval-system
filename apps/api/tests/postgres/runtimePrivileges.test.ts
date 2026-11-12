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
import { DecisionService } from "../../src/Applications/Approvals/DecisionService";

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
        const permissions = await tx.execute<{ schemaCreate: boolean; passwordUpdate: boolean; auditUpdate: boolean; routingUpdate: boolean; migrationAccess: boolean }>(sql`
            SELECT has_schema_privilege(current_user, 'public', 'CREATE') AS "schemaCreate",
                has_column_privilege(current_user, 'public.users', 'password_hash', 'UPDATE') AS "passwordUpdate",
                has_table_privilege(current_user, 'public.audit_events', 'UPDATE') AS "auditUpdate",
                has_column_privilege(current_user, 'public.reviewer_assignment_rules', 'reviewer_id', 'UPDATE') AS "routingUpdate",
                has_schema_privilege(current_user, 'drizzle', 'USAGE') AS "migrationAccess"
        `);
        expect(permissions[0]).toEqual({ schemaCreate: false, passwordUpdate: false, auditUpdate: false, routingUpdate: false, migrationAccess: false });
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
        const submitted = await requests.Mutate(requester, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
        expect(submitted.status).toBe("PENDING");
        const decisions = new DecisionService({ Run: async (operation) => operation(new DecisionRepository(tx)) });
        const decision = await decisions.Decide(reviewer, submitted.currentApprovers[0]!.slotId, { decision: "APPROVE", expectedVersion: 0 }, randomUUID());
        expect(decision.requestStatus).toBe("APPROVED");
        throw new Error("rollback-runtime-fixture");
    })).rejects.toThrow("rollback-runtime-fixture");
});
