import { createHash, randomUUID } from "node:crypto";
import { afterAll, expect, test, vi } from "vitest";
import { and, eq, inArray, sql } from "drizzle-orm";
import { requestDetailSchema, type PublishedRequestType, type CreateRequest, type DecisionRequest, type RequestDetail } from "@workflow/contracts";
import { createTestDatabase } from "../helpers/testDatabase";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import { DecisionService } from "../../src/Applications/Approvals/DecisionService";
import { RequestRepository, RequestUnitOfWork } from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { DecisionRepository, DecisionUnitOfWork } from "../../src/Infrastructures/Database/Repositories/DecisionRepository";
import { IdentityRepository } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import { seededDefinition } from "../../src/Infrastructures/Database/seedRequests";
import type { IActor } from "../../src/Domains/Identity/Identity";
import type { IStageDefinition } from "../../src/Domains/Requests/RequestRules";
import { approvalCycles, approvalDecisions, approvalPolicyVersions, approvalSlots, approvalStages, departmentMemberships, departments, decisionIdempotencyRecords, requestAuditEvents, requestOutboxEvents, requestRevisions, requests, requestTypes, requestTypeVersions, reviewerAssignmentRules, sessionFamilies, userRoles, users } from "../../src/Infrastructures/Database/schema";
const database = createTestDatabase(), observer = createTestDatabase();
const db = database.connection;
const service = new RequestService(new RequestUnitOfWork(db));
const decisions = new DecisionService(new DecisionUnitOfWork(db));
const independent = new DecisionService(new DecisionUnitOfWork(observer.connection));
afterAll(async () =>
{
 await database.Close(); await observer.Close();
});
async function fixture(monetary = false, supportsLineItems = false, stages: IStageDefinition[] = [{ stageNumber: 1, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 480 }])
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
        await tx.insert(approvalPolicyVersions).values({ id: policyId, typeId, code: policyId, versionNumber: 1, priority: 1, stages });
        await tx.insert(reviewerAssignmentRules).values({ id: assignmentId, assignmentKey: "review", departmentId, reviewerId });
    });
    const actor = (await new IdentityRepository(db).ReadCurrentIdentity(ownerId, familyId))!;
    const content: CreateRequest = { typeId, formDefinitionVersionId: versionId, title: "Operational request", justification: "Needed for the team", priority: "HIGH", fields: { category: "OPERATIONS" }, ...(monetary ? supportsLineItems ? { lineItems: [{ description: "Parts", quantity: "1.5", unitAmount: "10.01" }] } : { monetaryAmount: "10.00" } : {}) };
    const draft = () => service.Mutate(actor, "create", null, content, randomUUID());
    return { actor, content, draft, ownerId, reviewerId, departmentId, typeId, versionId, policyId, assignmentId };
}
async function pending(parallel = false, future = false, finalParallel = false)
{
    const item = await fixture(false, false, [{ stageNumber: 1, reviewerAssignmentKeys: parallel ? ["review", "peer"] : ["review"], slaBusinessMinutes: 480 }, ...(future ? [{ stageNumber: 2 as const, reviewerAssignmentKeys: finalParallel ? ["review", "peer"] : ["review"], slaBusinessMinutes: 480 }] : [])]);
    const peer = await fixture();
    if (parallel) await db.insert(reviewerAssignmentRules).values({ id: randomUUID(), assignmentKey: "peer", departmentId: item.departmentId, reviewerId: peer.reviewerId });
    async function actor(id: string)
    {
        const familyId = randomUUID();
        await db.insert(sessionFamilies).values({ id: familyId, userId: id, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
        return (await new IdentityRepository(db).ReadCurrentIdentity(id, familyId))!;
    }
    const reviewer = await actor(item.reviewerId), other = await actor(peer.reviewerId);
    const draft = await item.draft();
    const submitted = await service.Mutate(item.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    return { ...item, reviewer, other, submitted, slot: submitted.currentApprovers.find((slot) => slot.stageNumber === 1 && slot.reviewer.id === item.reviewerId)!.slotId, peerSlot: submitted.currentApprovers.find((slot) => slot.stageNumber === 1 && slot.reviewer.id === peer.reviewerId)?.slotId };
}
const approve: DecisionRequest = { decision: "APPROVE", expectedVersion: 0 };
async function contend<T>(first: () => Promise<T>, second: () => Promise<T>)
{
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) =>
    {
        release = resolve;
    });
    const original = DecisionRepository.prototype.Lock;
    const spy = vi.spyOn(DecisionRepository.prototype, "Lock").mockImplementation(async function (this: DecisionRepository, actor, taskId)
    {
        if (++arrivals === 2) release();
        await gate;
        return original.call(this, actor, taskId);
    });
    try
    {
        return await Promise.allSettled([first(), second()]);
    }
    finally
    {
        spy.mockRestore();
    }
}
async function evidence(requestId: string)
{
    const read = observer.connection;
    const cycles = await read.select().from(approvalCycles).where(eq(approvalCycles.requestId, requestId)).orderBy(approvalCycles.id);
    const stages = await read.select().from(approvalStages).where(inArray(approvalStages.cycleId, cycles.map((item) => item.id))).orderBy(approvalStages.id);
    const slots = stages.length ? await read.select().from(approvalSlots).where(inArray(approvalSlots.stageId, stages.map((item) => item.id))).orderBy(approvalSlots.id) : [];
    return { cycles, stages, slots, request: (await read.select().from(requests).where(eq(requests.id, requestId)))[0],
        audit: await read.select().from(requestAuditEvents).where(eq(requestAuditEvents.requestId, requestId)).orderBy(requestAuditEvents.id),
        outbox: await read.select().from(requestOutboxEvents).where(sql`${requestOutboxEvents.payload}->>'requestId' = ${requestId}`).orderBy(requestOutboxEvents.id),
        keys: slots.length ? await read.select().from(decisionIdempotencyRecords).where(inArray(decisionIdempotencyRecords.scope, slots.map((slot) => `POST /api/v1/approval-tasks/${slot.id}/decisions`))).orderBy(decisionIdempotencyRecords.actorId, decisionIdempotencyRecords.scope, decisionIdempotencyRecords.key) : [],
        votes: await read.select({ decision: approvalDecisions }).from(approvalDecisions).innerJoin(approvalSlots, eq(approvalDecisions.slotId, approvalSlots.id)).innerJoin(approvalStages, eq(approvalSlots.stageId, approvalStages.id)).innerJoin(approvalCycles, eq(approvalStages.cycleId, approvalCycles.id)).where(eq(approvalCycles.requestId, requestId)).orderBy(approvalDecisions.id) };
}

async function decisionHttp()
{
    const { createIdentityComposition } = await import("../../src/Presentations/composition");
    const { readEnvironment } = await import("../../src/Infrastructures/Configuration/environment");
    const { createApplication } = await import("../../src/Presentations/createApplication");
    const { TokenProvider } = await import("../../src/Infrastructures/Security/TokenProvider");
    const { ApprovalTaskService } = await import("../../src/Applications/Approvals/ApprovalTaskService");
    const { ApprovalTaskUnitOfWork } = await import("../../src/Infrastructures/Database/Repositories/ApprovalTaskRepository");
    const env = readEnvironment({ NODE_ENV: "test", DATABASE_URL: process.env.TEST_DATABASE_URL, AUTH_JWT_SECRET: "lab7-local-http-test-only-secret-32-bytes", AUTH_JWT_ISSUER: "lab7-tests", AUTH_JWT_AUDIENCE: "lab7-api", AUTH_ALLOWED_ORIGINS: "http://localhost:3000", AUTH_COOKIE_SECURE: "false" });
    const identity = await createIdentityComposition(env, database);
    const app = createApplication(undefined, identity, service, new ApprovalTaskService(new ApprovalTaskUnitOfWork(db)), decisions);
    const tokens = new TokenProvider(env.AUTH_JWT_SECRET, { Now: () => new Date() }, env.AUTH_JWT_ISSUER, env.AUTH_JWT_AUDIENCE);
    async function send(method: "GET" | "POST", path: string, actor: IActor | null, body?: unknown, key: string = randomUUID())
    {
        const token = actor ? await tokens.Sign(actor.account.id, actor.family.id, actor.account.authVersion) : null;
        return app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), "Idempotency-Key": key, "content-type": "application/json" }, ...(method === "POST" ? { body: JSON.stringify(body) } : {}) }));
    }
    return {
        send,
        post: (item: Awaited<ReturnType<typeof pending>>, body: DecisionRequest, key = randomUUID(), actor: IActor | null = item.reviewer, taskId = item.slot) => send("POST", `/approval-tasks/${taskId}/decisions`, actor, body, key),
        timeline: (item: Awaited<ReturnType<typeof pending>>, actor: IActor = item.actor) => send("GET", `/requests/${item.submitted.id}/timeline?pageSize=100`, actor),
    };
}
test("durable replay after service restart, stale duplicate, semantic conflict and immutable history", async () =>
{
    const item = await pending();
    const key = randomUUID();
    const result = await decisions.Decide(item.reviewer, item.slot, approve, key);
    expect(result).toMatchObject({ requestStatus: "APPROVED", requestVersion: 2, taskVersion: 1, currentStageNumber: null });
    expect(await independent.Decide(item.reviewer, item.slot, approve, key)).toEqual(result);
    await expect(independent.Decide(item.reviewer, item.slot, { ...approve, reason: "changed" }, key)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(decisions.Decide(item.reviewer, item.slot, approve, randomUUID())).rejects.toMatchObject({ code: "APPROVAL_TASK_STALE" });
    const saved = await evidence(item.submitted.id);
    expect(saved.votes).toHaveLength(1);
    expect(saved.audit.filter((event) => event.decisionId)).toHaveLength(1);
    expect(saved.outbox.filter((event) => event.eventType.startsWith("DECISION"))).toHaveLength(1);
    for (const action of [() => db.update(approvalDecisions).set({ reason: "rewrite" }).where(eq(approvalDecisions.id, result.decisionId)), () => db.delete(requestAuditEvents).where(eq(requestAuditEvents.decisionId, result.decisionId))]) await expect(action()).rejects.toThrow();
    await expect(db.insert(approvalDecisions).values({ id: randomUUID(), slotId: item.slot, actorId: item.reviewerId, decision: "REJECT", reason: "duplicate", decidedAt: new Date() })).rejects.toThrow();
    const timeline = await independent.Timeline(item.actor, item.submitted.id, { pageNumber: 1, pageSize: 100 });
    expect(timeline.items.find((event) => event.metadata.decision === "APPROVE")).toMatchObject({ actor: { id: item.reviewerId }, cycleId: item.submitted.currentCycleId, revisionId: item.submitted.submittedRevision!.id });
    expect((await independent.Timeline(item.reviewer, item.submitted.id, { pageNumber: 1, pageSize: 20 })).items).toHaveLength(1);
    await expect(independent.Timeline(item.other, item.submitted.id, { pageNumber: 1, pageSize: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
});
test("partial ALL approval stays pending and rejection cancels unfinished slots", async () =>
{
    const item = await pending(true);
    expect((await decisions.Decide(item.reviewer, item.slot, approve, randomUUID())).requestStatus).toBe("PENDING");
    expect((await independent.Decide(item.other, item.peerSlot!, { ...approve, decision: "REJECT", reason: "Missing justification" }, randomUUID())).requestStatus).toBe("REJECTED");
    expect((await evidence(item.submitted.id)).votes).toHaveLength(2);
    const rejection = await pending(true, true);
    await decisions.Decide(rejection.reviewer, rejection.slot, { ...approve, decision: "REJECT", reason: "Missing information" }, randomUUID());
    const rows = await db.select({ slot: approvalSlots }).from(approvalSlots).innerJoin(approvalStages, eq(approvalSlots.stageId, approvalStages.id)).where(eq(approvalStages.cycleId, rejection.submitted.currentCycleId!));
    expect(rows.map((row) => row.slot.status).sort()).toEqual(["CANCELLED", "CANCELLED", "REJECTED"]);
});
test.each([false, true])("two-stage completion activates once and replay preserves activation (parallel=%s)", async (parallel) =>
{
    const item = await pending(parallel, true, parallel);
    const futureSlot = item.submitted.currentApprovers.find((slot) => slot.stageNumber === 2 && slot.reviewer.id === item.reviewerId)!;
    const before = await evidence(item.submitted.id);
    const first = before.stages.find((stage) => stage.stageNumber === 1)!;
    const future = before.stages.find((stage) => stage.stageNumber === 2)!;
    expect(first.activatedAt).not.toBeNull();
    expect(future).toMatchObject({ status: "WAITING", activatedAt: null });
    await expect(decisions.Decide(item.reviewer, futureSlot.slotId, approve, randomUUID())).rejects.toMatchObject({ code: "APPROVAL_TASK_STALE" });
    if (parallel)
    {
        expect(await independent.Decide(item.other, item.peerSlot!, approve, randomUUID())).toMatchObject({ requestStatus: "PENDING", currentStageNumber: 1 });
        expect((await evidence(item.submitted.id)).stages.find((stage) => stage.stageNumber === 2)?.activatedAt).toBeNull();
    }
    const key = randomUUID();
    const result = await decisions.Decide(item.reviewer, item.slot, approve, key);
    expect(result).toMatchObject({ requestStatus: "PENDING", currentStageNumber: 2 });
    const activated = await evidence(item.submitted.id);
    expect(activated.stages.find((stage) => stage.stageNumber === 1)).toMatchObject({ status: "COMPLETED", activatedAt: first.activatedAt });
    expect(activated.stages.find((stage) => stage.stageNumber === 2)).toMatchObject({ status: "ACTIVE", activatedAt: expect.any(Date) });
    expect(activated.slots.find((slot) => slot.id === item.slot)?.dueAt).toEqual(before.slots.find((slot) => slot.id === item.slot)?.dueAt);
    expect(activated.slots.find((slot) => slot.id === futureSlot.slotId)).toMatchObject({ status: "ACTIONABLE", version: 1, dueAt: null });
    expect(activated.outbox.filter((event) => event.eventType === "APPROVAL_STAGE_ACTIVATED")).toEqual([expect.objectContaining({ eventKey: "stage-activated:" + future.id, payload: { requestId: item.submitted.id, cycleId: item.submitted.currentCycleId } })]);
    expect(await independent.Decide(item.reviewer, item.slot, approve, key)).toEqual(result);
    expect(await evidence(item.submitted.id)).toEqual(activated);
    const finalVote = await independent.Decide(item.reviewer, futureSlot.slotId, { ...approve, expectedVersion: 1 }, randomUUID());
    if (parallel)
    {
        expect(finalVote).toMatchObject({ requestStatus: "PENDING", currentStageNumber: 2 });
        const futurePeer = item.submitted.currentApprovers.find((slot) => slot.stageNumber === 2 && slot.reviewer.id === item.other.account.id)!;
        expect(await decisions.Decide(item.other, futurePeer.slotId, { ...approve, expectedVersion: 1 }, randomUUID())).toMatchObject({ requestStatus: "APPROVED", currentStageNumber: null });
    }
    else expect(finalVote).toMatchObject({ requestStatus: "APPROVED", currentStageNumber: null });
});
test("independent parallel votes activate and finalize each stage once", async () =>
{
    const item = await pending(true, true, true);
    const first = (await contend(
        () => decisions.Decide(item.reviewer, item.slot, approve, randomUUID()),
        () => independent.Decide(item.other, item.peerSlot!, approve, randomUUID()),
    )).map((result) =>
    {
        if (result.status === "rejected") throw result.reason;
        return result.value;
    });
    expect(first.map((result) => result.currentStageNumber).sort()).toEqual([1, 2]);
    const afterFirst = await evidence(item.submitted.id);
    expect(afterFirst.outbox.filter((event) => event.eventType === "APPROVAL_STAGE_ACTIVATED")).toHaveLength(1);
    const future = item.submitted.currentApprovers.filter((slot) => slot.stageNumber === 2);
    const reviewerSlot = future.find((slot) => slot.reviewer.id === item.reviewerId)!;
    const peerSlot = future.find((slot) => slot.reviewer.id === item.other.account.id)!;
    const final = (await contend(
        () => decisions.Decide(item.reviewer, reviewerSlot.slotId, { ...approve, expectedVersion: 1 }, randomUUID()),
        () => independent.Decide(item.other, peerSlot.slotId, { ...approve, expectedVersion: 1 }, randomUUID()),
    )).map((result) =>
    {
        if (result.status === "rejected") throw result.reason;
        return result.value;
    });
    expect(final.map((result) => result.requestStatus).sort()).toEqual(["APPROVED", "PENDING"]);
    const saved = await evidence(item.submitted.id);
    expect(saved.votes).toHaveLength(4);
    expect(saved.audit.filter((event) => event.decisionId)).toHaveLength(4);
    expect(saved.outbox.filter((event) => event.eventType === "APPROVAL_STAGE_ACTIVATED")).toHaveLength(1);
    expect(saved.request?.status).toBe("APPROVED");
});

test.each([{ stage: 1, terminal: "RETURN" }, { stage: 2, terminal: "REJECT" }] as const)("stage $stage approval versus $terminal serializes distinct slots", async ({ stage, terminal }) =>
{
    const item = await pending(true, true, true);
    if (stage === 2)
    {
        await decisions.Decide(item.reviewer, item.slot, approve, randomUUID());
        await independent.Decide(item.other, item.peerSlot!, approve, randomUUID());
    }
    const slots = item.submitted.currentApprovers.filter((slot) => slot.stageNumber === stage);
    const reviewerSlot = slots.find((slot) => slot.reviewer.id === item.reviewerId)!;
    const peerSlot = slots.find((slot) => slot.reviewer.id === item.other.account.id)!;
    const version = stage === 1 ? 0 : 1;
    const before = await evidence(item.submitted.id);
    const outcomes = await contend(
        () => decisions.Decide(item.reviewer, reviewerSlot.slotId, { ...approve, expectedVersion: version }, randomUUID()),
        () => independent.Decide(item.other, peerSlot.slotId, { decision: terminal, reason: "Please review this request", expectedVersion: version }, randomUUID()),
    );
    expect(outcomes[1]).toMatchObject({ status: "fulfilled" });
    if (outcomes[0]!.status === "rejected") expect(outcomes[0].reason).toMatchObject({ code: "APPROVAL_TASK_STALE" });
    const saved = await evidence(item.submitted.id);
    expect(saved.request?.status).toBe(terminal === "RETURN" ? "RETURNED" : "REJECTED");
    const added = saved.votes.filter((vote) => !before.votes.some((old) => old.decision.id === vote.decision.id));
    expect(added.map((vote) => vote.decision.decision)).toContain(terminal);
    expect(added).toHaveLength(outcomes.filter((outcome) => outcome.status === "fulfilled").length);
    expect(saved.audit.filter((event) => event.decisionId).length - before.audit.filter((event) => event.decisionId).length).toBe(added.length);
    expect(saved.outbox.filter((event) => event.eventType.startsWith("DECISION")).length - before.outbox.filter((event) => event.eventType.startsWith("DECISION")).length).toBe(added.length);
    expect(saved.stages.find((value) => value.stageNumber === 2)?.activatedAt).toEqual(before.stages.find((value) => value.stageNumber === 2)?.activatedAt);
});

test.each(["REJECT", "RETURN"] as const)("%s in stage two preserves prior votes and cancels siblings", async (decision) =>
{
    const item = await pending(true, true, true);
    await decisions.Decide(item.reviewer, item.slot, approve, randomUUID());
    await independent.Decide(item.other, item.peerSlot!, approve, randomUUID());
    const future = item.submitted.currentApprovers.filter((slot) => slot.stageNumber === 2);
    const reviewerSlot = future.find((slot) => slot.reviewer.id === item.reviewerId)!;
    const peerSlot = future.find((slot) => slot.reviewer.id === item.other.account.id)!;
    const result = await decisions.Decide(item.reviewer, reviewerSlot.slotId, { decision, reason: "Please revise the request", expectedVersion: 1 }, randomUUID());
    expect(result.requestStatus).toBe(decision === "REJECT" ? "REJECTED" : "RETURNED");
    const saved = await evidence(item.submitted.id);
    expect(saved.votes.map((vote) => vote.decision.decision).sort()).toEqual(["APPROVE", "APPROVE", decision].sort());
    expect(saved.slots.find((slot) => slot.id === peerSlot.slotId)?.status).toBe("CANCELLED");
    expect(saved.stages.find((stage) => stage.stageNumber === 1)?.status).toBe("COMPLETED");
    if (decision === "RETURN") expect(saved.request?.workingRevisionId).not.toBeNull();
});
test("approvers endpoint restricts current progress to owner and current participants", async () =>
{
    const item = await pending(true, true), http = await decisionHttp();
    const path = "/requests/" + item.submitted.id + "/approvers";
    const owner = await http.send("GET", path, item.actor);
    expect(owner.status).toBe(200);
    expect(owner.headers.get("cache-control")).toBe("private, no-store");
    const rows = await owner.json() as Array<{ slotId: string; stageNumber: number; reviewer: { id: string; displayName: string }; status: string }>;
    expect(rows).toHaveLength(3);
    for (const row of rows)
    {
        expect(Object.keys(row).sort()).toEqual(["reviewer", "slotId", "stageNumber", "status"]);
        expect(Object.keys(row.reviewer).sort()).toEqual(["displayName", "id"]);
    }
    expect(rows.map((row) => row.stageNumber)).toEqual([1, 1, 2]);
    expect((await http.send("GET", path, item.reviewer)).status).toBe(200);
    expect((await http.send("GET", path, item.other)).status).toBe(200);
    expect((await http.send("GET", path, null)).status).toBe(401);
    const outsider = await fixture();
    await db.insert(userRoles).values({ userId: outsider.ownerId, roleCode: "ADMINISTRATOR" });
    expect((await http.send("GET", path, outsider.actor)).status).toBe(404);
    await decisions.Decide(item.other, item.peerSlot!, approve, randomUUID());
    expect((await http.send("GET", path, item.other)).status).toBe(404);
});

test.each(["audit_events", "outbox_events"] as const)("activation failure at %s rolls back all effects and releases key", async (table) =>
{
    const item = await pending(false, true), key = randomUUID();
    const before = await evidence(item.submitted.id);
    await db.execute(sql.raw("CREATE FUNCTION issue10_activation_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected activation fault'; END $$"));
    await db.execute(sql.raw("CREATE TRIGGER issue10_activation_fault BEFORE INSERT ON " + table + " FOR EACH ROW EXECUTE FUNCTION issue10_activation_fault()"));
    try
    {
        await expect(decisions.Decide(item.reviewer, item.slot, approve, key)).rejects.toThrow();
    }
    finally
    {
        await db.execute(sql.raw("DROP TRIGGER IF EXISTS issue10_activation_fault ON " + table));
        await db.execute(sql.raw("DROP FUNCTION IF EXISTS issue10_activation_fault()"));
    }
    expect(await evidence(item.submitted.id)).toEqual(before);
    expect(await decisions.Decide(item.reviewer, item.slot, approve, key)).toMatchObject({ requestStatus: "PENDING", currentStageNumber: 2 });
});
test.each(["APPROVE", "REJECT"] as const)("fault immediately before audit rolls decision, state, outbox and key back (%s)", async (decision) =>
{
    const item = await pending();
    const body: DecisionRequest = { decision, expectedVersion: 0, ...(decision === "REJECT" ? { reason: "1234567890" } : {}) };
    const before = await evidence(item.submitted.id), key = randomUUID();
    const original = DecisionRepository.prototype.Save;
    const fault = vi.spyOn(DecisionRepository.prototype, "Save").mockImplementationOnce(async function(this: DecisionRepository, ...args)
    {
        // A real SQL fault at audit insertion, after the decision and state writes.
        await db.execute(sql`CREATE FUNCTION fail_decision_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type LIKE 'DECISION_%' THEN RAISE EXCEPTION 'injected audit fault'; END IF; RETURN NEW; END $$`);
        await db.execute(sql`CREATE TRIGGER test_decision_fault BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION fail_decision_audit()`);
        return original.apply(this, args);
    });
    try
{
 await expect(decisions.Decide(item.reviewer, item.slot, body, key)).rejects.toThrow();
}
    finally
    {
        fault.mockRestore();
        await db.execute(sql`DROP TRIGGER IF EXISTS test_decision_fault ON audit_events`);
        await db.execute(sql`DROP FUNCTION IF EXISTS fail_decision_audit()`);
    }
    expect(await evidence(item.submitted.id)).toEqual(before);
    expect(await db.select().from(decisionIdempotencyRecords).where(eq(decisionIdempotencyRecords.key, key))).toHaveLength(0);
    expect((await decisions.Decide(item.reviewer, item.slot, body, key)).requestStatus).toBe(decision === "REJECT" ? "REJECTED" : "APPROVED");
    const saved = await evidence(item.submitted.id);
    expect(saved.votes).toHaveLength(1);
    expect(saved.votes[0]!.decision).toMatchObject({ decision, reason: body.reason ?? null });
    expect(saved.audit.filter((event) => event.decisionId)).toHaveLength(1);
    expect(saved.outbox.filter((event) => event.eventType === `DECISION_${decision}`)).toHaveLength(1);
    expect(saved.keys).toHaveLength(1);
});
test("independent connection approve/reject races commit exactly one coherent terminal result", async () =>
{
    for (let index = 0; index < 4; index++)
    {
        const item = await pending();
        const outcomes = await Promise.allSettled([decisions.Decide(item.reviewer, item.slot, approve, randomUUID()), independent.Decide(item.reviewer, item.slot, { ...approve, decision: "REJECT", reason: "Missing information" }, randomUUID())]);
        expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        expect(outcomes.find((result) => result.status === "rejected")).toMatchObject({ reason: { code: "APPROVAL_TASK_STALE" } });
        const saved = await evidence(item.submitted.id);
        expect(saved.votes).toHaveLength(1);
        expect(saved.request!.status).toBe(saved.votes[0]!.decision.decision === "APPROVE" ? "APPROVED" : "REJECTED");
        expect(saved.audit.filter((event) => event.decisionId)).toHaveLength(1);
    }
});
test("foreign, self, wrong role, stale revision and version leave all evidence unchanged", async () =>
{
    const item = await pending();
    const before = await evidence(item.submitted.id);
    await expect(decisions.Decide(item.other, item.slot, approve, randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.insert(userRoles).values([{ userId: item.ownerId, roleCode: "REVIEWER" }, { userId: item.ownerId, roleCode: "ADMINISTRATOR" }]);
    await expect(decisions.Decide(item.actor, item.slot, approve, randomUUID())).rejects.toMatchObject({ code: "SELF_APPROVAL_FORBIDDEN" });
    await expect(decisions.Decide(item.reviewer, item.slot, { ...approve, expectedVersion: 4 }, randomUUID())).rejects.toMatchObject({ code: "APPROVAL_TASK_STALE" });
    expect(await evidence(item.submitted.id)).toEqual(before);
    await db.update(requests).set({ submittedRevisionId: null }).where(eq(requests.id, item.submitted.id));
    const staleRevision = await evidence(item.submitted.id);
    await expect(decisions.Decide(item.reviewer, item.slot, approve, randomUUID())).rejects.toMatchObject({ code: "APPROVAL_TASK_STALE" });
    expect(await evidence(item.submitted.id)).toEqual(staleRevision);
    await db.update(requests).set({ submittedRevisionId: item.submitted.submittedRevision!.id }).where(eq(requests.id, item.submitted.id));
    await db.delete(userRoles).where(and(eq(userRoles.userId, item.reviewerId), eq(userRoles.roleCode, "REVIEWER")));
    await db.insert(userRoles).values({ userId: item.reviewerId, roleCode: "REQUESTER" });
    await expect(decisions.Decide(item.reviewer, item.slot, approve, randomUUID())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await evidence(item.submitted.id)).toEqual(before);
});
test("different actors concurrently approving parallel slots finalize exactly once", async () =>
{
    const item = await pending(true);
    const results = await Promise.all([decisions.Decide(item.reviewer, item.slot, approve, randomUUID()), independent.Decide(item.other, item.peerSlot!, approve, randomUUID())]);
    expect(results.map((result) => result.requestStatus).sort()).toEqual(["APPROVED", "PENDING"]);
    expect((await evidence(item.submitted.id)).request!.status).toBe("APPROVED");
    expect((await evidence(item.submitted.id)).votes).toHaveLength(2);
});
test("real HTTP validates decision, authorization, stale replay, timeline and CORS", async () =>
{
    const { createIdentityComposition } = await import("../../src/Presentations/composition");
    const { readEnvironment } = await import("../../src/Infrastructures/Configuration/environment");
    const { createApplication } = await import("../../src/Presentations/createApplication");
    const { TokenProvider } = await import("../../src/Infrastructures/Security/TokenProvider");
    const { errorResponseSchema, decisionResultSchema, auditTimelineItemSchema } = await import("@workflow/contracts");
    const item = await pending();
    const env = readEnvironment({ NODE_ENV: "test", DATABASE_URL: process.env.TEST_DATABASE_URL, AUTH_JWT_SECRET: "decision-http-test-only-secret-32-bytes-long", AUTH_JWT_ISSUER: "decision-tests", AUTH_JWT_AUDIENCE: "decision-api", AUTH_ALLOWED_ORIGINS: "http://localhost:3000", AUTH_COOKIE_SECURE: "false" });
    const identity = await createIdentityComposition(env, database);
    const tokens = new TokenProvider(env.AUTH_JWT_SECRET, { Now: () => new Date() }, env.AUTH_JWT_ISSUER, env.AUTH_JWT_AUDIENCE);
    const reviewerToken = await tokens.Sign(item.reviewerId, item.reviewer.family.id, 0), ownerToken = await tokens.Sign(item.ownerId, item.actor.family.id, 0), foreignToken = await tokens.Sign(item.other.account.id, item.other.family.id, 0);
    const { ApprovalTaskService } = await import("../../src/Applications/Approvals/ApprovalTaskService");
    const { ApprovalTaskUnitOfWork } = await import("../../src/Infrastructures/Database/Repositories/ApprovalTaskRepository");
    const app = createApplication(undefined, identity, service, new ApprovalTaskService(new ApprovalTaskUnitOfWork(db)), decisions);
    const path = `/approval-tasks/${item.slot}/decisions`, key = randomUUID();
    const send = (target: string, body: unknown = approve, token = reviewerToken, attemptKey: string | null = key, method = "POST") => app.handle(new Request(`http://localhost/api/v1${target}`, { method, headers: { authorization: token ? `Bearer ${token}` : "", "content-type": "application/json", origin: "http://localhost:3000", ...(attemptKey ? { "Idempotency-Key": attemptKey } : {}) }, ...(method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }) }));
    async function failure(response: Response, status: number, code: string)
    {
        expect(response.status).toBe(status);
        expect(errorResponseSchema.parse(await response.json()).code).toBe(code);
    }
    const before = await evidence(item.submitted.id);
    await failure(await send(path, approve, ""), 401, "UNAUTHENTICATED");
    await failure(await send(path, approve, foreignToken), 404, "NOT_FOUND");
    await failure(await send(path, approve, ownerToken), 403, "SELF_APPROVAL_FORBIDDEN");
    await failure(await send(path, { ...approve, decision: "REJECT", reason: "  " }), 422, "VALIDATION_ERROR");
    await failure(await send(path, { ...approve, decision: "REJECT", reason: "123456789" }), 422, "VALIDATION_ERROR");
    await failure(await send(path, approve, reviewerToken, null), 422, "VALIDATION_ERROR");
    await failure(await send(path, "{"), 400, "BAD_REQUEST");
    await failure(await send(path, { ...approve, actorId: item.ownerId }), 422, "VALIDATION_ERROR");
    await failure(await send(path, { ...approve, expectedVersion: 8 }), 409, "APPROVAL_TASK_STALE");
    expect(await evidence(item.submitted.id)).toEqual(before);
    const accepted = await send(path);
    expect(accepted.status).toBe(201);
    expect(accepted.headers.get("cache-control")).toBe("no-store");
    const result = decisionResultSchema.parse(await accepted.json());
    expect(await (await send(path)).json()).toEqual(result);
    await failure(await send(path, { ...approve, reason: "different" }), 409, "IDEMPOTENCY_CONFLICT");
    await failure(await send(path, approve, reviewerToken, randomUUID()), 409, "APPROVAL_TASK_STALE");
    const handled = await send(`/approval-tasks/${item.slot}`, undefined, reviewerToken, null, "GET");
    expect(handled.status).toBe(200);
    expect(await handled.json()).toMatchObject({ id: item.slot, status: "APPROVED", canCurrentUserDecide: false });
    await failure(await send(`/approval-tasks/${item.slot}`, undefined, foreignToken, null, "GET"), 404, "NOT_FOUND");
    await failure(await send(`/requests/${item.submitted.id}`, undefined, reviewerToken, null, "GET"), 404, "NOT_FOUND");
    const timelinePath = `/requests/${item.submitted.id}/timeline`;
    const timeline = await send(timelinePath + "?pageSize=1", undefined, ownerToken, null, "GET");
    expect(timeline.status).toBe(200);
    expect((await timeline.json()).map((event: unknown) => auditTimelineItemSchema.parse(event))).toHaveLength(1);
    expect(JSON.parse(timeline.headers.get("X-Pagination")!).hasNext).toBe(true);
    await failure(await send(timelinePath + "?pageSize=101", undefined, ownerToken, null, "GET"), 422, "VALIDATION_ERROR");
    await failure(await send(timelinePath, undefined, foreignToken, null, "GET"), 404, "NOT_FOUND");
    const cors = await app.handle(new Request(`http://localhost/api/v1${path}`, { method: "OPTIONS", headers: { origin: "http://localhost:3000", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type,idempotency-key" } }));
    expect(cors.status).toBe(204);
    expect(cors.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("idempotency-key");
});

test("Lab 7 HTTP validates new rejections while historical short decisions remain readable and replayable", async () =>
{
    const http = await decisionHttp(), send = http.post;
    const item = await pending();
    const before = await evidence(item.submitted.id);
    for (const reason of [undefined, "", " \n ", "123456789", "😀😀😀😀x", "x".repeat(4001)])
    {
        const response = await send(item, { decision: "REJECT", reason, expectedVersion: 0 }, randomUUID());
        expect(response.status).toBe(422);
        expect(await response.json()).toMatchObject({ code: "VALIDATION_ERROR" });
        expect(await evidence(item.submitted.id)).toEqual(before);
    }
    expect(await db.select().from(decisionIdempotencyRecords).where(eq(decisionIdempotencyRecords.scope, `POST /api/v1/approval-tasks/${item.slot}/decisions`))).toEqual([]);
    const accepted = await send(item, { decision: "REJECT", reason: " 1234567890 ", expectedVersion: 0 }, randomUUID());
    expect(accepted.status).toBe(201);
    expect(await accepted.json()).toMatchObject({ requestStatus: "REJECTED" });
    expect((await decisions.Timeline(item.actor, item.submitted.id, { pageNumber: 1, pageSize: 100 })).items.find((event) => event.metadata.decision === "REJECT")?.note).toBe("1234567890");

    // Seed a pre-upgrade accepted row through the existing persistence boundary.
    // This deliberately bypasses NEW-decision validation only in this test fixture.
    const historical = await pending(), key = randomUUID();
    const oldBody: DecisionRequest = { decision: "REJECT", reason: "No", expectedVersion: 0 };
    const oldResult = await new DecisionUnitOfWork(db).Run(async (repository) =>
    {
        const actor = await repository.CurrentActor(historical.reviewer);
        const state = await repository.Lock(actor, historical.slot);
        const result = await repository.Save(actor.account.id, historical.slot, oldBody, state, { stageId: state.stages[0]!.id, stageComplete: true, requestStatus: "REJECTED", currentStageNumber: null });
        const hash = createHash("sha256").update(JSON.stringify(["REJECT", "No", 0])).digest("hex");
        await repository.Complete(actor.account.id, `POST /api/v1/approval-tasks/${historical.slot}/decisions`, key, hash, result);
        return result;
    });
    const historicalBefore = await evidence(historical.submitted.id);
    const replay = await send(historical, oldBody, key);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(oldResult);
    expect((await send(historical, oldBody, randomUUID())).status).toBe(422);
    expect((await send(historical, { ...oldBody, reason: "Changed reason" }, key)).status).toBe(409);
    expect((await decisions.Timeline(historical.actor, historical.submitted.id, { pageNumber: 1, pageSize: 100 })).items.find((event) => event.metadata.decision === "REJECT")?.note).toBe("No");
    for (const actor of [historical.actor, historical.reviewer])
    {
        const response = await http.timeline(historical, actor);
        expect(response.status).toBe(200);
        const timeline: { note: string | null; metadata: { decision?: string } }[] = await response.json();
        expect(timeline.find((event) => event.metadata.decision === "REJECT")?.note).toBe("No");
    }
    for (const rewrite of [() => db.update(approvalDecisions).set({ reason: "rewritten history" }).where(eq(approvalDecisions.id, oldResult.decisionId)), () => db.delete(approvalDecisions).where(eq(approvalDecisions.id, oldResult.decisionId))])
    {
        await expect(rewrite()).rejects.toThrow();
    }
    expect(await evidence(historical.submitted.id)).toEqual(historicalBefore);
    expect(await db.select().from(decisionIdempotencyRecords).where(eq(decisionIdempotencyRecords.scope, `POST /api/v1/approval-tasks/${historical.slot}/decisions`))).toHaveLength(1);
});

test.each([["minimum", "1234567890"], ["padded minimum", " 1234567890 "], ["eleven", "12345678901"], ["maximum", "x".repeat(4000)], ["padded maximum", ` ${"x".repeat(4000)} `], ["UTF-16 minimum", "😀😀😀😀😀"], ["combining minimum", "e\u0301".repeat(5)]])("Lab 7 raw HTTP rejection commits every effect: %s", async (_label, reason) =>
{
    const item = await pending(true, true), http = await decisionHttp(), key = randomUUID();
    const before = await evidence(item.submitted.id);
    // Send the original raw value: preprocessing here would bypass route trimming.
    const body: DecisionRequest = { decision: "REJECT", reason, expectedVersion: 0 };
    const response = await http.post(item, body, key);
    expect(response.status).toBe(201);
    const result: unknown = await response.json();
    expect(result).toMatchObject({ requestStatus: "REJECTED", requestVersion: 2, taskVersion: 1, currentStageNumber: null });
    const saved = await evidence(item.submitted.id);
    expect(saved.request).toMatchObject({ status: "REJECTED", version: before.request!.version + 1 });
    expect(saved.cycles.find((cycle) => cycle.id === item.submitted.currentCycleId)?.isActive).toBe(false);
    expect(saved.stages.find((stage) => stage.stageNumber === 1)?.status).toBe("REJECTED");
    expect(saved.stages.find((stage) => stage.stageNumber === 2)?.status).toBe("CANCELLED");
    for (const slot of saved.slots)
    {
        expect(slot).toMatchObject({ status: slot.id === item.slot ? "REJECTED" : "CANCELLED", version: before.slots.find((old) => old.id === slot.id)!.version + 1 });
    }
    expect(saved.votes).toHaveLength(1);
    const decision = saved.votes[0]!.decision;
    expect(decision).toMatchObject({ slotId: item.slot, decision: "REJECT", reason: reason.trim(), actorId: item.reviewerId });
    const auditDelta = saved.audit.filter((event) => !before.audit.some((old) => old.id === event.id));
    expect(auditDelta.map((event) => event.eventType).sort()).toEqual(["DECISION_REJECT", "REQUEST_REJECTED"]);
    expect(auditDelta.find((event) => event.eventType === "DECISION_REJECT")).toMatchObject({ decisionId: decision.id, revisionId: item.submitted.submittedRevision!.id, cycleId: item.submitted.currentCycleId });
    const outboxDelta = saved.outbox.filter((event) => !before.outbox.some((old) => old.id === event.id));
    expect(outboxDelta).toHaveLength(1);
    expect(outboxDelta[0]).toMatchObject({ eventType: "DECISION_REJECT", eventKey: `decision:${decision.id}`, payload: { requestId: item.submitted.id, cycleId: item.submitted.currentCycleId } });
    expect(saved.keys).toHaveLength(1);
    expect(saved.keys[0]).toMatchObject({ key, actorId: item.reviewerId, response: result });
    const history = await http.timeline(item);
    expect(history.status).toBe(200);
    expect(await history.json()).toEqual(expect.arrayContaining([expect.objectContaining({ eventType: "DECISION_REJECT", note: reason.trim() })]));
    const replay = await http.post(item, body, key);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(result);
    expect((await http.post(item, { ...body, reason: "Changed reason" }, key)).status).toBe(409);
    expect((await http.post(item, body)).status).toBe(409);
    expect(await evidence(item.submitted.id)).toEqual(saved);
});

test.each(["anonymous", "self", "foreign", "missing", "wrong role", "inactive"])("Lab 7 valid REJECT HTTP authorization has no writes: %s", async (scenario) =>
{
    const item = await pending(), http = await decisionHttp();
    if (scenario === "wrong role")
    {
        await db.delete(userRoles).where(eq(userRoles.userId, item.reviewerId));
        await db.insert(userRoles).values({ userId: item.reviewerId, roleCode: "REQUESTER" });
    }
    if (scenario === "inactive")
    {
        await db.update(users).set({ isActive: false }).where(eq(users.id, item.reviewerId));
    }
    const before = await evidence(item.submitted.id);
    const actor = scenario === "anonymous" ? null : scenario === "self" ? item.actor : scenario === "foreign" ? item.other : item.reviewer;
    const response = await http.post(item, { decision: "REJECT", reason: "1234567890", expectedVersion: 0 }, randomUUID(), actor, scenario === "missing" ? randomUUID() : item.slot);
    const status = scenario === "anonymous" || scenario === "inactive" ? 401 : scenario === "foreign" || scenario === "missing" ? 404 : 403;
    const code = status === 401 ? "UNAUTHENTICATED" : status === 404 ? "NOT_FOUND" : scenario === "self" ? "SELF_APPROVAL_FORBIDDEN" : "FORBIDDEN";
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
    expect(await evidence(item.submitted.id)).toEqual(before);
});

test.each(["version", "revision", "cycle", "slot"])("Lab 7 valid REJECT HTTP stale %s leaves state and keys unchanged", async (scenario) =>
{
    const item = await pending(), http = await decisionHttp();
    if (scenario === "revision")
    {
        await db.update(requests).set({ submittedRevisionId: null }).where(eq(requests.id, item.submitted.id));
    }
    if (scenario === "cycle")
    {
        await db.update(approvalCycles).set({ isActive: false }).where(eq(approvalCycles.id, item.submitted.currentCycleId!));
    }
    if (scenario === "slot")
    {
        await db.update(approvalSlots).set({ status: "WAITING" }).where(eq(approvalSlots.id, item.slot));
    }
    const before = await evidence(item.submitted.id);
    const response = await http.post(item, { decision: "REJECT", reason: "1234567890", expectedVersion: scenario === "version" ? 4 : 0 });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "APPROVAL_TASK_STALE" });
    expect(await evidence(item.submitted.id)).toEqual(before);
});

test.each([[undefined, 422, "VALIDATION_ERROR"], [" ", 422, "VALIDATION_ERROR"]] as const)("RR-AC-01a RETURN rejects missing reason %s", async (reason, status, code) =>
{
    const item = await pending(), http = await decisionHttp(), before = await evidence(item.submitted.id);
    const response = await http.post(item, { decision: "RETURN", reason, expectedVersion: 0 });
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ code });
    expect(await evidence(item.submitted.id)).toEqual(before);
});
test.skipIf(process.env.RUN_BUILT_HTTP_SMOKE !== "1")("API process restart preserves incomplete draft, accepted replay and timeline", async () =>
{
    const { spawn } = await import("node:child_process");
    const { createServer } = await import("node:net");
    const { EventEmitter } = await import("node:events");
    const { resolve } = await import("node:path");
    const { TokenProvider } = await import("../../src/Infrastructures/Security/TokenProvider");
    const { assertTestDatabaseTarget } = await import("../../src/Infrastructures/Database/testDatabaseTargetGuard");
    const target = assertTestDatabaseTarget();
    const item = await pending();
    const secret = "decision-process-test-only-secret-32-bytes";
    const provider = new TokenProvider(secret, { Now: () => new Date() }, "decisions", "decisions-api");
    const reviewer = await provider.Sign(item.reviewerId, item.reviewer.family.id, 0), owner = await provider.Sign(item.ownerId, item.actor.family.id, 0);
    const key = randomUUID();
    let original: unknown, timeline: unknown;
    let savedDraft: RequestDetail | null = null;
    for (let iteration = 0; iteration < 2; iteration++)
    {
        const listener = createServer();
        const listening = EventEmitter.once(listener, "listening");
        listener.listen(0, "127.0.0.1");
        await listening;
        const address = listener.address();
        if (!address || typeof address === "string") throw new Error("No test listener address");
        const port = address.port;
        await new Promise<void>((done) => listener.close(() => done()));
        const child = spawn(process.execPath, [resolve("dist/index.js")], { shell: false, stdio: "ignore", env: { ...process.env, NODE_ENV: "test", DATABASE_URL: target, HOST: "127.0.0.1", PORT: String(port), AUTH_JWT_SECRET: secret, AUTH_JWT_ISSUER: "decisions", AUTH_JWT_AUDIENCE: "decisions-api", AUTH_ALLOWED_ORIGINS: "http://localhost:3000", AUTH_COOKIE_SECURE: "false" } });
        let startupError: Error | null = null;
        child.on("error", (error) =>
{
 startupError = error;
});
        const base = `http://127.0.0.1:${port}`;
        try
        {
            let ready = false;
            for (let attempt = 0; attempt < 100; attempt++)
            {
                if (startupError || child.exitCode !== null) throw startupError ?? new Error("Listener stopped");
                try
{
 ready = (await fetch(`${base}/health`, { signal: AbortSignal.timeout(200) })).ok;
}
                catch
{ /* Startup is asynchronous. */ }
                if (ready) break;
                await new Promise((done) => setTimeout(done, 50));
            }
            expect(ready).toBe(true);
            if (iteration === 0)
            {
                const created = await fetch(`${base}/api/v1/requests`, { method: "POST", headers: { authorization: `Bearer ${owner}`, "Idempotency-Key": randomUUID(), "content-type": "application/json" }, body: JSON.stringify({ typeId: item.typeId, formDefinitionVersionId: item.versionId, title: "Survives API restart" }), signal: AbortSignal.timeout(3000) });
                expect(created.status).toBe(201);
                savedDraft = requestDetailSchema.parse(await created.json());
            }
            const restored = await fetch(`${base}/api/v1/requests/${savedDraft!.id}`, { headers: { authorization: `Bearer ${owner}` }, signal: AbortSignal.timeout(3000) });
            expect(restored.status).toBe(200);
            expect(requestDetailSchema.parse(await restored.json())).toEqual(savedDraft);
            expect(savedDraft).toMatchObject({ status: "DRAFT", requestNumber: null, submittedRevision: null, currentCycleId: null, currentApprovers: [] });
            const response = await fetch(`${base}/api/v1/approval-tasks/${item.slot}/decisions`, { method: "POST", headers: { authorization: `Bearer ${reviewer}`, "Idempotency-Key": key, "content-type": "application/json" }, body: JSON.stringify(approve), signal: AbortSignal.timeout(3000) });
            expect(response.status).toBe(201);
            const value: unknown = await response.json();
            const history = await fetch(`${base}/api/v1/requests/${item.submitted.id}/timeline`, { headers: { authorization: `Bearer ${owner}` }, signal: AbortSignal.timeout(3000) });
            expect(history.status).toBe(200);
            const events: unknown = await history.json();
            if (iteration === 0)
{
 original = value; timeline = events;
}
            else
{
 expect(value).toEqual(original); expect(events).toEqual(timeline);
}
        }
        finally
        {
            if (child.exitCode === null)
            {
                const stopped = EventEmitter.once(child, "exit", { signal: AbortSignal.timeout(3000) });
                child.kill("SIGTERM");
                try
{
 await stopped;
}
                catch
{
 child.kill("SIGKILL");
}
            }
        }
    }
    expect((await evidence(item.submitted.id)).votes).toHaveLength(1);
});
test("handled task remains readable without granting current detail, queue or foreign access", async () =>
{
    const { ApprovalTaskService } = await import("../../src/Applications/Approvals/ApprovalTaskService");
    const { ApprovalTaskUnitOfWork } = await import("../../src/Infrastructures/Database/Repositories/ApprovalTaskRepository");
    const { approvalTaskSearchSchema } = await import("@workflow/contracts");
    const item = await pending();
    const tasks = new ApprovalTaskService(new ApprovalTaskUnitOfWork(db));
    await expect(tasks.Read(item.other, item.slot)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await decisions.Decide(item.reviewer, item.slot, approve, randomUUID());
    expect(await tasks.Read(item.reviewer, item.slot)).toMatchObject({ id: item.slot, status: "APPROVED", canCurrentUserDecide: false, revisionId: item.submitted.submittedRevision!.id });
    await expect(tasks.Read(item.other, item.slot)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.Read(item.reviewer, item.submitted.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await tasks.Search(item.reviewer, approvalTaskSearchSchema.parse({}))).items).toEqual([]);
    await db.delete(userRoles).where(and(eq(userRoles.userId, item.reviewerId), eq(userRoles.roleCode, "REVIEWER")));
    await db.insert(userRoles).values({ userId: item.reviewerId, roleCode: "REQUESTER" });
    expect(await tasks.Read(item.reviewer, item.slot)).toMatchObject({ canCurrentUserDecide: false });
    await expect(tasks.Search(item.reviewer, approvalTaskSearchSchema.parse({}))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await db.insert(userRoles).values({ userId: item.other.account.id, roleCode: "ADMINISTRATOR" });
    await expect(tasks.Read(item.other, item.slot)).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("DW-AC-05 withdrawal preserves partial votes/snapshot, closes future tasks, and replays durably", async () =>
{
    const item = await pending(true, true);
    await decisions.Decide(item.reviewer, item.slot, approve, randomUUID());
    const before = await evidence(item.submitted.id);
    const revision = await db.select().from(requestRevisions).where(eq(requestRevisions.id, item.submitted.submittedRevision!.id));
    const current = await service.Read(item.actor, item.submitted.id);
    const body = { expectedVersion: current.version, reason: "Plans changed" };
    const key = randomUUID();
    const withdrawn = await service.Mutate(item.actor, "withdraw", current.id, body, key);
    expect(withdrawn).toMatchObject({ status: "WITHDRAWN", version: current.version + 1, currentStageNumber: null, availableActions: [], submittedRevision: current.submittedRevision });
    expect(withdrawn.currentApprovers.map((slot) => slot.status).sort()).toEqual(["APPROVED", "CANCELLED", "CANCELLED"]);
    const saved = await evidence(current.id);
    expect(saved.votes).toEqual(before.votes);
    expect(saved.cycles[0]).toEqual({ ...before.cycles[0], isActive: false });
    expect(saved.stages.every((stage) => stage.status === "CANCELLED")).toBe(true);
    expect(saved.slots.filter((slot) => slot.status === "CANCELLED").every((slot) => slot.version === 1)).toBe(true);
    expect(saved.audit.filter((event) => event.eventType === "REQUEST_WITHDRAWN")).toEqual([expect.objectContaining({ actorId: item.ownerId, note: "Plans changed", occurredAt: expect.any(Date), cycleId: current.currentCycleId, revisionId: current.submittedRevision!.id })]);
    expect(await new RequestService(new RequestUnitOfWork(observer.connection)).Mutate(item.actor, "withdraw", current.id, body, key)).toEqual(withdrawn);
    await expect(service.Mutate(item.actor, "withdraw", current.id, { ...body, reason: "changed" }, key)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(decisions.Decide(item.other, item.peerSlot!, approve, randomUUID())).rejects.toMatchObject({ code: "APPROVAL_TASK_STALE" });
    expect(await evidence(current.id)).toEqual(saved);
    const timeline = await decisions.Timeline(item.actor, current.id, { pageNumber: 1, pageSize: 100 });
    expect(timeline.items.find((event) => event.eventType === "REQUEST_WITHDRAWN")?.note).toBe("Plans changed");
    expect(await db.select().from(requestRevisions).where(eq(requestRevisions.id, current.submittedRevision!.id))).toEqual(revision);
});

test("DW-AC-06 rejects foreign, roleless, stale, draft and terminal withdrawal without mutation", async () =>
{
    const item = await pending();
    const before = await evidence(item.submitted.id);
    await expect(service.Mutate(item.other, "withdraw", item.submitted.id, { expectedVersion: 1 }, randomUUID())).rejects.toMatchObject({ code: "FORBIDDEN" });
    const foreign = await fixture();
    await expect(service.Mutate(foreign.actor, "withdraw", item.submitted.id, { expectedVersion: 1 }, randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.Mutate(item.actor, "withdraw", item.submitted.id, { expectedVersion: 0 }, randomUUID())).rejects.toMatchObject({ code: "REQUEST_STALE" });
    expect(await evidence(item.submitted.id)).toEqual(before);
    const draft = await item.draft();
    await expect(service.Mutate(item.actor, "withdraw", draft.id, { expectedVersion: 0 }, randomUUID())).rejects.toMatchObject({ code: "INVALID_REQUEST_TRANSITION" });
    for (const decision of ["APPROVE", "REJECT"] as const)
    {
        const terminal = await pending();
        await decisions.Decide(terminal.reviewer, terminal.slot, { ...approve, decision, ...(decision === "REJECT" ? { reason: "Terminal rejection" } : {}) }, randomUUID());
        const saved = await evidence(terminal.submitted.id);
        await expect(service.Mutate(terminal.actor, "withdraw", terminal.submitted.id, { expectedVersion: 2 }, randomUUID())).rejects.toMatchObject({ code: "INVALID_REQUEST_TRANSITION" });
        expect(await evidence(terminal.submitted.id)).toEqual(saved);
    }
});

test("DB-08 withdrawal rollback includes task changes, audit, outbox and idempotency completion", async () =>
{
    const item = await pending(true, true), before = await evidence(item.submitted.id), key = randomUUID();
    const complete = vi.spyOn(RequestRepository.prototype, "Complete").mockImplementationOnce(async () =>
    {
        throw new Error("injected withdrawal completion failure");
    });
    try
    {
        await expect(service.Mutate(item.actor, "withdraw", item.submitted.id, { expectedVersion: 1 }, key)).rejects.toThrow("injected withdrawal completion failure");
    }
    finally
    {
        complete.mockRestore();
    }
    expect(await evidence(item.submitted.id)).toEqual(before);
    expect((await service.Mutate(item.actor, "withdraw", item.submitted.id, { expectedVersion: 1 }, key)).status).toBe("WITHDRAWN");
});

test.each(["APPROVE", "REJECT"] as const)("CX-04 simultaneous withdrawal versus %s shares request lock and has one valid outcome", async (decision) =>
{
    const item = await pending();
    let arrivals = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => release = resolve);
    async function rendezvous()
    {
        if (++arrivals === 2) release();
        await ready;
    }
    const read = RequestRepository.prototype.Read;
    const lock = DecisionRepository.prototype.Lock;
    const requestSpy = vi.spyOn(RequestRepository.prototype, "Read").mockImplementation(async function (this: RequestRepository, id, locked)
    {
        if (id === item.submitted.id && locked) await rendezvous();
        return read.call(this, id, locked);
    });
    const decisionSpy = vi.spyOn(DecisionRepository.prototype, "Lock").mockImplementation(async function (this: DecisionRepository, actor, taskId)
    {
        if (taskId === item.slot) await rendezvous();
        return lock.call(this, actor, taskId);
    });
    let outcomes: PromiseSettledResult<unknown>[];
    try
    {
        outcomes = await Promise.allSettled([
            service.Mutate(item.actor, "withdraw", item.submitted.id, { expectedVersion: 1 }, randomUUID()),
            independent.Decide(item.reviewer, item.slot, { ...approve, decision, ...(decision === "REJECT" ? { reason: "Concurrent rejection" } : {}) }, randomUUID()),
        ]);
    }
    finally
    {
        requestSpy.mockRestore();
        decisionSpy.mockRestore();
    }
    expect(arrivals).toBe(2);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const saved = await evidence(item.submitted.id);
    const withdrawn = saved.request!.status === "WITHDRAWN";
    expect(saved.request!.status).toBe(withdrawn ? "WITHDRAWN" : decision === "APPROVE" ? "APPROVED" : "REJECTED");
    expect(saved.cycles[0]!.isActive).toBe(false);
    expect(saved.votes).toHaveLength(withdrawn ? 0 : 1);
    expect(saved.slots.every((slot) => !["ACTIONABLE", "WAITING"].includes(slot.status))).toBe(true);
    expect(saved.audit.filter((event) => event.eventType === "REQUEST_WITHDRAWN")).toHaveLength(withdrawn ? 1 : 0);
});

test("CX-14 same-key simultaneous withdrawal returns one durable outcome and one history event", async () =>
{
    const item = await pending(), key = randomUUID(), body = { expectedVersion: 1, reason: "One logical withdrawal" };
    const [first, second] = await Promise.all([
        service.Mutate(item.actor, "withdraw", item.submitted.id, body, key),
        new RequestService(new RequestUnitOfWork(observer.connection)).Mutate(item.actor, "withdraw", item.submitted.id, body, key),
    ]);
    expect(first).toEqual(second);
    const saved = await evidence(item.submitted.id);
    expect(saved.audit.filter((event) => event.eventType === "REQUEST_WITHDRAWN")).toHaveLength(1);
    expect(saved.outbox.filter((event) => event.eventType === "REQUEST_WITHDRAWN")).toHaveLength(1);
    expect(saved.votes).toEqual([]);
});

test("RR-AC-01b through 04b return, resubmit and exact historical reads", async () =>
{
    const item = await pending(true, true);
    const original = item.submitted.submittedRevision!;
    const result = await decisions.Decide(item.reviewer, item.slot, { decision: "RETURN", reason: " Revise ", expectedVersion: 0 }, randomUUID());
    expect(result.requestStatus).toBe("RETURNED");
    const returned = await service.Read(item.actor, item.submitted.id);
    expect(returned.workingRevision).toMatchObject({ revisionNumber: 2, fields: original.fields, formDefinitionVersionId: original.formDefinitionVersionId });
    expect(returned.workingRevision!.id).not.toBe(original.id);
    expect(returned.submittedRevision).toEqual(original);
    expect(returned.currentApprovers.map((slot) => slot.status).sort()).toEqual(["CANCELLED", "CANCELLED", "RETURNED"]);
    expect((await service.Revisions(item.actor, returned.id, { pageNumber: 1, pageSize: 20 })).items).toHaveLength(1);
    await expect(service.Revision(item.other, returned.id, original.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const edited = await service.Mutate(item.actor, "patch", returned.id, { expectedVersion: returned.version, title: "Revised" });
    await db.update(reviewerAssignmentRules).set({ reviewerId: item.other.account.id }).where(eq(reviewerAssignmentRules.id, item.assignmentId));
    const key = randomUUID();
    const submitted = await service.Mutate(item.actor, "resubmit", returned.id, { expectedVersion: edited.version }, key);
    expect(submitted).toMatchObject({ status: "PENDING", requestNumber: item.submitted.requestNumber, department: item.submitted.department, submittedAt: item.submitted.submittedAt });
    expect(submitted.submittedRevision!.id).toBe(returned.workingRevision!.id);
    expect(submitted.currentCycleId).not.toBe(item.submitted.currentCycleId);
    expect(await service.Mutate(item.actor, "resubmit", returned.id, { expectedVersion: edited.version }, key)).toEqual(submitted);
    expect(await service.Revision(item.reviewer, returned.id, original.id)).toEqual(original);
    await expect(service.Revision(item.reviewer, returned.id, submitted.submittedRevision!.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.Revisions(item.reviewer, returned.id, { pageNumber: 1, pageSize: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await service.Revisions(item.actor, returned.id, { pageNumber: 1, pageSize: 1 })).pagination).toMatchObject({ totalCount: 2, totalPages: 2, hasNext: true });
});

test("RR-AC-02 through 04 preserves item evidence, original department and pinned form across cycles", async () =>
{
    const item = await fixture(true, true);
    const reviewerFamily = randomUUID();
    await db.insert(sessionFamilies).values({ id: reviewerFamily, userId: item.reviewerId, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
    const reviewer = (await new IdentityRepository(db).ReadCurrentIdentity(item.reviewerId, reviewerFamily))!;
    const draft = await item.draft();
    const first = await service.Mutate(item.actor, "submit", draft.id, { expectedVersion: draft.version }, randomUUID());
    const firstRevision = first.submittedRevision!;
    await decisions.Decide(reviewer, first.currentApprovers[0]!.slotId, { decision: "RETURN", reason: "Fix", expectedVersion: 0 }, randomUUID());
    const returned = await service.Read(item.actor, first.id);
    expect(returned.workingRevision!.lineItems[0]).toMatchObject({ description: "Parts", quantity: firstRevision.lineItems[0]!.quantity, unitAmount: firstRevision.lineItems[0]!.unitAmount, totalAmount: firstRevision.lineItems[0]!.totalAmount });
    expect(returned.workingRevision!.lineItems[0]!.id).not.toBe(firstRevision.lineItems[0]!.id);
    const otherDepartment = randomUUID();
    await db.insert(departments).values({ id: otherDepartment, code: otherDepartment, name: "New" });
    await db.update(departmentMemberships).set({ isPrimary: false, isActive: false }).where(and(eq(departmentMemberships.userId, item.ownerId), eq(departmentMemberships.departmentId, item.departmentId)));
    await db.insert(departmentMemberships).values({ userId: item.ownerId, departmentId: otherDepartment, isPrimary: true });
    await expect(service.Mutate(item.actor, "resubmit", first.id, { expectedVersion: returned.version }, randomUUID())).rejects.toMatchObject({ code: "CONFIGURATION_INCOMPLETE" });
    await db.update(departmentMemberships).set({ isActive: true }).where(and(eq(departmentMemberships.userId, item.ownerId), eq(departmentMemberships.departmentId, item.departmentId)));
    await db.update(departments).set({ name: "Renamed" }).where(eq(departments.id, item.departmentId));
    const nextVersion = randomUUID();
    await db.insert(requestTypeVersions).values({ id: nextVersion, typeId: item.typeId, versionNumber: 2, definition: { ...seededDefinition, id: item.typeId, versionId: nextVersion, code: `T${item.typeId}`, monetary: true, supportsLineItems: true } });
    await db.update(requestTypes).set({ publishedVersionId: nextVersion, isEnabled: false }).where(eq(requestTypes.id, item.typeId));
    const nextPolicy = randomUUID();
    await db.update(approvalPolicyVersions).set({ isActive: false }).where(eq(approvalPolicyVersions.id, item.policyId));
    await db.insert(approvalPolicyVersions).values({ id: nextPolicy, typeId: item.typeId, code: nextPolicy, versionNumber: 1, priority: 1, stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 120 }] });
    const second = await service.Mutate(item.actor, "resubmit", first.id, { expectedVersion: returned.version }, randomUUID());
    expect((await db.select().from(approvalCycles).where(eq(approvalCycles.id, second.currentCycleId!)))[0]!.policyVersionId).toBe(nextPolicy);
    expect(second.department).toEqual(first.department);
    expect(second.submittedRevision!.formDefinitionVersionId).toBe(item.versionId);
    expect(second.submittedRevision!.lineItems).toEqual(returned.workingRevision!.lineItems);
    expect(await service.Revision(item.actor, first.id, firstRevision.id)).toEqual(firstRevision);
    await decisions.Decide(reviewer, second.currentApprovers[0]!.slotId, { decision: "RETURN", reason: "Again", expectedVersion: 0 }, randomUUID());
    const again = await service.Read(item.actor, first.id);
    expect(again.workingRevision!.revisionNumber).toBe(3);
    expect((await service.Revisions(item.actor, first.id, { pageNumber: 1, pageSize: 20 })).items.map((row) => row.revisionNumber)).toEqual([2, 1]);
    await expect(service.Revisions(reviewer, first.id, { pageNumber: 1, pageSize: 20 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await service.Revision(reviewer, first.id, firstRevision.id)).toEqual(firstRevision);
    await expect(service.Revision(reviewer, first.id, again.workingRevision!.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const third = await service.Mutate(item.actor, "resubmit", first.id, { expectedVersion: again.version }, randomUUID());
    expect(third.submittedRevision!.revisionNumber).toBe(3);
    expect(third.currentCycleId).not.toBe(second.currentCycleId);
    expect(third.currentApprovers.every((slot) => slot.status === "ACTIONABLE" || slot.status === "WAITING")).toBe(true);
    expect((await service.Revisions(item.actor, first.id, { pageNumber: 1, pageSize: 20 })).items.map((row) => row.revisionNumber)).toEqual([3, 2, 1]);
});

test("RR-AC-03/04 HTTP validates resubmit body, key, bounded listing and exact revision", async () =>
{
    const item = await pending();
    const http = await decisionHttp();
    await decisions.Decide(item.reviewer, item.slot, { decision: "RETURN", reason: "Fix", expectedVersion: 0 }, randomUUID());
    const returned = await service.Read(item.actor, item.submitted.id);
    const base = `/requests/${returned.id}`;
    expect((await http.send("POST", `${base}/resubmit`, item.actor, { expectedVersion: returned.version, extra: true })).status).toBe(422);
    expect((await http.send("POST", `${base}/resubmit`, item.actor, { expectedVersion: null })).status).toBe(422);
    expect((await http.send("POST", `${base}/resubmit`, item.actor, { expectedVersion: returned.version }, "invalid")).status).toBe(422);
    expect((await http.send("GET", `${base}/revisions?pageSize=101`, item.actor)).status).toBe(422);
    expect((await http.send("GET", `${base}/revisions?extra=x`, item.actor)).status).toBe(422);
    const list = await http.send("GET", `${base}/revisions?pageSize=1`, item.actor);
    expect(list.status).toBe(200);
    expect(JSON.parse(list.headers.get("x-pagination")!)).toMatchObject({ totalCount: 1, pageSize: 1 });
    expect(await list.json()).toMatchObject([{ id: item.submitted.submittedRevision!.id, cycleId: item.submitted.currentCycleId }]);
    expect((await http.send("GET", `${base}/revisions/${returned.workingRevision!.id}`, item.actor)).status).toBe(404);
    expect((await http.send("GET", `${base}/revisions/${item.submitted.submittedRevision!.id}`, item.reviewer)).status).toBe(200);
    expect((await http.send("GET", `${base}/revisions`, item.reviewer)).status).toBe(404);
    expect((await http.send("POST", `${base}/resubmit`, item.actor, { expectedVersion: returned.version })).status).toBe(200);
});

test("RR-AC-07b decision constraint permits historical short REJECT reasons", async () =>
{
    const item = await pending();
    await expect(db.insert(approvalDecisions).values({ id: randomUUID(), slotId: item.slot, actorId: item.reviewerId, decision: "REJECT", reason: "old", decidedAt: new Date() })).resolves.toBeDefined();
});
