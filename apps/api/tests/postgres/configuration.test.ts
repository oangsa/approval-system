import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { configurationSearchSchema, type CreateApprovalPolicy, type UserRole } from "@workflow/contracts";
import { ConfigurationService } from "../../src/Applications/Policies/ConfigurationService";
import { ConfigurationRepository, ConfigurationUnitOfWork } from "../../src/Infrastructures/Database/Repositories/ConfigurationRepository";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import { RequestUnitOfWork } from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { DecisionService } from "../../src/Applications/Approvals/DecisionService";
import { DecisionUnitOfWork } from "../../src/Infrastructures/Database/Repositories/DecisionRepository";
import { IdentityRepository } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import { approvalCycles, approvalPolicies, approvalPolicyVersions, approvalSlots, approvalStages, configurationAuditEvents, departmentMemberships, departments, requestAuditEvents, requestOutboxEvents, requests, requestTypes, requestTypeVersions, reviewerAssignmentRules, sessionFamilies, userRoles, users } from "../../src/Infrastructures/Database/schema";
import { seededDefinition } from "../../src/Infrastructures/Database/seedRequests";
import { createTestDatabase } from "../helpers/testDatabase";
import { readEnvironment } from "../../src/Infrastructures/Configuration/environment";
import { createIdentityComposition } from "../../src/Presentations/composition";
import { createApplication } from "../../src/Presentations/createApplication";
import { TokenProvider } from "../../src/Infrastructures/Security/TokenProvider";
const database = createTestDatabase();
const observer = createTestDatabase();
const db = database.connection;
const service = new ConfigurationService(new ConfigurationUnitOfWork(db));
const otherService = new ConfigurationService(new ConfigurationUnitOfWork(observer.connection));
const requestService = new RequestService(new RequestUnitOfWork(db));
afterAll(async () =>
{
    await database.Close(); await observer.Close();
});
async function fixture()
{
    const departmentId = randomUUID(), otherDepartmentId = randomUUID(), typeId = randomUUID(), versionId = randomUUID();
    await db.insert(departments).values([{ id: departmentId, code: departmentId, name: "Routing department" }, { id: otherDepartmentId, code: otherDepartmentId, name: "Other department" }]);
    async function actor(roles: UserRole[])
    {
        const id = randomUUID(), familyId = randomUUID();
        await db.insert(users).values({ id, email: `${id}@example.test`, displayName: `Routing ${roles.join("+")}`, passwordHash: "not-for-login" });
        await db.insert(userRoles).values(roles.map((roleCode) => ({ userId: id, roleCode })));
        await db.insert(departmentMemberships).values({ userId: id, departmentId, isPrimary: true });
        await db.insert(sessionFamilies).values({ id: familyId, userId: id, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
        return (await new IdentityRepository(db).ReadCurrentIdentity(id, familyId))!;
    }
    const admin = await actor(["ADMINISTRATOR"]), owner = await actor(["REQUESTER"]), reviewer = await actor(["REVIEWER"]), peer = await actor(["REVIEWER"]);
    await db.insert(requestTypes).values({ id: typeId, code: typeId });
    await db.insert(requestTypeVersions).values({ id: versionId, typeId, versionNumber: 1, definition: { ...seededDefinition, id: typeId, versionId, code: typeId, name: { en: `Routing fixture ${typeId}` }, monetary: true, fields: [] } });
    await db.update(requestTypes).set({ publishedVersionId: versionId }).where(eq(requestTypes.id, typeId));
    const mapping = await service.Assignment(admin, null, { key: `review-${randomUUID()}`, departmentId, reviewerUserIds: [reviewer.account.id], isActive: true });
    const policyInput: CreateApprovalPolicy = { code: `POLICY-${randomUUID()}`, priority: 10, typeId, departmentId: null, minAmount: null, maxAmount: null, stages: [{ stageNumber: 1, reviewerAssignmentKeys: [mapping.key], slaBusinessMinutes: 480 }] };
    const createPublished = async (input = policyInput) =>
    {
        const draft = await service.CreatePolicy(admin, input);
        return service.PolicyAction(admin, draft.id, "publish", { expectedVersion: 0 }, randomUUID());
    };
    const draftRequest = (amount = "10.00") => requestService.Mutate(owner, "create", null, { typeId, formDefinitionVersionId: versionId, title: "Confidential routing request", justification: "Routing fixture", monetaryAmount: amount, fields: {} }, randomUUID());
    return { admin, owner, reviewer, peer, departmentId, otherDepartmentId, typeId, versionId, mapping, policyInput, createPublished, draftRequest };
}
async function evidence(requestId: string)
{
    return {
        request: (await db.select().from(requests).where(eq(requests.id, requestId)))[0],
        cycles: await db.select().from(approvalCycles).where(eq(approvalCycles.requestId, requestId)),
        audit: await db.select().from(requestAuditEvents).where(eq(requestAuditEvents.requestId, requestId)),
        outbox: await db.select().from(requestOutboxEvents).where(sql`${requestOutboxEvents.payload}->>'requestId' = ${requestId}`),
    };
}
test("EP-022/049–060 admin HTTP lifecycle, direct DTOs, security, lookup paging and stale writes", async () =>
{
    const f = await fixture();
    const environment = readEnvironment({ NODE_ENV: "test", DATABASE_URL: process.env.TEST_DATABASE_URL, AUTH_JWT_SECRET: "policy-test-secret-0123456789abcdef0123456789", AUTH_JWT_ISSUER: "policy-tests", AUTH_JWT_AUDIENCE: "policy-api", AUTH_ALLOWED_ORIGINS: "http://localhost:3000", AUTH_COOKIE_SECURE: "false" });
    const identity = await createIdentityComposition(environment, database);
    const tokens = new TokenProvider(environment.AUTH_JWT_SECRET, { Now: () => new Date() }, environment.AUTH_JWT_ISSUER, environment.AUTH_JWT_AUDIENCE);
    const adminToken = await tokens.Sign(f.admin.account.id, f.admin.family.id, 0);
    const ownerToken = await tokens.Sign(f.owner.account.id, f.owner.family.id, 0);
    const app = createApplication(undefined, identity, requestService, undefined, undefined, undefined, undefined, service);
    const send = (method: string, path: string, body: unknown = {}, token: string | null = adminToken, key?: string) => app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(key ? { "Idempotency-Key": key } : {}) }, body: JSON.stringify(body) }));
    const policyPath = "/admin/approval-policies";
    for (const path of [policyPath, "/admin/reviewer-assignments", "/admin/budget-policies", "/reviewers/eligible/search", "/departments/search"])
    {
        expect((await send("POST", path, {}, null)).status).toBe(401);
        expect((await send("POST", path, {}, ownerToken)).status).toBe(403);
    }
    const createdResponse = await send("POST", policyPath, f.policyInput);
    expect(createdResponse.status).toBe(201);
    const draft = await createdResponse.json();
    expect(draft).toMatchObject({ isPublished: false, version: 0 });
    const patch = await send("PATCH", `${policyPath}/${draft.id}/draft`, { expectedVersion: 0, priority: 99 });
    expect(patch.status).toBe(200);
    expect((await patch.json()).priority).toBe(99);
    expect((await send("POST", `${policyPath}/${draft.id}/publish`, { expectedVersion: 1 })).status).toBe(422);
    const published = await send("POST", `${policyPath}/${draft.id}/publish`, { expectedVersion: 1 }, adminToken, randomUUID());
    expect(published.status).toBe(201);
    const version = await published.json();
    expect(version).toMatchObject({ isPublished: true, versionNumber: 1, version: 2, priority: 99 });
    expect((await send("POST", `${policyPath}/${draft.id}/draft`, { expectedVersion: 2 })).status).toBe(201);
    expect((await send("PATCH", `${policyPath}/${draft.id}/draft`, { expectedVersion: 2, priority: 2 })).status).toBe(409);
    expect((await send("POST", `${policyPath}/${draft.id}/disable`, { expectedVersion: 3 })).status).toBe(200);
    const assignmentResponse = await send("POST", "/admin/reviewer-assignments", { key: `GLOBAL-${randomUUID()}`, reviewerUserIds: [f.reviewer.account.id], isActive: true });
    expect(assignmentResponse.status).toBe(201);
    const assignment = await assignmentResponse.json();
    const updated = await send("PATCH", `/admin/reviewer-assignments/${assignment.id}`, { expectedVersion: 0, reviewerUserIds: [f.reviewer.account.id, f.peer.account.id] });
    expect(updated.status).toBe(200);
    expect((await updated.json()).reviewerUserIds).toHaveLength(2);
    const budgetResponse = await send("POST", "/admin/budget-policies", { typeId: f.typeId, departmentId: f.departmentId, maxAmount: "10.01", isActive: true });
    expect(budgetResponse.status).toBe(201);
    const budget = await budgetResponse.json();
    expect((await send("PATCH", `/admin/budget-policies/${budget.id}`, { expectedVersion: 0, maxAmount: "20.02" })).status).toBe(200);
    for (const kind of ["approval-policies", "reviewer-assignments", "budget-policies"])
    {
        const result = await send("POST", `/admin/${kind}/search`, { pageSize: 1 });
        expect(result.status).toBe(200);
        expect(JSON.parse(result.headers.get("X-Pagination")!)).toMatchObject({ pageSize: 1, currentPage: 1 });
        expect(await result.json()).toHaveLength(1);
    }
    const eligible = await send("POST", "/reviewers/eligible/search", { search: [{ name: "id", condition: "EQUAL", value: f.reviewer.account.id }], pageSize: 1 });
    const candidates = await eligible.json();
    expect(candidates).toEqual([{ id: f.reviewer.account.id, displayName: f.reviewer.account.displayName, departmentId: f.departmentId }]);
    expect(JSON.stringify(candidates)).not.toMatch(/email|password|title|justification|authVersion/);
    const draftRequest = await f.draftRequest();
    expect((await app.handle(new Request(`http://localhost/api/v1/requests/${draftRequest.id}`, { headers: { Authorization: `Bearer ${adminToken}` } }))).status).toBe(404);
    for (const body of [{ pageSize: 101 }, { orderBy: "priority desc" }, { searchTerm: { name: "code", value: "x" } }]) expect((await send("POST", "/reviewers/eligible/search", body)).status).toBe(422);
    const cors = await app.handle(new Request("http://localhost/api/v1/admin/approval-policies/search", { method: "OPTIONS", headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" } }));
    expect(cors.status).toBe(204);
});
test("CX-12 concurrent publication uses expectedVersion, replay survives branch and audit is immutable", async () =>
{
    const f = await fixture();
    const draft = await service.CreatePolicy(f.admin, f.policyInput);
    const key = randomUUID();
    const results = await Promise.allSettled([service.PolicyAction(f.admin, draft.id, "publish", { expectedVersion: 0 }, key), otherService.PolicyAction(f.admin, draft.id, "publish", { expectedVersion: 0 }, randomUUID())]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(results.find((item) => item.status === "rejected")).toMatchObject({ reason: { code: "CONFLICT" } });
    const versions = await db.select().from(approvalPolicyVersions).where(eq(approvalPolicyVersions.code, draft.code));
    expect(versions).toHaveLength(1);
    const published = await service.Search(f.admin, "approval-policies", configurationSearchSchema("approval-policies").parse({ search: [{ name: "id", condition: "EQUAL", value: draft.id }] }));
    const result = published.items[0]!;
    if (!("stages" in result)) throw new Error("Expected policy");
    const branch = await service.PolicyAction(f.admin, draft.id, "branch", { expectedVersion: 1 });
    expect(branch.versionId).toBeNull();
    const replayKey = results[0]!.status === "fulfilled" ? key : null;
    if (replayKey)
    {
        expect(await service.PolicyAction(f.admin, draft.id, "publish", { expectedVersion: 0 }, replayKey)).toEqual(result);
        await expect(service.PolicyAction(f.admin, draft.id, "publish", { expectedVersion: 1 }, replayKey)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    }
    await expect(db.update(approvalPolicyVersions).set({ priority: 999 }).where(eq(approvalPolicyVersions.id, versions[0]!.id))).rejects.toThrow();
    await expect(db.update(configurationAuditEvents).set({ action: "CHANGED" }).where(eq(configurationAuditEvents.resourceId, draft.id))).rejects.toThrow();
    expect((await db.select().from(configurationAuditEvents).where(eq(configurationAuditEvents.resourceId, draft.id))).map((item) => item.action)).toEqual(["POLICY_CREATED", "POLICY_PUBLISH", "POLICY_BRANCH"]);
});
test("DB-03/07/13 ALL mapping expansion, department override and immutable in-flight snapshots", async () =>
{
    const f = await fixture();
    const mapping = await service.Assignment(f.admin, f.mapping.id, { expectedVersion: 0, reviewerUserIds: [f.reviewer.account.id, f.peer.account.id] });
    const policy = await f.createPublished();
    const draft = await f.draftRequest();
    const submitted = await requestService.Mutate(f.owner, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    expect(submitted.currentApprovers.map((slot) => slot.reviewer.id).sort()).toEqual([f.reviewer.account.id, f.peer.account.id].sort());
    const before = await evidence(draft.id);
    await service.Assignment(f.admin, mapping.id, { expectedVersion: 1, isActive: false });
    await service.PolicyAction(f.admin, policy.id, "disable", { expectedVersion: 1 });
    expect((await evidence(draft.id)).cycles).toEqual(before.cycles);
    const decisions = new DecisionService(new DecisionUnitOfWork(db));
    const first = await decisions.Decide(f.reviewer, submitted.currentApprovers.find((slot) => slot.reviewer.id === f.reviewer.account.id)!.slotId, { expectedVersion: 0, decision: "APPROVE" }, randomUUID());
    expect(first.requestStatus).toBe("PENDING");
    const second = await decisions.Decide(f.peer, submitted.currentApprovers.find((slot) => slot.reviewer.id === f.peer.account.id)!.slotId, { expectedVersion: 0, decision: "APPROVE" }, randomUUID());
    expect(second.requestStatus).toBe("APPROVED");
});
test("FT-035 exact ceiling boundaries and scope uniqueness are atomic", async () =>
{
    const f = await fixture();
    await f.createPublished();
    await service.Budget(f.admin, null, { typeId: f.typeId, departmentId: null, maxAmount: "10", isActive: true });
    const budget = await service.Budget(f.admin, null, { typeId: f.typeId, departmentId: f.departmentId, maxAmount: "20.20", isActive: true });
    for (const amount of ["20.19", "20.20"])
    {
        const draft = await f.draftRequest(amount);
        expect((await requestService.Mutate(f.owner, "submit", draft.id, { expectedVersion: 0 }, randomUUID())).status).toBe("PENDING");
    }
    const tooMuch = await f.draftRequest("20.21");
    const before = await evidence(tooMuch.id);
    await expect(requestService.Mutate(f.owner, "submit", tooMuch.id, { expectedVersion: 0 }, randomUUID())).rejects.toMatchObject({ code: "BUDGET_LIMIT_EXCEEDED" });
    expect(await evidence(tooMuch.id)).toEqual(before);
    await expect(service.Budget(f.admin, null, { typeId: f.typeId, departmentId: f.departmentId, maxAmount: "30", isActive: true })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(service.Budget(f.admin, budget.id, { expectedVersion: 99, maxAmount: "30" })).rejects.toMatchObject({ code: "CONFLICT" });
    const changed = await service.Budget(f.admin, budget.id, { expectedVersion: 0, maxAmount: "30" });
    expect(changed.departmentId).toBe(f.departmentId);
});
test("FT-026/031/036 missing later mapping, inactive reviewer and self-only mapping leave zero partial effects", async () =>
{
    const f = await fixture();
    const later = `later-${randomUUID()}`;
    const policy = await f.createPublished({ ...f.policyInput, stages: [...f.policyInput.stages, { stageNumber: 2, reviewerAssignmentKeys: [later], slaBusinessMinutes: 480 }] });
    const draft = await f.draftRequest();
    const before = await evidence(draft.id);
    await expect(requestService.Mutate(f.owner, "submit", draft.id, { expectedVersion: 0 }, randomUUID())).rejects.toMatchObject({ code: "CONFIGURATION_INCOMPLETE" });
    expect(await evidence(draft.id)).toEqual(before);
    const mapping = await service.Assignment(f.admin, null, { key: later, departmentId: f.departmentId, reviewerUserIds: [f.peer.account.id], isActive: true });
    await db.update(users).set({ isActive: false }).where(eq(users.id, f.peer.account.id));
    await expect(requestService.Mutate(f.owner, "submit", draft.id, { expectedVersion: 0 }, randomUUID())).rejects.toMatchObject({ code: "CONFIGURATION_INCOMPLETE" });
    expect(await evidence(draft.id)).toEqual(before);
    await db.insert(userRoles).values({ userId: f.owner.account.id, roleCode: "REVIEWER" });
    await service.Assignment(f.admin, mapping.id, { expectedVersion: 0, reviewerUserIds: [f.owner.account.id] });
    await expect(requestService.Mutate(f.owner, "submit", draft.id, { expectedVersion: 0 }, randomUUID())).rejects.toMatchObject({ code: "CONFIGURATION_INCOMPLETE" });
    expect(await evidence(draft.id)).toEqual(before);
    await service.Assignment(f.admin, mapping.id, { expectedVersion: 1, reviewerUserIds: [f.reviewer.account.id] });
    await f.createPublished({ ...f.policyInput, code: `TIE-${randomUUID()}` });
    await expect(requestService.Mutate(f.owner, "submit", draft.id, { expectedVersion: 0 }, randomUUID())).rejects.toMatchObject({ code: "AMBIGUOUS_APPROVAL_POLICY" });
    expect(await evidence(draft.id)).toEqual(before);
    await service.PolicyAction(f.admin, policy.id, "disable", { expectedVersion: 1 });
});
test("CX-12 concurrent submit and multi-mapping edit see complete old or new routing", async () =>
{
    const f = await fixture();
    const later = await service.Assignment(f.admin, null, { key: `later-${randomUUID()}`, departmentId: f.departmentId, reviewerUserIds: [f.reviewer.account.id], isActive: true });
    await f.createPublished({ ...f.policyInput, stages: [...f.policyInput.stages, { stageNumber: 2, reviewerAssignmentKeys: [later.key], slaBusinessMinutes: 480 }] });
    const draft = await f.draftRequest();
    const [, submitted] = await Promise.all([
        observer.connection.transaction(async (transaction) =>
        {
            const repository = new ConfigurationRepository(transaction);
            await repository.Lock(true);
            await repository.SaveAssignment({ ...f.mapping, reviewerUserIds: [f.peer.account.id], version: 1 });
            await repository.SaveAssignment({ ...later, reviewerUserIds: [f.peer.account.id], version: 1 });
        }),
        requestService.Mutate(f.owner, "submit", draft.id, { expectedVersion: 0 }, randomUUID()),
    ]);
    const reviewers = submitted.currentApprovers.map((slot) => slot.reviewer.id);
    expect(new Set(reviewers).size).toBe(1);
    expect([f.reviewer.account.id, f.peer.account.id]).toContain(reviewers[0]);
    expect((await db.select().from(approvalPolicies).where(eq(approvalPolicies.code, f.policyInput.code)))[0]).toBeDefined();
});

test("PRB-AC-07 Issue #7 seam keeps historical department/form while resolving current policy for new amount", async () =>
{
    const f = await fixture();
    const published = await f.createPublished();
    const draft = await f.draftRequest();
    const submitted = await requestService.Mutate(f.owner, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    const originalCycle = (await evidence(draft.id)).cycles[0]!;
    const branched = await service.PolicyAction(f.admin, published.id, "branch", { expectedVersion: 1 });
    const later = await service.Assignment(f.admin, null, { key: `later-${randomUUID()}`, departmentId: f.departmentId, reviewerUserIds: [f.peer.account.id], isActive: true });
    const patched = await service.PolicyAction(f.admin, published.id, "patch", { expectedVersion: branched.version, minAmount: "20", stages: [...f.policyInput.stages, { stageNumber: 2, reviewerAssignmentKeys: [later.key], slaBusinessMinutes: 480 }] });
    const current = await service.PolicyAction(f.admin, published.id, "publish", { expectedVersion: patched.version }, randomUUID());
    await db.update(departmentMemberships).set({ isActive: false, isPrimary: false }).where(eq(departmentMemberships.userId, f.owner.account.id));
    await db.insert(departmentMemberships).values({ userId: f.owner.account.id, departmentId: f.otherDepartmentId, isPrimary: true });
    const newVersionId = randomUUID();
    await db.insert(requestTypeVersions).values({ id: newVersionId, typeId: f.typeId, versionNumber: 2, definition: { ...seededDefinition, id: f.typeId, versionId: newVersionId, versionNumber: 2, code: f.typeId, name: { en: `Routing fixture ${f.typeId}` }, monetary: true, fields: [] } });
    await db.update(requestTypes).set({ publishedVersionId: newVersionId, isEnabled: false }).where(eq(requestTypes.id, f.typeId));
    const { resolvePlan } = await import("../../src/Domains/Requests/RequestRules");
    const { RequestRepository } = await import("../../src/Infrastructures/Database/Repositories/RequestRepository");
    const config = await db.transaction(async (transaction) =>
    {
        await transaction.execute(sql`select pg_advisory_xact_lock_shared(941309)`);
        return new RequestRepository(transaction).Configuration(f.typeId, f.versionId, f.owner.account.id, submitted.department!);
    });
    expect(config.definition.versionId).toBe(f.versionId);
    expect(config.activeVersionId).toBe(newVersionId);
    expect(config.department!.id).toBe(f.departmentId);
    const plan = resolvePlan(config, f.owner.account.id, "20", { allowDisabledType: true });
    expect(plan.policy.id).toBe(current.versionId);
    expect(plan.policy.stages).toHaveLength(2);
    expect(() => resolvePlan(config, f.owner.account.id, "19.99", { allowDisabledType: true })).toThrow("CONFIGURATION_INCOMPLETE");
    expect((await evidence(draft.id)).cycles[0]).toEqual(originalCycle);
});

test("FT-036 trusted primary department selects scoped mapping before global; stale client department is ignored", async () =>
{
    const f = await fixture();
    await service.Assignment(f.admin, null, { key: f.mapping.key, departmentId: null, reviewerUserIds: [f.peer.account.id], isActive: true });
    await f.createPublished();
    const first = await f.draftRequest();
    const accepted = await requestService.Mutate(f.owner, "submit", first.id, { expectedVersion: 0 }, randomUUID());
    expect(accepted.currentApprovers.map((slot) => slot.reviewer.id)).toEqual([f.reviewer.account.id]);
    const snapshot = (await evidence(first.id)).cycles;
    await db.update(departmentMemberships).set({ isActive: false, isPrimary: false }).where(eq(departmentMemberships.userId, f.owner.account.id));
    await db.insert(departmentMemberships).values({ userId: f.owner.account.id, departmentId: f.otherDepartmentId, isPrimary: true });
    const second = await f.draftRequest();
    const rerouted = await requestService.Mutate(f.owner, "submit", second.id, { expectedVersion: 0 }, randomUUID());
    expect(rerouted.department!.id).toBe(f.otherDepartmentId);
    expect(rerouted.currentApprovers.map((slot) => slot.reviewer.id)).toEqual([f.peer.account.id]);
    expect((await evidence(first.id)).cycles).toEqual(snapshot);
});

test("PRB-AC-04 invalid reviewer references and merged policy bounds fail without configuration/audit changes", async () =>
{
    const f = await fixture();
    const draft = await service.CreatePolicy(f.admin, { ...f.policyInput, minAmount: "10", maxAmount: "20" });
    const before = await db.select().from(configurationAuditEvents);
    await expect(service.Assignment(f.admin, f.mapping.id, { expectedVersion: 0, reviewerUserIds: [f.owner.account.id] })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.Assignment(f.admin, f.mapping.id, { expectedVersion: 0, departmentId: randomUUID() })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(service.PolicyAction(f.admin, draft.id, "patch", { expectedVersion: 0, minAmount: "30" })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await db.select().from(configurationAuditEvents)).toEqual(before);
    const page = await service.Search(f.admin, "approval-policies", configurationSearchSchema("approval-policies").parse({ search: [{ name: "id", condition: "EQUAL", value: draft.id }] }));
    expect(page.items[0]).toMatchObject({ version: 0, minAmount: "10", maxAmount: "20" });
});

test("PRB-AC-04/09 rejected assignment key rename preserves mapping identity, published references, routing, concurrency and audit", async () =>
{
    const f = await fixture();
    await service.Assignment(f.admin, null, { key: f.mapping.key, departmentId: null, reviewerUserIds: [f.peer.account.id], isActive: true });
    const policy = await f.createPublished();
    const environment = readEnvironment({ NODE_ENV: "test", DATABASE_URL: process.env.TEST_DATABASE_URL, AUTH_JWT_SECRET: "policy-test-secret-0123456789abcdef0123456789", AUTH_JWT_ISSUER: "policy-tests", AUTH_JWT_AUDIENCE: "policy-api", AUTH_ALLOWED_ORIGINS: "http://localhost:3000", AUTH_COOKIE_SECURE: "false" });
    const identity = await createIdentityComposition(environment, database);
    const tokens = new TokenProvider(environment.AUTH_JWT_SECRET, { Now: () => new Date() }, environment.AUTH_JWT_ISSUER, environment.AUTH_JWT_AUDIENCE);
    const adminToken = await tokens.Sign(f.admin.account.id, f.admin.family.id, 0);
    const app = createApplication(undefined, identity, requestService, undefined, undefined, undefined, undefined, service);
    const sendPatch = (body: unknown) => app.handle(new Request(`http://localhost/api/v1/admin/reviewer-assignments/${f.mapping.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify(body),
    }));

    expect((await sendPatch({ expectedVersion: 0, key: "renamed-key" })).status).toBe(422);
    await expect(service.Assignment(f.admin, f.mapping.id, { expectedVersion: 0, key: "renamed-key" } as never)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(db.transaction((tx) => new ConfigurationRepository(tx).SaveAssignment({ ...f.mapping, key: "renamed-key", version: 1 }))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    const persisted = (await db.select().from(reviewerAssignmentRules).where(eq(reviewerAssignmentRules.id, f.mapping.id)))[0]!;
    expect(persisted).toMatchObject({ id: f.mapping.id, assignmentKey: f.mapping.key, departmentId: f.departmentId, reviewerUserIds: [f.reviewer.account.id], version: 0 });
    expect((await db.select().from(configurationAuditEvents).where(eq(configurationAuditEvents.resourceId, f.mapping.id))).map((item) => item.action)).toEqual(["ASSIGNMENT_CREATED"]);
    const publishedVersion = (await db.select().from(approvalPolicyVersions).where(eq(approvalPolicyVersions.id, policy.versionId!)))[0]!;
    expect(publishedVersion.stages[0]!.reviewerAssignmentKeys).toEqual([f.mapping.key]);

    const draft = await f.draftRequest();
    const submitted = await requestService.Mutate(f.owner, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    expect(submitted.currentApprovers.map((slot) => slot.reviewer.id)).toEqual([f.reviewer.account.id]);

    const validPatch = await sendPatch({ expectedVersion: 0, reviewerUserIds: [f.reviewer.account.id, f.peer.account.id] });
    expect(validPatch.status).toBe(200);
    expect(await validPatch.json()).toMatchObject({ id: f.mapping.id, key: f.mapping.key, version: 1, reviewerUserIds: [f.reviewer.account.id, f.peer.account.id] });
    expect((await sendPatch({ expectedVersion: 0, isActive: false })).status).toBe(409);

    const audits = await db.select().from(configurationAuditEvents).where(eq(configurationAuditEvents.resourceId, f.mapping.id));
    expect(audits.map((item) => item.action)).toEqual(["ASSIGNMENT_CREATED", "ASSIGNMENT_UPDATED"]);
    expect(audits[1]!.before).toMatchObject({ key: f.mapping.key, version: 0 });
    expect(audits[1]!.after).toMatchObject({ key: f.mapping.key, version: 1 });
});

test("CX-12/PRB-AC-09 concurrent policy v2 publication and request submission commit complete v1 or v2 snapshot without mixing", async () =>
{
    const observed = new Set<"v1" | "v2">();
    for (const mode of ["race-a", "race-b", "publish-holds-lock", "submit-holds-lock"] as const)
    {
        const f = await fixture();
        const v1 = await f.createPublished();
        const stage1V2 = await service.Assignment(f.admin, null, { key: `v2-s1-${randomUUID()}`, departmentId: f.departmentId, reviewerUserIds: [f.peer.account.id], isActive: true });
        const stage2V2 = await service.Assignment(f.admin, null, { key: `v2-s2-${randomUUID()}`, departmentId: f.departmentId, reviewerUserIds: [f.reviewer.account.id, f.peer.account.id], isActive: true });
        const branched = await service.PolicyAction(f.admin, v1.id, "branch", { expectedVersion: v1.version });
        const patched = await service.PolicyAction(f.admin, v1.id, "patch", {
            expectedVersion: branched.version,
            priority: 25,
            stages: [
                { stageNumber: 1, reviewerAssignmentKeys: [stage1V2.key], slaBusinessMinutes: 240 },
                { stageNumber: 2, reviewerAssignmentKeys: [stage2V2.key], slaBusinessMinutes: 360 },
            ],
        });
        const draft = await f.draftRequest();
        const publishKey = randomUUID();
        const submitKey = randomUUID();

        let v2: Awaited<ReturnType<ConfigurationService["PolicyAction"]>>;
        let submitted: Awaited<ReturnType<RequestService["Mutate"]>>;
        if (mode === "publish-holds-lock")
        {
            let releaseSubmit!: () => void;
            const publishReady = new Promise<void>((resolve) =>
            {
                releaseSubmit = resolve;
            });
            const heldPublish = new ConfigurationService({
                Run: (operation) => new ConfigurationUnitOfWork(observer.connection).Run(async (repository) =>
                {
                    const result = await operation(repository);
                    releaseSubmit();
                    await new Promise((resolve) => setTimeout(resolve, 25));
                    return result;
                }),
            });
            [v2, submitted] = await Promise.all([
                heldPublish.PolicyAction(f.admin, v1.id, "publish", { expectedVersion: patched.version }, publishKey),
                publishReady.then(() => requestService.Mutate(f.owner, "submit", draft.id, { expectedVersion: 0 }, submitKey)),
            ]);
        }
        else if (mode === "submit-holds-lock")
        {
            let releasePublish!: () => void;
            const submitReady = new Promise<void>((resolve) =>
            {
                releasePublish = resolve;
            });
            const heldSubmit = new RequestService({
                Run: (operation) => new RequestUnitOfWork(db).Run(async (repository) =>
                {
                    releasePublish();
                    await new Promise((resolve) => setTimeout(resolve, 25));
                    return operation(repository);
                }),
            });
            [submitted, v2] = await Promise.all([
                heldSubmit.Mutate(f.owner, "submit", draft.id, { expectedVersion: 0 }, submitKey),
                submitReady.then(() => otherService.PolicyAction(f.admin, v1.id, "publish", { expectedVersion: patched.version }, publishKey)),
            ]);
        }
        else if (mode === "race-a")
        {
            [v2, submitted] = await Promise.all([
                otherService.PolicyAction(f.admin, v1.id, "publish", { expectedVersion: patched.version }, publishKey),
                requestService.Mutate(f.owner, "submit", draft.id, { expectedVersion: 0 }, submitKey),
            ]);
        }
        else
        {
            [submitted, v2] = await Promise.all([
                requestService.Mutate(f.owner, "submit", draft.id, { expectedVersion: 0 }, submitKey),
                otherService.PolicyAction(f.admin, v1.id, "publish", { expectedVersion: patched.version }, publishKey),
            ]);
        }

        expect(v2).toMatchObject({ id: v1.id, isPublished: true, versionNumber: 2 });
        const versions = await db.select().from(approvalPolicyVersions).where(eq(approvalPolicyVersions.code, v1.code)).orderBy(asc(approvalPolicyVersions.versionNumber));
        expect(versions.map((row) => ({ id: row.id, versionNumber: row.versionNumber, isActive: row.isActive }))).toEqual([
            { id: v1.versionId, versionNumber: 1, isActive: false },
            { id: v2.versionId, versionNumber: 2, isActive: true },
        ]);
        const policyAudits = await db.select().from(configurationAuditEvents).where(eq(configurationAuditEvents.resourceId, v1.id));
        expect(policyAudits.filter((item) => item.action === "POLICY_PUBLISH")).toHaveLength(2);

        const saved = await evidence(draft.id);
        expect(submitted.status).toBe("PENDING");
        expect(saved.request?.status).toBe("PENDING");
        expect(saved.cycles).toHaveLength(1);
        expect(saved.audit.filter((event) => event.eventType === "REQUEST_SUBMITTED")).toHaveLength(1);
        expect(saved.outbox.filter((event) => event.eventType === "REQUEST_SUBMITTED")).toHaveLength(1);

        const cycle = saved.cycles[0]!;
        const stages = await db.select().from(approvalStages).where(eq(approvalStages.cycleId, cycle.id)).orderBy(asc(approvalStages.stageNumber));
        const slots = await db.select().from(approvalSlots).where(inArray(approvalSlots.stageId, stages.map((stage) => stage.id))).orderBy(asc(approvalSlots.assignmentKey), asc(approvalSlots.reviewerId));
        const snapshot = cycle.snapshot as {
            policy: { id: string; priority: number; stages: Array<{ stageNumber: number; reviewerAssignmentKeys: string[]; slaBusinessMinutes: number }> };
            assignments: Array<{ assignmentKey: string; reviewerId: string }>;
        };

        expect([v1.versionId, v2.versionId]).toContain(cycle.policyVersionId);
        if (cycle.policyVersionId === v1.versionId)
        {
            observed.add("v1");
            expect(snapshot.policy).toMatchObject({
                id: v1.versionId,
                priority: 10,
                stages: [{ stageNumber: 1, reviewerAssignmentKeys: [f.mapping.key], slaBusinessMinutes: 480 }],
            });
            expect(snapshot.assignments.map((item) => ({ key: item.assignmentKey, reviewerId: item.reviewerId }))).toEqual([
                { key: f.mapping.key, reviewerId: f.reviewer.account.id },
            ]);
            expect(stages.map((stage) => ({ stageNumber: stage.stageNumber, status: stage.status, slaBusinessMinutes: stage.slaBusinessMinutes }))).toEqual([
                { stageNumber: 1, status: "ACTIVE", slaBusinessMinutes: 480 },
            ]);
            expect(slots.map((slot) => ({ key: slot.assignmentKey, reviewerId: slot.reviewerId, status: slot.status }))).toEqual([
                { key: f.mapping.key, reviewerId: f.reviewer.account.id, status: "ACTIONABLE" },
            ]);
            expect(submitted.currentApprovers.map((slot) => ({ stageNumber: slot.stageNumber, reviewerId: slot.reviewer.id, status: slot.status }))).toEqual([
                { stageNumber: 1, reviewerId: f.reviewer.account.id, status: "ACTIONABLE" },
            ]);
        }
        else
        {
            observed.add("v2");
            expect(snapshot.policy).toMatchObject({
                id: v2.versionId,
                priority: 25,
                stages: [
                    { stageNumber: 1, reviewerAssignmentKeys: [stage1V2.key], slaBusinessMinutes: 240 },
                    { stageNumber: 2, reviewerAssignmentKeys: [stage2V2.key], slaBusinessMinutes: 360 },
                ],
            });
            expect(snapshot.assignments.map((item) => ({ key: item.assignmentKey, reviewerId: item.reviewerId })).sort((a, b) => `${a.key}:${a.reviewerId}`.localeCompare(`${b.key}:${b.reviewerId}`))).toEqual(
                [
                    { key: stage1V2.key, reviewerId: f.peer.account.id },
                    { key: stage2V2.key, reviewerId: f.reviewer.account.id },
                    { key: stage2V2.key, reviewerId: f.peer.account.id },
                ].sort((a, b) => `${a.key}:${a.reviewerId}`.localeCompare(`${b.key}:${b.reviewerId}`)),
            );
            expect(stages.map((stage) => ({ stageNumber: stage.stageNumber, status: stage.status, slaBusinessMinutes: stage.slaBusinessMinutes }))).toEqual([
                { stageNumber: 1, status: "ACTIVE", slaBusinessMinutes: 240 },
                { stageNumber: 2, status: "WAITING", slaBusinessMinutes: 360 },
            ]);
            expect(slots.map((slot) => ({ key: slot.assignmentKey, reviewerId: slot.reviewerId, status: slot.status }))).toEqual(
                [
                    { key: stage1V2.key, reviewerId: f.peer.account.id, status: "ACTIONABLE" },
                    { key: stage2V2.key, reviewerId: f.reviewer.account.id, status: "WAITING" },
                    { key: stage2V2.key, reviewerId: f.peer.account.id, status: "WAITING" },
                ].sort((a, b) => `${a.key}:${a.reviewerId}`.localeCompare(`${b.key}:${b.reviewerId}`)),
            );
            expect(submitted.currentApprovers.map((slot) => ({ stageNumber: slot.stageNumber, reviewerId: slot.reviewer.id, status: slot.status })).sort((a, b) => `${a.stageNumber}:${a.reviewerId}`.localeCompare(`${b.stageNumber}:${b.reviewerId}`))).toEqual(
                [
                    { stageNumber: 1, reviewerId: f.peer.account.id, status: "ACTIONABLE" },
                    { stageNumber: 2, reviewerId: f.reviewer.account.id, status: "WAITING" },
                    { stageNumber: 2, reviewerId: f.peer.account.id, status: "WAITING" },
                ].sort((a, b) => `${a.stageNumber}:${a.reviewerId}`.localeCompare(`${b.stageNumber}:${b.reviewerId}`)),
            );
        }
    }
    expect(observed).toEqual(new Set(["v1", "v2"]));
});
