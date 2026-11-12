import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDatabase } from "../helpers/testDatabase";
import { initializeProduction } from "../../src/Infrastructures/Database/productionInitialization";
import { approvalPolicyVersions, departmentMemberships, departments, requests, requestTypes, requestTypeVersions, reviewerAssignmentRules, userRoles, users } from "../../src/Infrastructures/Database/schema";
import { seededTypeId, seededVersionId } from "../../src/Infrastructures/Database/seedRequests";
import { RequestRepository } from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { resolvePlan } from "../../src/Domains/Requests/RequestRules";
import { PasswordHasher } from "../../src/Infrastructures/Security/PasswordHasher";

const database = createTestDatabase();
afterAll(() => database.Close());
test("fresh initialization is repeatable, preserves existing hashes/data and rolls back conflicts", async () =>
{
    await expect(database.connection.transaction(async (tx) =>
    {
        // Dedicated fresh disposable workflow_test, before db:test:seed. Never production.
        expect(await tx.select().from(requestTypes)).toEqual([]);
        const requester = { email: `${randomUUID()}@example.test`, displayName: "Requester", password: "initial-fixture-password" };
        const reviewer = { ...requester, email: `${randomUUID()}@example.test`, displayName: "Reviewer" };
        const input = { requester, reviewer };
        await initializeProduction({ connection: tx }, input);
        const beforeUsers = await tx.select().from(users);
        const beforeRoles = await tx.select().from(userRoles);
        const beforeMemberships = await tx.select().from(departmentMemberships);
        const beforeTypes = await tx.select().from(requestTypes);
        const beforeVersions = await tx.select().from(requestTypeVersions);
        const beforePolicies = await tx.select().from(approvalPolicyVersions);
        const beforeRules = await tx.select().from(reviewerAssignmentRules);
        const beforeDepartments = await tx.select().from(departments);
        expect(beforeUsers).toHaveLength(2);
        expect(beforeRules).toHaveLength(1);
        expect(beforeRoles.map((row) => row.roleCode).sort()).toEqual(["REQUESTER", "REVIEWER"]);
        expect(beforeMemberships.every((row) => row.isPrimary && row.isActive)).toBe(true);
        const account = beforeUsers.find((row) => row.email === requester.email)!;
        expect(await new PasswordHasher().Verify(requester.password, account.passwordHash)).toBe(true);
        const configuration = await new RequestRepository(tx).Configuration(seededTypeId, seededVersionId, account.id);
        const plan = resolvePlan(configuration, account.id, null);
        expect(plan.assignments).toHaveLength(1);
        expect(plan.assignments[0]?.reviewerId).toBe(beforeUsers.find((row) => row.email === reviewer.email)?.id);
        await tx.insert(requests).values({ id: randomUUID(), requesterId: account.id, typeId: seededTypeId, title: "Preserve existing request", justification: "Initialization must not reset this record", priority: "MEDIUM" });
        const existingRequests = await tx.select().from(requests);
        await initializeProduction({ connection: tx }, { requester: { ...requester, password: "replacement-not-applied" }, reviewer });
        expect(await tx.select().from(users)).toEqual(beforeUsers);
        expect(await tx.select().from(userRoles)).toEqual(beforeRoles);
        expect(await tx.select().from(departmentMemberships)).toEqual(beforeMemberships);
        expect(await tx.select().from(requestTypes)).toEqual(beforeTypes);
        expect(await tx.select().from(requestTypeVersions)).toEqual(beforeVersions);
        expect(await tx.select().from(approvalPolicyVersions)).toEqual(beforePolicies);
        expect(await tx.select().from(reviewerAssignmentRules)).toEqual(beforeRules);
        expect(await tx.select().from(departments)).toEqual(beforeDepartments);
        expect(await tx.select().from(requests)).toEqual(existingRequests);

        // A changed published pointer must never be silently repaired. New account
        // insertion attempted earlier in the nested transaction must roll back too.
        await tx.update(requestTypes).set({ publishedVersionId: null }).where(eq(requestTypes.id, seededTypeId));
        const replacement = { ...requester, email: `${randomUUID()}@example.test` };
        await expect(initializeProduction({ connection: tx }, { requester: replacement, reviewer })).rejects.toThrow("conflicts");
        expect(await tx.select().from(users)).toEqual(beforeUsers);
        expect((await tx.select().from(requestTypes))[0]?.publishedVersionId).toBeNull();
        expect(await tx.select().from(requests)).toEqual(existingRequests);

        // Existing account permissions must not be silently granted/escalated.
        await tx.delete(userRoles).where(eq(userRoles.userId, account.id));
        await expect(initializeProduction({ connection: tx }, input)).rejects.toThrow("conflicts");
        expect(await tx.select().from(userRoles).where(eq(userRoles.userId, account.id))).toEqual([]);
        throw new Error("rollback-fixture");
    })).rejects.toThrow("rollback-fixture");
    expect(await database.connection.select().from(requestTypes)).toEqual([]);
});
