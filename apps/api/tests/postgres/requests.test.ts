import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { requestDetailSchema, type CreateRequest, type PublishedRequestType } from "@workflow/contracts";
import { createTestDatabase } from "../helpers/testDatabase";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import { RequestRepository, RequestUnitOfWork } from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { approvalCycles, approvalPolicyVersions, approvalSlots, approvalStages, budgetPolicies, departmentMemberships, departments, idempotencyRecords, requestAuditEvents, requestOutboxEvents, requestRevisions, requests, requestTypes, requestTypeVersions, reviewerAssignmentRules, sessionFamilies, userRoles, users } from "../../src/Infrastructures/Database/schema";
import { IdentityRepository } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import { seededDefinition } from "../../src/Infrastructures/Database/seedRequests";
import { createIdentityComposition } from "../../src/Presentations/composition";
import { readEnvironment } from "../../src/Infrastructures/Configuration/environment";
import { createApplication } from "../../src/Presentations/createApplication";
import type { IRequestRepository, IRequestUnitOfWork } from "../../src/Domains/Requests/Ports";

const database = createTestDatabase();
const observer = createTestDatabase();
const db = database.connection;
const service = new RequestService(new RequestUnitOfWork(db));
afterAll(async () =>
{
    await database.Close();
    await observer.Close();
});
// This suite writes unique fixtures to the isolated disposable workflow_test database.
// Submitted evidence is deliberately never deleted or unlocked just for cleanup.
async function fixture(monetary = false, supportsLineItems = false)
{
    const ownerId = randomUUID(), reviewerId = randomUUID(), departmentId = randomUUID(), typeId = randomUUID(), versionId = randomUUID(), policyId = randomUUID(), assignmentId = randomUUID(), familyId = randomUUID();
    const definition: PublishedRequestType = { ...seededDefinition, id: typeId, versionId, code: `T${typeId}`, monetary, supportsLineItems };
    await db.transaction(async (tx) =>
    {
        await tx.insert(users).values([ownerId, reviewerId].map((id) => ({ id, email: `${id}@example.test`, displayName: id === ownerId ? "Owner" : "Reviewer", passwordHash: "not-for-login" })));
        await tx.insert(userRoles).values([{ userId: ownerId, roleCode: "REQUESTER" }, { userId: reviewerId, roleCode: "REVIEWER" }]);
        await tx.insert(departments).values({ id: departmentId, code: departmentId, name: "Operations" });
        await tx.insert(departmentMemberships).values({ userId: ownerId, departmentId, isPrimary: true });
        await tx.insert(sessionFamilies).values({ id: familyId, userId: ownerId, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
        await tx.insert(requestTypes).values({ id: typeId, code: definition.code });
        await tx.insert(requestTypeVersions).values({ id: versionId, typeId, versionNumber: 1, definition });
        await tx.update(requestTypes).set({ publishedVersionId: versionId }).where(eq(requestTypes.id, typeId));
        await tx.insert(approvalPolicyVersions).values({ id: policyId, typeId, code: policyId, versionNumber: 1, priority: 1, stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 480 }] });
        await tx.insert(reviewerAssignmentRules).values({ id: assignmentId, assignmentKey: "review", departmentId, reviewerId });
    });
    const actor = (await new IdentityRepository(db).ReadCurrentIdentity(ownerId, familyId))!;
    const content: CreateRequest = { typeId, formDefinitionVersionId: versionId, title: "Operational request", justification: "Needed for the team", priority: "HIGH", fields: { category: "OPERATIONS" }, ...(monetary ? supportsLineItems ? { lineItems: [{ description: "Parts", quantity: "1.5", unitAmount: "10.01" }] } : { monetaryAmount: "10.00" } : {}) };
    const draft = () => service.Mutate(actor, "create", null, content, randomUUID());
    return { actor, content, draft, ownerId, reviewerId, departmentId, typeId, versionId, policyId, assignmentId };
}
async function counts(id: string)
{
    return {
        cycles: (await observer.connection.select().from(approvalCycles).where(eq(approvalCycles.requestId, id))).length,
        revisions: (await observer.connection.select().from(requestRevisions).where(eq(requestRevisions.requestId, id))).length,
        audit: (await observer.connection.select().from(requestAuditEvents).where(eq(requestAuditEvents.requestId, id))).length,
    };
}
test("DB-03/04/09 durable create/submit replay, number, immutable evidence and direct read", async () =>
{
    const item = await fixture();
    const key = randomUUID();
    const draft = await service.Mutate(item.actor, "create", null, item.content, key);
    expect(draft).toMatchObject({ status: "DRAFT", requestNumber: null, version: 0, requester: { id: item.ownerId } });
    expect(await service.Mutate(item.actor, "create", null, { ...item.content, fields: { category: "OPERATIONS" } }, key)).toEqual(draft);
    await expect(service.Mutate(item.actor, "create", null, { ...item.content, title: "changed" }, key)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const submitKey = randomUUID();
    const submitted = await service.Mutate(item.actor, "submit", draft.id, { expectedVersion: 0 }, submitKey);
    expect(submitted).toMatchObject({ status: "PENDING", version: 1, workingRevision: null, department: { id: item.departmentId }, submittedRevision: { submittedBy: item.ownerId, formDefinitionVersionId: item.versionId } });
    expect(submitted.requestNumber).toMatch(/^REQ-\d{8,}$/);
    expect(submitted.currentApprovers).toHaveLength(1);
    const restarted = new RequestService(new RequestUnitOfWork(observer.connection));
    expect(await restarted.Mutate(item.actor, "submit", draft.id, { expectedVersion: 0 }, submitKey)).toEqual(submitted);
    await expect(restarted.Mutate(item.actor, "submit", draft.id, { expectedVersion: 1 }, submitKey)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    expect(await service.Read(item.actor, draft.id)).toEqual(submitted);
    expect(await counts(draft.id)).toEqual({ cycles: 1, revisions: 1, audit: 2 });
    expect(await db.select().from(requestOutboxEvents).where(eq(requestOutboxEvents.eventKey, `REQUEST_SUBMITTED:${submitted.currentCycleId}`))).toHaveLength(1);
    await expect(service.Mutate(item.actor, "patch", draft.id, { expectedVersion: 1, title: "illegal" })).rejects.toMatchObject({ code: "INVALID_REQUEST_TRANSITION" });
    await expect(db.update(requestRevisions).set({ fields: { hacked: true } }).where(eq(requestRevisions.id, submitted.submittedRevision!.id))).rejects.toThrow();
    await expect(db.update(requests).set({ requestNumber: "changed" }).where(eq(requests.id, draft.id))).rejects.toThrow();
    expect(await counts(draft.id)).toEqual({ cycles: 1, revisions: 1, audit: 2 });
});
test("CX-07/08 distinct concurrent submits get distinct numbers; same-key race accepts one cycle", async () =>
{
    const a = await fixture();
    const b = await fixture();
    const [one, two] = await Promise.all([a.draft(), b.draft()]);
    const [first, second] = await Promise.all([service.Mutate(a.actor, "submit", one.id, { expectedVersion: 0 }, randomUUID()), service.Mutate(b.actor, "submit", two.id, { expectedVersion: 0 }, randomUUID())]);
    expect(first.requestNumber).not.toBe(second.requestNumber);
    const c = await fixture();
    const draft = await c.draft();
    const key = randomUUID();
    const results = await Promise.all([service.Mutate(c.actor, "submit", draft.id, { expectedVersion: 0 }, key), new RequestService(new RequestUnitOfWork(observer.connection)).Mutate(c.actor, "submit", draft.id, { expectedVersion: 0 }, key)]);
    expect(results[0]).toEqual(results[1]);
    expect(await counts(draft.id)).toEqual({ cycles: 1, revisions: 1, audit: 2 });
});
test("CX-14 stale edits do not lose writes; partial patch preserves fields and submitted/terminal edits fail", async () =>
{
    const item = await fixture();
    const draft = await item.draft();
    const results = await Promise.allSettled(["one", "two"].map((title) => service.Mutate(item.actor, "patch", draft.id, { expectedVersion: 0, title })));
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "REQUEST_STALE" } });
    expect((await service.Read(item.actor, draft.id)).workingRevision?.fields).toEqual(item.content.fields);
    for (const status of ["APPROVED", "REJECTED", "WITHDRAWN"] as const)
    {
        await db.update(requests).set({ status }).where(eq(requests.id, draft.id));
        await expect(service.Mutate(item.actor, "patch", draft.id, { expectedVersion: 1, title: "illegal" })).rejects.toMatchObject({ code: "INVALID_REQUEST_TRANSITION" });
    }
    expect((await counts(draft.id)).audit).toBe(2);
});
test.each(["missing", "inactive", "self", "department", "form", "budget"] as const)("DB-04 validation failure %s preserves draft", async (condition) =>
{
    const item = await fixture(condition === "budget");
    const draft = await item.draft();
    if (condition === "missing") await db.update(reviewerAssignmentRules).set({ isActive: false }).where(eq(reviewerAssignmentRules.id, item.assignmentId));
    if (condition === "inactive") await db.update(users).set({ isActive: false }).where(eq(users.id, item.reviewerId));
    if (condition === "self")
    {
        await db.insert(userRoles).values({ userId: item.ownerId, roleCode: "REVIEWER" });
        await db.update(reviewerAssignmentRules).set({ reviewerId: item.ownerId }).where(eq(reviewerAssignmentRules.id, item.assignmentId));
    }
    if (condition === "department") await db.update(departments).set({ isActive: false }).where(eq(departments.id, item.departmentId));
    if (condition === "form")
    {
        const versionId = randomUUID();
        await db.insert(requestTypeVersions).values({ id: versionId, typeId: item.typeId, versionNumber: 2, definition: { ...seededDefinition, id: item.typeId, versionId, versionNumber: 2 } });
        await db.update(requestTypes).set({ publishedVersionId: versionId }).where(eq(requestTypes.id, item.typeId));
    }
    if (condition === "budget") await db.insert(budgetPolicies).values({ id: randomUUID(), typeId: item.typeId, maxAmount: "9.99" });
    await expect(service.Mutate(item.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID())).rejects.toMatchObject({ code: condition === "form" ? "FORM_DEFINITION_CHANGED" : condition === "budget" ? "BUDGET_LIMIT_EXCEEDED" : "CONFIGURATION_INCOMPLETE" });
    expect(await service.Read(item.actor, draft.id)).toMatchObject({ status: "DRAFT", version: 0, requestNumber: null });
    expect(await counts(draft.id)).toEqual({ cycles: 0, revisions: 1, audit: 1 });
});
test("DB-01/03 failure after all submit writes rolls back cycle, slots, number, audit, outbox and claim", async () =>
{
    const item = await fixture();
    const draft = await item.draft();
    const key = randomUUID();
    const failing: IRequestUnitOfWork = { Run: (operation) => db.transaction((tx) =>
    {
        const repository = new RequestRepository(tx);
        const proxy = new Proxy(repository, { get(target, property)
        {
            if (property === "Complete") return async () =>
            {
                throw new Error("injected precommit failure");
            };
            const value: unknown = Reflect.get(target, property);
            return typeof value === "function" ? value.bind(target) : value;
        } });
        return operation(proxy as IRequestRepository);
    }) };
    await expect(new RequestService(failing).Mutate(item.actor, "submit", draft.id, { expectedVersion: 0 }, key)).rejects.toThrow("injected precommit failure");
    expect(await service.Read(item.actor, draft.id)).toMatchObject({ status: "DRAFT", workingRevision: { submittedAt: null }, requestNumber: null });
    expect(await counts(draft.id)).toEqual({ cycles: 0, revisions: 1, audit: 1 });
    expect(await db.select().from(idempotencyRecords).where(and(eq(idempotencyRecords.actorId, item.ownerId), eq(idempotencyRecords.key, key)))).toHaveLength(0);
    expect(await db.select().from(requestOutboxEvents).where(sql`${requestOutboxEvents.payload}->>'requestId' = ${draft.id}`)).toHaveLength(0);
    const accepted = await service.Mutate(item.actor, "submit", draft.id, { expectedVersion: 0 }, key);
    expect(accepted.status).toBe("PENDING");
    expect(await db.select().from(approvalStages).where(eq(approvalStages.cycleId, accepted.currentCycleId!))).toHaveLength(1);
    expect(await db.select().from(approvalSlots).innerJoin(approvalStages, eq(approvalSlots.stageId, approvalStages.id)).where(eq(approvalStages.cycleId, accepted.currentCycleId!))).toHaveLength(1);
});
test("EP-033/035/036 HTTP strict writes, status, location, errors, CORS and foreign privacy", async () =>
{
    const item = await fixture();
    const identity = await createIdentityComposition(readEnvironment({ ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }), database);
    const tokenProvider = (await import("../../src/Infrastructures/Security/TokenProvider")).TokenProvider;
    const env = readEnvironment({ ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL });
    const token = await new tokenProvider(env.AUTH_JWT_SECRET, { Now: () => new Date() }, env.AUTH_JWT_ISSUER, env.AUTH_JWT_AUDIENCE).Sign(item.ownerId, item.actor.family.id, 0);
    const app = createApplication(undefined, identity, service);
    const send = (method: string, path: string, body?: unknown, authorization = `Bearer ${token}`, key = randomUUID()) => app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers: { authorization, "content-type": "application/json", "Idempotency-Key": key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
    expect((await send("POST", "/requests", item.content, "")).status).toBe(401);
    const lookup = await send("POST", "/request-types/search", { pageSize: 1, search: [{ name: "code", condition: "EQUAL", value: `T${item.typeId}` }] });
    expect(lookup.status).toBe(200);
    expect(await lookup.json()).toMatchObject([{ id: item.typeId, versionId: item.versionId }]);
    expect(JSON.parse(lookup.headers.get("x-pagination")!)).toMatchObject({ totalCount: 1, pageSize: 1 });
    expect((await send("POST", "/request-types/search", { orderBy: "password_hash desc" })).status).toBe(422);
    expect((await send("GET", `/request-types/${item.typeId}`)).status).toBe(200);
    expect((await send("POST", "/requests", { ...item.content, ownerId: item.ownerId })).status).toBe(422);
    const hidden = await send("POST", "/requests", { ...item.content, fields: { category: "OPERATIONS", reason: "hidden" } });
    expect(hidden.status).toBe(422);
    expect(await hidden.json()).toMatchObject({ code: "FORM_FIELD_NOT_APPLICABLE", details: [{ field: "fields.reason" }] });
    const created = await send("POST", "/requests", item.content);
    expect(created.status).toBe(201);
    const draft = requestDetailSchema.parse(await created.json());
    expect(created.headers.get("location")).toBe(`/api/v1/requests/${draft.id}`);
    expect(created.headers.get("cache-control")).toBe("no-store");
    const patched = await send("PATCH", `/requests/${draft.id}/draft`, { expectedVersion: 0, title: "Updated" });
    expect(patched.status).toBe(200);
    expect((await send("POST", `/requests/${draft.id}/submit`, { expectedVersion: 0 })).status).toBe(409);
    const submitted = await send("POST", `/requests/${draft.id}/submit`, { expectedVersion: 1 });
    expect(submitted.status).toBe(200);
    expect(requestDetailSchema.parse(await submitted.json()).title).toBe("Updated");
    expect((await send("GET", `/requests/${randomUUID()}`)).status).toBe(404);
    const other = await fixture();
    await expect(service.Read(other.actor, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const preflight = await app.handle(new Request("http://localhost/api/v1/requests", { method: "OPTIONS", headers: { origin: env.AUTH_ALLOWED_ORIGINS[0]!, "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type,idempotency-key" } }));
    expect(preflight.status).toBe(204);
});

test("FT-015 line-item totals persist exactly and DB uniqueness rejects number collisions", async () =>
{
    const item = await fixture(true, true);
    const draft = await item.draft();
    expect(draft.workingRevision).toMatchObject({ amount: "15.02", currency: "THB", lineItems: [{ totalAmount: "15.02" }] });
    const submitted = await service.Mutate(item.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    const other = await item.draft();
    await expect(db.update(requests).set({ requestNumber: submitted.requestNumber }).where(eq(requests.id, other.id))).rejects.toThrow();
    expect(await service.Read(item.actor, other.id)).toMatchObject({ status: "DRAFT", requestNumber: null });
    const lineItem = submitted.submittedRevision!.lineItems[0]!;
    const { requestItems } = await import("../../src/Infrastructures/Database/schema");
    await expect(db.update(requestItems).set({ unitAmount: "1.00" }).where(eq(requestItems.id, lineItem.id))).rejects.toThrow();
    await expect(service.Mutate(item.actor, "create", null, { ...item.content, monetaryAmount: "15.02" }, randomUUID())).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
});

test("SEC-03 owner/current reviewer visibility grants no administrator or foreign-owner bypass", async () =>
{
    const item = await fixture();
    const draft = await item.draft();
    const familyId = randomUUID();
    await db.insert(sessionFamilies).values({ id: familyId, userId: item.reviewerId, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
    const reviewer = (await new IdentityRepository(db).ReadCurrentIdentity(item.reviewerId, familyId))!;
    await expect(service.Read(reviewer, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const accepted = await service.Mutate(item.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    expect((await service.Read(reviewer, draft.id)).availableActions).toEqual([]);
    await expect(service.Mutate(reviewer, "patch", draft.id, { expectedVersion: 1, title: "untrusted" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const foreign = await fixture();
    await db.insert(userRoles).values({ userId: foreign.ownerId, roleCode: "ADMINISTRATOR" });
    await expect(service.Read(foreign.actor, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.update(departments).set({ name: "New department name" }).where(eq(departments.id, item.departmentId));
    await db.update(reviewerAssignmentRules).set({ isActive: false }).where(eq(reviewerAssignmentRules.id, item.assignmentId));
    const historical = await service.Read(item.actor, draft.id);
    expect(historical.department).toEqual(accepted.department);
    expect(historical.currentCycleId).toBe(accepted.currentCycleId);
    expect(historical.submittedRevision).toEqual(accepted.submittedRevision);
});

test("FT-015 incomplete item drafts can later receive items without competing amount authority", async () =>
{
    const item = await fixture(true, true);
    const draft = await service.Mutate(item.actor, "create", null, { typeId: item.typeId, formDefinitionVersionId: item.versionId }, randomUUID());
    expect(draft.workingRevision?.amount).toBe("0.00");
    const edited = await service.Mutate(item.actor, "patch", draft.id, { expectedVersion: 0, title: item.content.title, justification: item.content.justification, fields: item.content.fields, lineItems: item.content.lineItems });
    expect(edited.workingRevision?.amount).toBe("15.02");
    expect((await service.Mutate(item.actor, "submit", draft.id, { expectedVersion: 1 }, randomUUID())).status).toBe("PENDING");
});
