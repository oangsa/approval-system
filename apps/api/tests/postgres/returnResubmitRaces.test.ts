import { randomUUID } from "node:crypto";
import { afterAll, expect, test, vi } from "vitest";
import { eq, inArray, sql } from "drizzle-orm";
import type { CreateRequest, PublishedRequestType } from "@workflow/contracts";
import { createTestDatabase } from "../helpers/testDatabase";
import { ConfigurationService } from "../../src/Applications/Policies/ConfigurationService";
import { ConfigurationRepository, ConfigurationUnitOfWork } from "../../src/Infrastructures/Database/Repositories/ConfigurationRepository";
import { RequestTypeService } from "../../src/Applications/RequestTypes/RequestTypeService";
import { RequestTypeRepository, RequestTypeUnitOfWork } from "../../src/Infrastructures/Database/Repositories/RequestTypeRepository";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import { DecisionService } from "../../src/Applications/Approvals/DecisionService";
import { RequestRepository, RequestUnitOfWork } from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { DecisionUnitOfWork } from "../../src/Infrastructures/Database/Repositories/DecisionRepository";
import { IdentityRepository } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import { seededDefinition } from "../../src/Infrastructures/Database/seedRequests";
import { approvalCycles, approvalDecisions, approvalPolicyVersions, approvalSlots, approvalStages, departmentMemberships, departments, idempotencyRecords, requestAuditEvents, requestItems, requestOutboxEvents, requestRevisions, requests, requestTypes, requestTypeVersions, reviewerAssignmentRules, sessionFamilies, userRoles, users } from "../../src/Infrastructures/Database/schema";

const database = createTestDatabase(), observer = createTestDatabase();
const db = database.connection;
const service = new RequestService(new RequestUnitOfWork(db));
const otherService = new RequestService(new RequestUnitOfWork(observer.connection));
const decisions = new DecisionService(new DecisionUnitOfWork(db));
const otherDecisions = new DecisionService(new DecisionUnitOfWork(observer.connection));
afterAll(async () =>
{
 await database.Close(); await observer.Close();
});

async function pending()
{
    const ownerId = randomUUID(), reviewerId = randomUUID(), departmentId = randomUUID(), typeId = randomUUID(), versionId = randomUUID(), policyId = randomUUID();
    const definition: PublishedRequestType = { ...seededDefinition, id: typeId, versionId, code: `T${typeId}`, monetary: false, supportsLineItems: false };
    await db.transaction(async (tx) =>
    {
        await tx.insert(users).values([ownerId, reviewerId].map((id) => ({ id, email: `${id}@example.test`, displayName: id, passwordHash: "not-for-login" })));
        await tx.insert(userRoles).values([{ userId: ownerId, roleCode: "REQUESTER" }, { userId: reviewerId, roleCode: "REVIEWER" }]);
        await tx.insert(departments).values({ id: departmentId, code: departmentId, name: "Operations" });
        await tx.insert(departmentMemberships).values({ userId: ownerId, departmentId, isPrimary: true });
        await tx.insert(requestTypes).values({ id: typeId, code: definition.code });
        await tx.insert(requestTypeVersions).values({ id: versionId, typeId, versionNumber: 1, definition });
        await tx.update(requestTypes).set({ publishedVersionId: versionId }).where(eq(requestTypes.id, typeId));
        await tx.insert(approvalPolicyVersions).values({ id: policyId, typeId, code: policyId, versionNumber: 1, priority: 1, stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 480 }] });
        await tx.insert(reviewerAssignmentRules).values({ id: randomUUID(), assignmentKey: "review", departmentId, reviewerId });
    });
    async function actor(userId: string)
    {
        const id = randomUUID();
        await db.insert(sessionFamilies).values({ id, userId, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
        return (await new IdentityRepository(db).ReadCurrentIdentity(userId, id))!;
    }
    const owner = await actor(ownerId), reviewer = await actor(reviewerId);
    const content: CreateRequest = { typeId, formDefinitionVersionId: versionId, title: "Operational request", justification: "Needed for the team", priority: "HIGH", fields: { category: "OPERATIONS" } };
    const draft = await service.Mutate(owner, "create", null, content, randomUUID());
    const submitted = await service.Mutate(owner, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    return { owner, reviewer, typeId, policyId, submitted, slot: submitted.currentApprovers[0]!.slotId };
}
async function returned()
{
    const item = await pending();
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
    return { request: (await read.select().from(requests).where(eq(requests.id, id)))[0], revisions, cycles, stages, slots,
        items: revisions.length ? await read.select().from(requestItems).where(inArray(requestItems.revisionId, revisions.map((x) => x.id))).orderBy(requestItems.id) : [],
        votes: slots.length ? await read.select().from(approvalDecisions).where(inArray(approvalDecisions.slotId, slots.map((x) => x.id))).orderBy(approvalDecisions.id) : [],
        audit: await read.select().from(requestAuditEvents).where(eq(requestAuditEvents.requestId, id)).orderBy(requestAuditEvents.id),
        outbox: await read.select().from(requestOutboxEvents).where(sql`${requestOutboxEvents.payload}->>'requestId' = ${id}`).orderBy(requestOutboxEvents.id),
        keys: await read.select().from(idempotencyRecords).where(eq(idempotencyRecords.actorId, actorId)).orderBy(idempotencyRecords.scope, idempotencyRecords.key) };
}
function rendezvous()
{
    let arrivals = 0, release!: () => void;
    const ready = new Promise<void>((resolve) =>
{
 release = resolve;
});
    return async () =>
{
 if (++arrivals === 2) release(); await ready;
};
}

test("current actor blocks identity changes until the request transaction ends", async () =>
{
    const f = await returned(), before = await evidence(f.submitted.id, f.owner.account.id);
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) =>
{
 entered = resolve;
});
    const held = new Promise<void>((resolve) =>
{
 release = resolve;
});
    const holder = new RequestUnitOfWork(db).Run(async (repository) =>
    {
        await repository.CurrentActor(f.owner);
        entered();
        await held;
    });
    try
    {
        await ready;
        await expect(observer.connection.transaction(async (tx) =>
        {
            await tx.execute(sql`SET LOCAL lock_timeout = '250ms'`);
            await new IdentityRepository(tx).LockUser(f.owner.account.id);
        })).rejects.toMatchObject({ cause: { code: "55P03" } });
    }
    finally
{
 release(); await holder;
}
    await observer.connection.transaction(async (tx) =>
    {
        const identity = new IdentityRepository(tx);
        await identity.LockUser(f.owner.account.id);
        await identity.RevokeFamily(f.owner.family.id, new Date());
    });
    await expect(service.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: f.detail.version }, randomUUID())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await evidence(f.submitted.id, f.owner.account.id)).toEqual(before);
});

test.each(["disabled", "expired", "revoked", "authVersion", "no roles", "reviewer only"] as const)("resubmit revalidates cached owner: %s", async (change) =>
{
    const f = await returned(), before = await evidence(f.submitted.id, f.owner.account.id);
    if (change === "disabled") await db.update(users).set({ isActive: false }).where(eq(users.id, f.owner.account.id));
    if (change === "authVersion") await db.update(users).set({ authVersion: f.owner.account.authVersion + 1 }).where(eq(users.id, f.owner.account.id));
    if (change === "expired") await db.update(sessionFamilies).set({ expiresAt: sql`${sessionFamilies.createdAt} + interval '1 millisecond'` }).where(eq(sessionFamilies.id, f.owner.family.id));
    if (change === "revoked") await db.update(sessionFamilies).set({ revokedAt: new Date() }).where(eq(sessionFamilies.id, f.owner.family.id));
    if (change === "no roles" || change === "reviewer only") await db.delete(userRoles).where(eq(userRoles.userId, f.owner.account.id));
    if (change === "reviewer only") await db.insert(userRoles).values({ userId: f.owner.account.id, roleCode: "REVIEWER" });
    await expect(service.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: f.detail.version }, randomUUID())).rejects.toMatchObject({ code: change === "reviewer only" ? "FORBIDDEN" : "UNAUTHENTICATED" });
    expect(await evidence(f.submitted.id, f.owner.account.id)).toEqual(before);
});

test("RR-T-08a same key concurrently resubmits once and changed version conflicts", async () =>
{
    const f = await returned(), key = randomUUID(), body = { expectedVersion: f.detail.version }, barrier = rendezvous(), original = RequestRepository.prototype.CurrentActor;
    const spy = vi.spyOn(RequestRepository.prototype, "CurrentActor").mockImplementation(async function (this: RequestRepository, actor)
    {
        if (actor.account.id === f.owner.account.id) await barrier();
        return original.call(this, actor);
    });
    let a: Awaited<ReturnType<RequestService["Mutate"]>>, b: Awaited<ReturnType<RequestService["Mutate"]>>;
    try
    {
        [a, b] = await Promise.all([service.Mutate(f.owner, "resubmit", f.submitted.id, body, key), otherService.Mutate(f.owner, "resubmit", f.submitted.id, body, key)]);
    }
    finally
{
 spy.mockRestore();
}
    expect(a).toEqual(b);
    expect(await otherService.Mutate(f.owner, "resubmit", f.submitted.id, body, key)).toEqual(a);
    await expect(otherService.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: body.expectedVersion + 1 }, key)).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    const saved = await evidence(f.submitted.id, f.owner.account.id);
    expect(saved.cycles).toHaveLength(2);
    expect(saved.revisions).toHaveLength(2);
    expect(saved.audit.filter((x) => x.eventType === "REQUEST_RESUBMITTED")).toHaveLength(1);
    expect(saved.outbox.filter((x) => x.eventType === "REQUEST_RESUBMITTED")).toHaveLength(1);
});

test("RR-T-08a different keys at same version commit one resubmission", async () =>
{
    const f = await returned(), barrier = rendezvous(), original = RequestRepository.prototype.CurrentActor;
    const spy = vi.spyOn(RequestRepository.prototype, "CurrentActor").mockImplementation(async function (this: RequestRepository, actor)
    {
        if (actor.account.id === f.owner.account.id) await barrier();
        return original.call(this, actor);
    });
    try
    {
        const outcomes = await Promise.allSettled([service.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: f.detail.version }, randomUUID()), otherService.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: f.detail.version }, randomUUID())]);
        expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
        expect(outcomes.filter((x) => x.status === "rejected")).toHaveLength(1);
    }
    finally
{
 spy.mockRestore();
}
    const saved = await evidence(f.submitted.id, f.owner.account.id);
    expect(saved.cycles).toHaveLength(2);
    expect(saved.audit.filter((x) => x.eventType === "REQUEST_RESUBMITTED")).toHaveLength(1);
    expect(saved.outbox.filter((x) => x.eventType === "REQUEST_RESUBMITTED")).toHaveLength(1);
});

test("RR-T-08b PATCH versus resubmit commits one version without losing edits", async () =>
{
    const f = await returned(), barrier = rendezvous(), original = RequestRepository.prototype.CurrentActor;
    const spy = vi.spyOn(RequestRepository.prototype, "CurrentActor").mockImplementation(async function (this: RequestRepository, actor)
    {
        if (actor.account.id === f.owner.account.id) await barrier();
        return original.call(this, actor);
    });
    let outcomes: PromiseSettledResult<unknown>[];
    try
    {
        outcomes = await Promise.allSettled([service.Mutate(f.owner, "patch", f.submitted.id, { expectedVersion: f.detail.version, title: "Concurrent edit" }), otherService.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: f.detail.version }, randomUUID())]);
    }
    finally
{
 spy.mockRestore();
}
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    const detail = await service.Read(f.owner, f.submitted.id), saved = await evidence(f.submitted.id, f.owner.account.id);
    if (detail.status === "RETURNED")
    {
        expect(detail.title).toBe("Concurrent edit");
        expect(saved.cycles).toHaveLength(1);
    }
    else
    {
        expect(detail.status).toBe("PENDING");
        expect(detail.title).toBe(f.detail.title);
        expect(saved.cycles).toHaveLength(2);
    }
});

test.each(["APPROVE", "REJECT"] as const)("RR-T-08b RETURN versus %s records one decision", async (opponent) =>
{
    const f = await pending(), barrier = rendezvous(), original = RequestRepository.prototype.CurrentActor;
    const spy = vi.spyOn(RequestRepository.prototype, "CurrentActor").mockImplementation(async function (this: RequestRepository, actor)
    {
        if (actor.account.id === f.reviewer.account.id) await barrier();
        return original.call(this, actor);
    });
    try
    {
        const outcomes = await Promise.allSettled([decisions.Decide(f.reviewer, f.slot, { decision: "RETURN", reason: "Please revise", expectedVersion: 0 }, randomUUID()), otherDecisions.Decide(f.reviewer, f.slot, { decision: opponent, ...(opponent === "REJECT" ? { reason: "Cannot proceed" } : {}), expectedVersion: 0 }, randomUUID())]);
        expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
        expect(outcomes.find((x) => x.status === "rejected")).toMatchObject({ reason: { code: "APPROVAL_TASK_STALE" } });
    }
    finally
{
 spy.mockRestore();
}
    const saved = await evidence(f.submitted.id, f.owner.account.id);
    expect(saved.votes).toHaveLength(1);
    expect(saved.request?.status).toBe(saved.votes[0]!.decision === "RETURN" ? "RETURNED" : opponent === "APPROVE" ? "APPROVED" : "REJECTED");
});

test("RR-T-05/08b old task decision versus resubmit stays stale and accepted RETURN replays", async () =>
{
    const f = await returned(), barrier = rendezvous(), original = RequestRepository.prototype.CurrentActor;
    const spy = vi.spyOn(RequestRepository.prototype, "CurrentActor").mockImplementation(async function (this: RequestRepository, actor)
    {
        if ([f.owner.account.id, f.reviewer.account.id].includes(actor.account.id)) await barrier();
        return original.call(this, actor);
    });
    let submit: PromiseSettledResult<unknown>, old: PromiseSettledResult<unknown>;
    try
    {
        [submit, old] = await Promise.allSettled([service.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: f.detail.version }, randomUUID()), otherDecisions.Decide(f.reviewer, f.slot, { decision: "APPROVE", expectedVersion: 0 }, randomUUID())]);
    }
    finally
{
 spy.mockRestore();
}
    expect(submit.status).toBe("fulfilled");
    expect(old).toMatchObject({ status: "rejected", reason: { code: "APPROVAL_TASK_STALE" } });
    expect(await otherDecisions.Decide(f.reviewer, f.slot, { decision: "RETURN", reason: "Please revise", expectedVersion: 0 }, f.returnKey)).toEqual(f.result);
    const saved = await evidence(f.submitted.id, f.owner.account.id);
    expect(saved.cycles).toHaveLength(2);
    expect(saved.votes).toHaveLength(1);
});

test("RR-T-07b failure after completion rolls back all resubmit writes and same key retries", async () =>
{
    const f = await returned(), key = randomUUID(), before = await evidence(f.submitted.id, f.owner.account.id), original = RequestRepository.prototype.Complete;
    const spy = vi.spyOn(RequestRepository.prototype, "Complete").mockImplementationOnce(async function (this: RequestRepository, ...args)
    {
        await original.apply(this, args);
        throw new Error("injected after completion");
    });
    try
{
 await expect(service.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: f.detail.version }, key)).rejects.toThrow("injected after completion");
}
    finally
{
 spy.mockRestore();
}
    expect(await evidence(f.submitted.id, f.owner.account.id)).toEqual(before);
    expect((await service.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: f.detail.version }, key)).status).toBe("PENDING");
});


test("RR-T-07b database fault after cycle insertion rolls back and same key retries", async () =>
{
    const f = await returned(), key = randomUUID(), before = await evidence(f.submitted.id, f.owner.account.id);
    await db.execute(sql`CREATE FUNCTION issue7_fail_cycle() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected cycle fault'; END $$`);
    await db.execute(sql`CREATE TRIGGER issue7_fail_cycle AFTER INSERT ON approval_cycles FOR EACH ROW EXECUTE FUNCTION issue7_fail_cycle()`);
    try
{
 await expect(service.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: f.detail.version }, key)).rejects.toThrow();
}
    finally
    {
        await db.execute(sql`DROP TRIGGER IF EXISTS issue7_fail_cycle ON approval_cycles`);
        await db.execute(sql`DROP FUNCTION IF EXISTS issue7_fail_cycle()`);
    }
    expect(await evidence(f.submitted.id, f.owner.account.id)).toEqual(before);
    expect((await service.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: f.detail.version }, key)).status).toBe("PENDING");
});





test("RR-T-08b policy publication versus resubmit selects one complete policy boundary", async () =>
{
    const f = await returned(), adminId = randomUUID(), familyId = randomUUID();
    await db.insert(users).values({ id: adminId, email: `${adminId}@example.test`, displayName: "Administrator", passwordHash: "not-for-login" });
    await db.insert(userRoles).values({ userId: adminId, roleCode: "ADMINISTRATOR" });
    await db.insert(sessionFamilies).values({ id: familyId, userId: adminId, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
    const admin = (await new IdentityRepository(db).ReadCurrentIdentity(adminId, familyId))!;
    await db.update(approvalPolicyVersions).set({ isActive: false }).where(eq(approvalPolicyVersions.id, f.policyId));
    const config = new ConfigurationService(new ConfigurationUnitOfWork(observer.connection));
    const draft = await config.CreatePolicy(admin, { code: `P-${randomUUID()}`, typeId: f.typeId, departmentId: null, minAmount: null, maxAmount: null, priority: 1, stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 480 }] });
    const v1 = await config.PolicyAction(admin, draft.id, "publish", { expectedVersion: draft.version }, randomUUID());
    const branch = await config.PolicyAction(admin, draft.id, "branch", { expectedVersion: v1.version });
    const patched = await config.PolicyAction(admin, draft.id, "patch", { expectedVersion: branch.version, stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 240 }] });
    const barrier = rendezvous(), lock = ConfigurationRepository.prototype.Lock;
    const spy = vi.spyOn(ConfigurationRepository.prototype, "Lock").mockImplementation(async function (this: ConfigurationRepository, exclusive)
    {
        await barrier();
        return lock.call(this, exclusive);
    });
    const request = new RequestService({ Run: async (operation) =>
{
 await barrier(); return new RequestUnitOfWork(db).Run(operation);
} });
    let published: Awaited<ReturnType<ConfigurationService["PolicyAction"]>>, submitted: Awaited<ReturnType<RequestService["Mutate"]>>;
    try
    {
        [published, submitted] = await Promise.all([config.PolicyAction(admin, draft.id, "publish", { expectedVersion: patched.version }, randomUUID()), request.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: f.detail.version }, randomUUID())]);
    }
    finally
{
 spy.mockRestore();
}
    const saved = await evidence(f.submitted.id, f.owner.account.id);
    const cycle = saved.cycles.find((item) => item.id === submitted.currentCycleId)!;
    expect([v1.versionId, published.versionId]).toContain(cycle.policyVersionId);
    const snapshot = cycle.snapshot as { policy: { id: string; stages: Array<{ slaBusinessMinutes: number }> } };
    expect(snapshot.policy.id).toBe(cycle.policyVersionId);
    const sla = cycle.policyVersionId === v1.versionId ? 480 : 240;
    expect(snapshot.policy.stages[0]?.slaBusinessMinutes).toBe(sla);
    expect(saved.stages.find((stage) => stage.cycleId === cycle.id)?.slaBusinessMinutes).toBe(sla);
    expect(saved.cycles.filter((item) => item.isActive)).toHaveLength(1);
});


test("RR-T-08b type publication versus resubmit preserves the pinned version", async () =>
{
    const f = await returned(), adminId = randomUUID(), familyId = randomUUID();
    await db.insert(users).values({ id: adminId, email: `${adminId}@example.test`, displayName: "Administrator", passwordHash: "not-for-login" });
    await db.insert(userRoles).values({ userId: adminId, roleCode: "ADMINISTRATOR" });
    await db.insert(sessionFamilies).values({ id: familyId, userId: adminId, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
    const admin = (await new IdentityRepository(db).ReadCurrentIdentity(adminId, familyId))!;
    const types = new RequestTypeService(new RequestTypeUnitOfWork(observer.connection));
    const branch = await types.BranchDraft(admin, f.typeId, { expectedVersion: 0 });
    const barrier = rendezvous(), read = RequestTypeRepository.prototype.Read, configuration = RequestRepository.prototype.Configuration;
    const typeSpy = vi.spyOn(RequestTypeRepository.prototype, "Read").mockImplementation(async function (this: RequestTypeRepository, id, lock)
    {
        if (id === f.typeId && lock) await barrier();
        return read.call(this, id, lock);
    });
    const requestSpy = vi.spyOn(RequestRepository.prototype, "Configuration").mockImplementation(async function (this: RequestRepository, ...args)
    {
        if (args[0] === f.typeId) await barrier();
        return configuration.apply(this, args);
    });
    let published: Awaited<ReturnType<RequestTypeService["Publish"]>>, submitted: Awaited<ReturnType<RequestService["Mutate"]>>;
    try
    {
        [published, submitted] = await Promise.all([types.Publish(admin, f.typeId, { expectedVersion: branch.version }, randomUUID()), service.Mutate(f.owner, "resubmit", f.submitted.id, { expectedVersion: f.detail.version }, randomUUID())]);
    }
    finally
{
 typeSpy.mockRestore(); requestSpy.mockRestore();
}
    expect(published.versionId).not.toBe(f.detail.workingRevision!.formDefinitionVersionId);
    expect(submitted.submittedRevision?.formDefinitionVersionId).toBe(f.detail.workingRevision!.formDefinitionVersionId);
    const saved = await evidence(f.submitted.id, f.owner.account.id);
    expect(saved.cycles).toHaveLength(2);
    expect(saved.revisions.find((revision) => revision.id === submitted.submittedRevision?.id)?.formDefinitionVersionId).toBe(f.detail.workingRevision!.formDefinitionVersionId);
});
