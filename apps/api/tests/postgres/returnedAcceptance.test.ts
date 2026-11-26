import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, expect, test, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import type { CreateRequest, PublishedRequestType } from "@workflow/contracts";
import { createTestDatabase } from "../helpers/testDatabase";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import { DecisionService } from "../../src/Applications/Approvals/DecisionService";
import { RequestUnitOfWork } from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { DecisionRepository, DecisionUnitOfWork } from "../../src/Infrastructures/Database/Repositories/DecisionRepository";
import { IdentityRepository } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import { seededDefinition } from "../../src/Infrastructures/Database/seedRequests";
import { approvalCycles, approvalDecisions, decisionIdempotencyRecords, budgetPolicies, approvalPolicyVersions, approvalSlots, approvalStages, departmentMemberships, departments, idempotencyRecords, requestAuditEvents, requestItems, requestOutboxEvents, requestRevisions, requests, requestTypes, requestTypeVersions, reviewerAssignmentRules, sessionFamilies, userRoles, users } from "../../src/Infrastructures/Database/schema";

const database = createTestDatabase(), observer = createTestDatabase();
const db = database.connection;
const service = new RequestService(new RequestUnitOfWork(db));
const decisions = new DecisionService(new DecisionUnitOfWork(db));
afterAll(async () =>
{
 await database.Close(); await observer.Close();
});

async function pending(twoStages = false, monetary = false)
{
    const ownerId = randomUUID(), reviewerId = randomUUID(), departmentId = randomUUID(), typeId = randomUUID(), versionId = randomUUID(), policyId = randomUUID();
    const definition: PublishedRequestType = { ...seededDefinition, id: typeId, versionId, code: `T${typeId}`, monetary, supportsLineItems: false };
    await db.transaction(async (tx) =>
    {
        await tx.insert(users).values([ownerId, reviewerId].map((id) => ({ id, email: `${id}@example.test`, displayName: id, passwordHash: "not-for-login" })));
        await tx.insert(userRoles).values([{ userId: ownerId, roleCode: "REQUESTER" }, { userId: reviewerId, roleCode: "REVIEWER" }]);
        await tx.insert(departments).values({ id: departmentId, code: departmentId, name: "Operations" });
        await tx.insert(departmentMemberships).values({ userId: ownerId, departmentId, isPrimary: true });
        await tx.insert(requestTypes).values({ id: typeId, code: definition.code });
        await tx.insert(requestTypeVersions).values({ id: versionId, typeId, versionNumber: 1, definition });
        await tx.update(requestTypes).set({ publishedVersionId: versionId }).where(eq(requestTypes.id, typeId));
        await tx.insert(approvalPolicyVersions).values({ id: policyId, typeId, code: policyId, versionNumber: 1, priority: 1, stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 480 }, ...(twoStages ? [{ stageNumber: 2 as const, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 480 }] : [])] });
        await tx.insert(reviewerAssignmentRules).values({ id: randomUUID(), assignmentKey: "review", departmentId, reviewerId });
    });
    async function actor(userId: string)
    {
        const id = randomUUID();
        await db.insert(sessionFamilies).values({ id, userId, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
        return (await new IdentityRepository(db).ReadCurrentIdentity(userId, id))!;
    }
    const owner = await actor(ownerId), reviewer = await actor(reviewerId);
    const content: CreateRequest = { typeId, formDefinitionVersionId: versionId, title: "Operational request", justification: "Needed for the team", priority: "HIGH", fields: { category: "OPERATIONS" }, ...(monetary ? { monetaryAmount: "10.00" } : {}) };
    const draft = await service.Mutate(owner, "create", null, content, randomUUID());
    const submitted = await service.Mutate(owner, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    return { owner, reviewer, typeId, versionId, policyId, departmentId, submitted, slot: submitted.currentApprovers[0]!.slotId };
}
async function returned(monetary = false)
{
    const item = await pending(false, monetary);
    const key = randomUUID();
    const result = await decisions.Decide(item.reviewer, item.slot, { decision: "RETURN", reason: "Please revise", expectedVersion: 0 }, key);
    return { ...item, returnKey: key, result, detail: await service.Read(item.owner, item.submitted.id) };
}
async function evidence(id: string, actorId: string)
{
    const read = observer.connection;
    const revisions = await read.select().from(requestRevisions).where(eq(requestRevisions.requestId, id)).orderBy(requestRevisions.id);
    const cycles = await read.select().from(approvalCycles).where(eq(approvalCycles.requestId, id)).orderBy(approvalCycles.id);
    const stages = cycles.length ? await read.select().from(approvalStages).where(inArray(approvalStages.cycleId, cycles.map((x) => x.id))).orderBy(approvalStages.id) : [];
    const slots = stages.length ? await read.select().from(approvalSlots).where(inArray(approvalSlots.stageId, stages.map((x) => x.id))).orderBy(approvalSlots.id) : [];
    const request = (await read.select().from(requests).where(eq(requests.id, id)))[0];
    const actors = [...new Set([actorId, request!.requesterId, ...slots.map((slot) => slot.reviewerId)])];
    return { request, revisions, cycles, stages, slots,
        items: revisions.length ? await read.select().from(requestItems).where(inArray(requestItems.revisionId, revisions.map((x) => x.id))).orderBy(requestItems.id) : [],
        votes: slots.length ? await read.select().from(approvalDecisions).where(inArray(approvalDecisions.slotId, slots.map((x) => x.id))).orderBy(approvalDecisions.id) : [],
        audit: await read.select().from(requestAuditEvents).where(eq(requestAuditEvents.requestId, id)).orderBy(requestAuditEvents.id),
        outbox: await read.select().from(requestOutboxEvents).where(sql`${requestOutboxEvents.payload}->>'requestId' = ${id}`).orderBy(requestOutboxEvents.id),
        keys: await read.select().from(idempotencyRecords).where(inArray(idempotencyRecords.actorId, actors)).orderBy(idempotencyRecords.scope, idempotencyRecords.key), decisionKeys: await read.select().from(decisionIdempotencyRecords).where(inArray(decisionIdempotencyRecords.actorId, actors)).orderBy(decisionIdempotencyRecords.scope, decisionIdempotencyRecords.key) };
}


test.each(["missing", "hidden", "no route", "ambiguous policy", "inactive reviewer", "self reviewer", "membership", "department", "stale"] as const)("RR-T-07a %s preserves the returned write set", async (condition) =>
{
    const f = await returned();
    let version = f.detail.version;
    if (condition === "missing") version = (await service.Mutate(f.owner, "patch", f.submitted.id, { expectedVersion: version, fields: {} })).version;
    if (condition === "no route") await db.update(approvalPolicyVersions).set({ isActive: false }).where(eq(approvalPolicyVersions.id, f.policyId));
    if (condition === "ambiguous policy") await db.insert(approvalPolicyVersions).values({ id: randomUUID(), typeId: f.typeId, code: randomUUID(), versionNumber: 1, priority: 1, stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 480 }] });
    if (condition === "inactive reviewer") await db.update(users).set({ isActive: false }).where(eq(users.id, f.reviewer.account.id));
    if (condition === "self reviewer")
    {
        await db.insert(userRoles).values({ userId: f.owner.account.id, roleCode: "REVIEWER" });
        await db.update(reviewerAssignmentRules).set({ reviewerId: f.owner.account.id }).where(eq(reviewerAssignmentRules.departmentId, f.departmentId));
    }
    if (condition === "membership") await db.update(departmentMemberships).set({ isActive: false }).where(eq(departmentMemberships.departmentId, f.departmentId));
    if (condition === "department") await db.update(departments).set({ isActive: false }).where(eq(departments.id, f.departmentId));
    const before = await evidence(f.submitted.id, f.owner.account.id);
    if (condition === "hidden")
        await expect(service.Mutate(f.owner, "patch", f.submitted.id, { expectedVersion: version, fields: { category: "OPERATIONS", reason: "hidden" } })).rejects.toMatchObject({ code: "FORM_FIELD_NOT_APPLICABLE" });
    else
        await expect(service.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: condition === "stale" ? version - 1 : version }, randomUUID())).rejects.toMatchObject({ code: condition === "missing" ? "VALIDATION_ERROR" : condition === "stale" ? "REQUEST_STALE" : condition === "ambiguous policy" ? "AMBIGUOUS_APPROVAL_POLICY" : "CONFIGURATION_INCOMPLETE" });
    expect(await evidence(f.submitted.id, f.owner.account.id)).toEqual(before);
});

test("RR-T-07a saved owner edits survive a configuration failure", async () =>
{
    const f = await returned();
    const edited = await service.Mutate(f.owner, "patch", f.submitted.id, { expectedVersion: f.detail.version, title: "Saved correction" });
    await db.update(approvalPolicyVersions).set({ isActive: false }).where(eq(approvalPolicyVersions.id, f.policyId));
    const before = await evidence(f.submitted.id, f.owner.account.id);
    await expect(service.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: edited.version }, randomUUID())).rejects.toMatchObject({ code: "CONFIGURATION_INCOMPLETE" });
    expect(await evidence(f.submitted.id, f.owner.account.id)).toEqual(before);
    expect((await service.Read(f.owner, f.submitted.id)).title).toBe("Saved correction");
});

test("RR-T-01b RETURN failure after working copy insertion rolls back the entire write set", async () =>
{
    const f = await pending(), key = randomUUID(), before = await evidence(f.submitted.id, f.reviewer.account.id);
    await db.execute(sql`CREATE FUNCTION issue7_fail_return_copy() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.submitted_at IS NULL AND NEW.revision_number > 1 THEN RAISE EXCEPTION 'injected return copy fault'; END IF; RETURN NEW; END $$`);
    await db.execute(sql`CREATE TRIGGER issue7_fail_return_copy AFTER INSERT ON request_revisions FOR EACH ROW EXECUTE FUNCTION issue7_fail_return_copy()`);
    try
    {
        await expect(decisions.Decide(f.reviewer, f.slot, { decision: "RETURN", reason: "Fix", expectedVersion: 0 }, key)).rejects.toThrow();
    }
    finally
    {
        await db.execute(sql`DROP TRIGGER IF EXISTS issue7_fail_return_copy ON request_revisions`);
        await db.execute(sql`DROP FUNCTION IF EXISTS issue7_fail_return_copy()`);
    }
    expect(await evidence(f.submitted.id, f.reviewer.account.id)).toEqual(before);
    expect((await decisions.Decide(f.reviewer, f.slot, { decision: "RETURN", reason: "Fix", expectedVersion: 0 }, key)).requestStatus).toBe("RETURNED");
});



test("RR-T-01b RETURN from active stage two preserves completed prior evidence", async () =>
{
    const f = await pending(true), before = await evidence(f.submitted.id, f.reviewer.account.id);
    const first = before.stages.find((stage) => stage.stageNumber === 1)!;
    const second = before.stages.find((stage) => stage.stageNumber === 2)!;
    const firstSlot = before.slots.find((slot) => slot.stageId === first.id)!;
    const secondSlot = before.slots.find((slot) => slot.stageId === second.id)!;
    const priorVote = randomUUID();
    await db.update(approvalStages).set({ status: "COMPLETED" }).where(eq(approvalStages.id, first.id));
    await db.update(approvalSlots).set({ status: "APPROVED", version: 1 }).where(eq(approvalSlots.id, firstSlot.id));
    await db.insert(approvalDecisions).values({ id: priorVote, slotId: firstSlot.id, actorId: f.reviewer.account.id, decision: "APPROVE", decidedAt: new Date() });
    await db.update(approvalStages).set({ status: "ACTIVE" }).where(eq(approvalStages.id, second.id));
    await db.update(approvalSlots).set({ status: "ACTIONABLE" }).where(eq(approvalSlots.id, secondSlot.id));
    const submitted = await evidence(f.submitted.id, f.reviewer.account.id);
    await decisions.Decide(f.reviewer, secondSlot.id, { decision: "RETURN", reason: "Correct stage two", expectedVersion: 0 }, randomUUID());
    const after = await evidence(f.submitted.id, f.reviewer.account.id);
    expect(after.request).toMatchObject({ status: "RETURNED", submittedRevisionId: f.submitted.submittedRevision!.id });
    expect(after.cycles[0]).toMatchObject({ isActive: false, snapshot: submitted.cycles[0]!.snapshot });
    expect(after.stages.find((stage) => stage.id === first.id)).toEqual(submitted.stages.find((stage) => stage.id === first.id));
    expect(after.slots.find((slot) => slot.id === firstSlot.id)).toEqual(submitted.slots.find((slot) => slot.id === firstSlot.id));
    expect(after.slots.find((slot) => slot.id === secondSlot.id)).toMatchObject({ status: "RETURNED", version: 1 });
    expect(after.votes.find((vote) => vote.id === priorVote)).toEqual(submitted.votes.find((vote) => vote.id === priorVote));
    expect(after.revisions.find((revision) => revision.id === f.submitted.submittedRevision!.id)).toEqual(submitted.revisions[0]);
    expect(after.items).toEqual(submitted.items);
    expect(after.votes).toHaveLength(2);
});

test("RR-T-04b historical handler has only its exact snapshot and current participants retain access", async () =>
{
    const f = await pending();
    async function actor(role: "REVIEWER" | "ADMINISTRATOR")
    {
        const id = randomUUID(), familyId = randomUUID();
        await db.insert(users).values({ id, email: `${id}@example.test`, displayName: id, passwordHash: "not-for-login" });
        await db.insert(userRoles).values({ userId: id, roleCode: role });
        await db.insert(sessionFamilies).values({ id: familyId, userId: id, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
        return (await new IdentityRepository(db).ReadCurrentIdentity(id, familyId))!;
    }
    const formerAssignee = await actor("REVIEWER"), administrator = await actor("ADMINISTRATOR"), current = await actor("REVIEWER");
    const initial = await evidence(f.submitted.id, f.owner.account.id);
    await db.insert(approvalSlots).values({ id: randomUUID(), stageId: initial.stages[0]!.id, reviewerId: formerAssignee.account.id, assignmentKey: "cancelled", status: "CANCELLED" });
    await decisions.Decide(f.reviewer, f.slot, { decision: "RETURN", reason: "Revise", expectedVersion: 0 }, randomUUID());
    const returnedDetail = await service.Read(f.owner, f.submitted.id);
    await db.update(reviewerAssignmentRules).set({ reviewerId: current.account.id }).where(eq(reviewerAssignmentRules.departmentId, f.departmentId));
    const next = await service.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: returnedDetail.version }, randomUUID());
    const oldId = f.submitted.submittedRevision!.id, newId = next.submittedRevision!.id;
    expect(await service.Revision(f.owner, next.id, oldId)).toEqual(f.submitted.submittedRevision);
    expect((await service.Revisions(f.owner, next.id, { pageNumber: 1, pageSize: 20 })).items).toHaveLength(2);
    expect(await service.Revision(current, next.id, oldId)).toEqual(f.submitted.submittedRevision);
    expect((await service.Revisions(current, next.id, { pageNumber: 1, pageSize: 20 })).items).toHaveLength(2);
    expect((await service.TypeVersion(current, f.typeId, f.versionId, next.id)).versionId).toBe(f.versionId);
    for (const denied of [formerAssignee, administrator])
    {
        await expect(service.Revision(denied, next.id, oldId)).rejects.toMatchObject({ code: "NOT_FOUND" });
        await expect(service.Revisions(denied, next.id, { pageNumber: 1, pageSize: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await expect(service.Revision(f.reviewer, next.id, newId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.Revision(f.reviewer, next.id, returnedDetail.workingRevision!.id === newId ? randomUUID() : returnedDetail.workingRevision!.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.Read(f.reviewer, next.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.Revisions(f.reviewer, next.id, { pageNumber: 1, pageSize: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.TypeVersion(f.reviewer, f.typeId, f.versionId, next.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.delete(userRoles).where(eq(userRoles.userId, f.reviewer.account.id));
    await db.insert(userRoles).values({ userId: f.reviewer.account.id, roleCode: "REQUESTER" });
    expect(await service.Revision(f.reviewer, next.id, oldId)).toEqual(f.submitted.submittedRevision);
    await db.update(users).set({ isActive: false }).where(eq(users.id, f.reviewer.account.id));
    await expect(service.Revision(f.reviewer, next.id, oldId)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});



test("RR-T-07a budget excess and invalid field preserve the complete returned write set", async () =>
{
    const f = await returned(true);
    await db.insert(budgetPolicies).values({ id: randomUUID(), typeId: f.typeId, departmentId: f.departmentId, maxAmount: "5.00" });
    const before = await evidence(f.submitted.id, f.owner.account.id);
    await expect(service.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: f.detail.version }, randomUUID())).rejects.toMatchObject({ code: "BUDGET_LIMIT_EXCEEDED" });
    expect(await evidence(f.submitted.id, f.owner.account.id)).toEqual(before);
    await expect(service.Mutate(f.owner, "patch", f.submitted.id, { expectedVersion: f.detail.version, fields: { category: "INVALID" } })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(await evidence(f.submitted.id, f.owner.account.id)).toEqual(before);
});

test("RR-T-07b RETURN failure after replay completion rolls back and permits same-key retry", async () =>
{
    const f = await pending(), key = randomUUID(), before = await evidence(f.submitted.id, f.reviewer.account.id), original = DecisionRepository.prototype.Complete;
    const spy = vi.spyOn(DecisionRepository.prototype, "Complete").mockImplementationOnce(async function (this: DecisionRepository, ...args)
    {
        await original.apply(this, args);
        throw new Error("injected decision completion failure");
    });
    try
    {
        await expect(decisions.Decide(f.reviewer, f.slot, { decision: "RETURN", reason: "Fix", expectedVersion: 0 }, key)).rejects.toThrow("injected decision completion failure");
    }
    finally
    {
        spy.mockRestore();
    }
    expect(await evidence(f.submitted.id, f.reviewer.account.id)).toEqual(before);
    expect((await decisions.Decide(f.reviewer, f.slot, { decision: "RETURN", reason: "Fix", expectedVersion: 0 }, key)).requestStatus).toBe("RETURNED");
});

test("RR-T-07b migration 0014 preserves a populated historical short REJECT", async () =>
{
    const migration = readFileSync(new URL("../../src/Infrastructures/Database/migrations/0014_jittery_mysterio.sql", import.meta.url), "utf8");
    await db.transaction(async (tx) =>
    {
        await tx.execute(sql`CREATE TEMP TABLE approval_decisions (id uuid PRIMARY KEY, slot_id uuid NOT NULL UNIQUE, actor_id uuid NOT NULL, decision text NOT NULL, reason text, decided_at timestamptz NOT NULL, CONSTRAINT decision_type CHECK (decision in ('APPROVE','REJECT')), CONSTRAINT rejection_reason CHECK (decision <> 'REJECT' OR length(btrim(reason)) > 0 AND reason IS NOT NULL)) ON COMMIT DROP`);
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO approval_decisions VALUES (${id}, ${randomUUID()}, ${randomUUID()}, 'REJECT', 'old', now())`);
        for (const statement of migration.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) await tx.execute(sql.raw(statement));
        const rows = await tx.execute(sql`SELECT decision, reason FROM approval_decisions WHERE id = ${id}`);
        expect(Array.from(rows)).toEqual([expect.objectContaining({ decision: "REJECT", reason: "old" })]);
        await tx.execute(sql`INSERT INTO approval_decisions VALUES (${randomUUID()}, ${randomUUID()}, ${randomUUID()}, 'RETURN', 'Fix', now())`);
        await expect(tx.transaction(async (nested) => nested.execute(sql`INSERT INTO approval_decisions VALUES (${randomUUID()}, ${randomUUID()}, ${randomUUID()}, 'RETURN', ' ', now())`))).rejects.toThrow();
    });
});


test("RR-T-04b historical revision HTTP authorization returns safe 404s", async () =>
{
    const { createIdentityComposition } = await import("../../src/Presentations/composition");
    const { readEnvironment } = await import("../../src/Infrastructures/Configuration/environment");
    const { createApplication } = await import("../../src/Presentations/createApplication");
    const { TokenProvider } = await import("../../src/Infrastructures/Security/TokenProvider");
    const { ApprovalTaskService } = await import("../../src/Applications/Approvals/ApprovalTaskService");
    const { ApprovalTaskUnitOfWork } = await import("../../src/Infrastructures/Database/Repositories/ApprovalTaskRepository");
    const env = readEnvironment({ NODE_ENV: "test", DATABASE_URL: process.env.TEST_DATABASE_URL, AUTH_JWT_SECRET: "lab7-local-http-test-only-secret-32-bytes", AUTH_JWT_ISSUER: "lab7-tests", AUTH_JWT_AUDIENCE: "lab7-api", AUTH_ALLOWED_ORIGINS: "http://localhost:3000", AUTH_COOKIE_SECURE: "false" });
    const app = createApplication(undefined, await createIdentityComposition(env, database), service, new ApprovalTaskService(new ApprovalTaskUnitOfWork(db)), decisions);
    const tokens = new TokenProvider(env.AUTH_JWT_SECRET, { Now: () => new Date() }, env.AUTH_JWT_ISSUER, env.AUTH_JWT_AUDIENCE);
    const f = await pending(), foreign = await pending();
    async function actor(role: "REVIEWER" | "ADMINISTRATOR")
    {
        const id = randomUUID(), family = randomUUID();
        await db.insert(users).values({ id, email: `${id}@example.test`, displayName: id, passwordHash: "not-for-login" });
        await db.insert(userRoles).values({ userId: id, roleCode: role });
        await db.insert(sessionFamilies).values({ id: family, userId: id, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
        return (await new IdentityRepository(db).ReadCurrentIdentity(id, family))!;
    }
    const cancelled = await actor("REVIEWER"), admin = await actor("ADMINISTRATOR"), current = await actor("REVIEWER");
    const initial = await evidence(f.submitted.id, f.owner.account.id);
    await db.insert(approvalSlots).values({ id: randomUUID(), stageId: initial.stages[0]!.id, reviewerId: cancelled.account.id, assignmentKey: "cancelled", status: "CANCELLED" });
    await decisions.Decide(f.reviewer, f.slot, { decision: "RETURN", reason: "Revise", expectedVersion: 0 }, randomUUID());
    const firstReturn = await service.Read(f.owner, f.submitted.id);
    await db.update(reviewerAssignmentRules).set({ reviewerId: current.account.id }).where(eq(reviewerAssignmentRules.departmentId, f.departmentId));
    const next = await service.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: firstReturn.version }, randomUUID());
    await decisions.Decide(current, next.currentApprovers[0]!.slotId, { decision: "RETURN", reason: "Again", expectedVersion: 0 }, randomUUID());
    const working = (await service.Read(f.owner, f.submitted.id)).workingRevision!.id;
    async function get(path: string, who: typeof f.owner)
    {
        const token = await tokens.Sign(who.account.id, who.family.id, who.account.authVersion);
        return app.handle(new Request(`http://localhost/api/v1${path}`, { headers: { authorization: `Bearer ${token}` } }));
    }
    const base = `/requests/${f.submitted.id}`, old = f.submitted.submittedRevision!.id, later = next.submittedRevision!.id;
    expect((await get(`${base}/revisions/${old}`, f.reviewer)).status).toBe(200);
    expect((await get(`${base}/revisions/${old}`, f.owner)).status).toBe(200);
    const denied = [
        [`${base}/revisions/${later}`, f.reviewer], [`${base}/revisions/${working}`, f.reviewer],
        [`${base}/revisions`, f.reviewer], [base, f.reviewer],
        [`${base}/revisions/${old}`, cancelled], [`${base}/revisions/${old}`, admin],
        [`${base}/revisions/${randomUUID()}`, f.owner], [`${base}/revisions/not-a-uuid`, f.owner],
        [`${base}/revisions/${foreign.submitted.submittedRevision!.id}`, f.owner],
        [`/requests/${foreign.submitted.id}/revisions/${old}`, f.owner],
        [`/requests/${randomUUID()}/revisions/${old}`, f.owner],
    ] as const;
    for (const [path, who] of denied)
    {
        const response = await get(path, who);
        expect(response.status, path).toBe(404);
        expect(await response.json()).toMatchObject({ code: "NOT_FOUND" });
    }
});
