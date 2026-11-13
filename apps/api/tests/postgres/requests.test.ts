import { randomUUID } from "node:crypto";
import { afterAll, expect, test, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { requestDetailSchema, requestSummarySchema, requestTypeSearchSchema, type CreateRequest, type PublishedRequestType, type UserRole } from "@workflow/contracts";
import { createTestDatabase } from "../helpers/testDatabase";
import { RequestService } from "../../src/Applications/Requests/RequestService";
import { ApprovalTaskService } from "../../src/Applications/Approvals/ApprovalTaskService";
import { ApprovalTaskUnitOfWork } from "../../src/Infrastructures/Database/Repositories/ApprovalTaskRepository";
import { approvalTaskSearchSchema } from "@workflow/contracts";
import { RequestRepository, RequestUnitOfWork } from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { approvalCycles, approvalPolicyVersions, approvalSlots, approvalStages, budgetPolicies, departmentMemberships, departments, idempotencyRecords, requestAuditEvents, requestOutboxEvents, requestRevisions, requests, requestTypes, requestTypeVersions, reviewerAssignmentRules, sessionFamilies, userRoles, users } from "../../src/Infrastructures/Database/schema";
import { IdentityRepository } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import { seededDefinition } from "../../src/Infrastructures/Database/seedRequests";
import { createIdentityComposition } from "../../src/Presentations/composition";
import { readEnvironment } from "../../src/Infrastructures/Configuration/environment";
import { createApplication } from "../../src/Presentations/createApplication";
import { expectHttpError } from "../helpers/identityHttp";
import type { IRequestRepository, IRequestUnitOfWork } from "../../src/Domains/Requests/Ports";
import type { IStageDefinition } from "../../src/Domains/Requests/RequestRules";
import type { IActor } from "../../src/Domains/Identity/Identity";

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
async function counts(id: string)
{
    return {
        cycles: (await observer.connection.select().from(approvalCycles).where(eq(approvalCycles.requestId, id))).length,
        revisions: (await observer.connection.select().from(requestRevisions).where(eq(requestRevisions.requestId, id))).length,
        audit: (await observer.connection.select().from(requestAuditEvents).where(eq(requestAuditEvents.requestId, id))).length,
    };
}
// PostgreSQL uuid ordering is byte-wise; lowercase hexadecimal text order matches it exactly.
const compareIds = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;
interface ISeededSlot { id: string; requestId: string; requestNumber: string; stageNumber: 1 | 2; dueAt: Date | null; }
async function reviewerActor(reviewerId: string): Promise<IActor>
{
    const familyId = randomUUID();
    await db.insert(sessionFamilies).values({ id: familyId, userId: reviewerId, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
    return (await new IdentityRepository(db).ReadCurrentIdentity(reviewerId, familyId))!;
}
async function newReviewer(roles: UserRole[] = ["REVIEWER"])
{
    const id = randomUUID();
    await db.insert(users).values({ id, email: `${id}@example.test`, displayName: `Seed ${id.slice(0, 8)}`, passwordHash: "not-for-login" });
    if (roles.length) await db.insert(userRoles).values(roles.map((roleCode) => ({ userId: id, roleCode })));
    return { id, actor: await reviewerActor(id) };
}
async function parallelSubmission()
{
    const stages: IStageDefinition[] = [{ stageNumber: 1, reviewerAssignmentKeys: ["review", "parallel"], slaBusinessMinutes: 480 }];
    const owner = await fixture(false, false, stages);
    const peer = await fixture();
    const parallelId = randomUUID();
    await db.insert(reviewerAssignmentRules).values({ id: parallelId, assignmentKey: "parallel", departmentId: owner.departmentId, reviewerId: peer.reviewerId });
    const first = await reviewerActor(owner.reviewerId);
    const second = await reviewerActor(peer.reviewerId);
    const draft = await owner.draft();
    const submitted = await service.Mutate(owner.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    const query = approvalTaskSearchSchema.parse({ search: [{ name: "requestNumber", condition: "EQUAL", value: submitted.requestNumber }] });
    return { owner, peer, parallelId, first, second, draft, submitted, query };
}
// Synthetic queue rows satisfy the existing foreign keys; the service under test still performs the search.
async function seedQueueRequest(ownerId: string, template: { typeId: string; versionId: string; policyId: string }, requestNumber: string, stageNumber: 1 | 2, slots: { reviewerId: string; dueAt: Date | null }[])
{
    const requestId = randomUUID(), revisionId = randomUUID(), cycleId = randomUUID(), stageId = randomUUID();
    await db.insert(requests).values({ id: requestId, requesterId: ownerId, typeId: template.typeId, title: requestNumber, justification: "Seeded queue fixture", priority: "MEDIUM", status: "PENDING", version: 1, requestNumber, submittedAt: new Date() });
    await db.insert(requestRevisions).values({ id: revisionId, requestId, typeId: template.typeId, formDefinitionVersionId: template.versionId, revisionNumber: 1, fields: {}, submittedAt: new Date(), submittedBy: ownerId });
    await db.insert(approvalCycles).values({ id: cycleId, requestId, revisionId, policyVersionId: template.policyId, snapshot: {}, isActive: true });
    await db.insert(approvalStages).values({ id: stageId, cycleId, stageNumber, status: "ACTIVE", slaBusinessMinutes: 480 });
    const seeded: ISeededSlot[] = slots.map((slot) => ({ id: randomUUID(), requestId, requestNumber, stageNumber, dueAt: slot.dueAt }));
    await db.insert(approvalSlots).values(seeded.map((slot, index) => ({ id: slot.id, stageId, assignmentKey: `seed-${index}`, reviewerId: slots[index]!.reviewerId, status: "ACTIONABLE" as const, dueAt: slot.dueAt })));
    await db.update(requests).set({ submittedRevisionId: revisionId, currentCycleId: cycleId }).where(eq(requests.id, requestId));
    return { requestId, slots: seeded };
}
test("REV-PG-01 persists one active parallel stage and each reviewer sees only their slot", async () =>
{
    const item = await parallelSubmission();
    const cycles = await observer.connection.select().from(approvalCycles).where(eq(approvalCycles.requestId, item.draft.id));
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({ id: item.submitted.currentCycleId, revisionId: item.submitted.submittedRevision!.id, policyVersionId: item.owner.policyId, isActive: true, snapshot: {
        policy: { id: item.owner.policyId, stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review", "parallel"], slaBusinessMinutes: 480 }] },
        department: { id: item.owner.departmentId },
        assignments: [{ id: item.owner.assignmentId, assignmentKey: "review", departmentId: item.owner.departmentId, reviewerId: item.owner.reviewerId }, { id: item.parallelId, assignmentKey: "parallel", departmentId: item.owner.departmentId, reviewerId: item.peer.reviewerId }],
        title: item.owner.content.title, justification: item.owner.content.justification, priority: item.owner.content.priority,
    } });
    const revisions = await observer.connection.select().from(requestRevisions).where(eq(requestRevisions.requestId, item.draft.id));
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ id: item.submitted.submittedRevision!.id, formDefinitionVersionId: item.owner.versionId, fields: item.owner.content.fields, submittedBy: item.owner.ownerId, submittedAt: expect.any(Date) });
    const stages = await observer.connection.select().from(approvalStages).where(eq(approvalStages.cycleId, cycles[0]!.id));
    expect(stages).toHaveLength(1);
    expect(stages[0]).toMatchObject({ stageNumber: 1, status: "ACTIVE", slaBusinessMinutes: 480 });
    const slots = await observer.connection.select().from(approvalSlots).where(eq(approvalSlots.stageId, stages[0]!.id));
    expect(slots).toHaveLength(2);
    expect(slots).toEqual(expect.arrayContaining([expect.objectContaining({ assignmentKey: "review", reviewerId: item.owner.reviewerId, status: "ACTIONABLE" }), expect.objectContaining({ assignmentKey: "parallel", reviewerId: item.peer.reviewerId, status: "ACTIONABLE" })]));
    const tasks = new ApprovalTaskService(new ApprovalTaskUnitOfWork(db));
    for (const [actor, reviewerId] of [[item.first, item.owner.reviewerId], [item.second, item.peer.reviewerId]] as const)
    {
        const result = await tasks.Search(actor, item.query);
        expect(result.pagination.totalCount).toBe(1);
        expect(result.items.map((slot) => slot.id)).toEqual([slots.find((slot) => slot.reviewerId === reviewerId)!.id]);
    }
});
test("REV-PG-01 snapshots a two-stage policy with parallel slots and queues only the active stage", async () =>
{
    const stages: IStageDefinition[] = [
        { stageNumber: 1, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 480 },
        { stageNumber: 2, reviewerAssignmentKeys: ["review", "parallel"], slaBusinessMinutes: 960 },
    ];
    const a = await fixture(false, false, stages);
    const b = await fixture();
    await db.insert(reviewerAssignmentRules).values({ id: randomUUID(), assignmentKey: "parallel", departmentId: a.departmentId, reviewerId: b.reviewerId });
    const familyA = randomUUID(), familyB = randomUUID();
    await db.insert(sessionFamilies).values([[familyA, a.reviewerId], [familyB, b.reviewerId]].map(([id, userId]) => ({ id: id!, userId: userId!, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) })));
    const identity = new IdentityRepository(db);
    const reviewerA = (await identity.ReadCurrentIdentity(a.reviewerId, familyA))!;
    const reviewerB = (await identity.ReadCurrentIdentity(b.reviewerId, familyB))!;
    const draft = await a.draft();
    const submitted = await service.Mutate(a.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    const cycles = await observer.connection.select().from(approvalCycles).where(eq(approvalCycles.requestId, draft.id));
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toMatchObject({ id: submitted.currentCycleId, revisionId: submitted.submittedRevision!.id, policyVersionId: a.policyId, isActive: true, snapshot: {
        policy: { id: a.policyId, stages }, department: { id: a.departmentId },
        assignments: [{ assignmentKey: "review", departmentId: a.departmentId, reviewerId: a.reviewerId }, { assignmentKey: "review", departmentId: a.departmentId, reviewerId: a.reviewerId }, { assignmentKey: "parallel", departmentId: a.departmentId, reviewerId: b.reviewerId }],
    } });
    const revisions = await observer.connection.select().from(requestRevisions).where(eq(requestRevisions.requestId, draft.id));
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({ id: submitted.submittedRevision!.id, submittedBy: a.ownerId, formDefinitionVersionId: a.versionId, fields: a.content.fields, submittedAt: expect.any(Date) });
    const savedStages = await observer.connection.select().from(approvalStages).where(eq(approvalStages.cycleId, submitted.currentCycleId!));
    expect(savedStages.sort((left, right) => left.stageNumber - right.stageNumber)).toMatchObject([
        { stageNumber: 1, status: "ACTIVE", slaBusinessMinutes: 480 },
        { stageNumber: 2, status: "WAITING", slaBusinessMinutes: 960 },
    ]);
    expect(savedStages).toHaveLength(2);
    const slots = await observer.connection.select().from(approvalSlots).innerJoin(approvalStages, eq(approvalSlots.stageId, approvalStages.id)).where(eq(approvalStages.cycleId, submitted.currentCycleId!));
    expect(slots).toHaveLength(3);
    expect(slots.map(({ approval_slots: slot, approval_stages: stage }) => ({ stageNumber: stage.stageNumber, assignmentKey: slot.assignmentKey, reviewerId: slot.reviewerId, status: slot.status }))).toEqual(expect.arrayContaining([
        { stageNumber: 1, assignmentKey: "review", reviewerId: a.reviewerId, status: "ACTIONABLE" },
        { stageNumber: 2, assignmentKey: "review", reviewerId: a.reviewerId, status: "WAITING" },
        { stageNumber: 2, assignmentKey: "parallel", reviewerId: b.reviewerId, status: "WAITING" },
    ]));
    const activeSlot = slots.find(({ approval_stages: stage }) => stage.stageNumber === 1)!.approval_slots;
    const waitingSlot = slots.find(({ approval_slots: slot, approval_stages: stage }) => stage.stageNumber === 2 && slot.reviewerId === a.reviewerId)!.approval_slots;
    const tasks = new ApprovalTaskService(new ApprovalTaskUnitOfWork(db));
    const query = approvalTaskSearchSchema.parse({ search: [{ name: "requestNumber", condition: "EQUAL", value: submitted.requestNumber }] });
    const resultA = await tasks.Search(reviewerA, query);
    const resultB = await tasks.Search(reviewerB, query);
    expect(resultA.pagination.totalCount).toBe(1);
    expect(resultA.items.map((item) => item.id)).toEqual([activeSlot.id]);
    expect(resultB.pagination.totalCount).toBe(0);
    expect(resultB.items).toEqual([]);
    await expect(tasks.Read(reviewerA, waitingSlot.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
test("REV-PG-04 paginates, sorts and filters isolated queue rows", async () =>
{
    const template = await fixture();
    const reviewer = await newReviewer();
    const now = new Date();
    const requestNumbers = [`A%literal${reviewer.id}`, `B_literal${reviewer.id}`, `Bxliteral${reviewer.id}`, `Axliteral${reviewer.id}`];
    const tasks = new ApprovalTaskService(new ApprovalTaskUnitOfWork(db));
    const search = (query: unknown = {}) => tasks.Search(reviewer.actor, approvalTaskSearchSchema.parse(query));
    const all: ISeededSlot[] = [];
    const assertPage = async (pageNumber: number, pageSize: number, expected: ISeededSlot[]) =>
    {
        const result = await search({ pageNumber, pageSize });
        const totalPages = Math.ceil(expected.length / pageSize);
        expect(result.pagination).toEqual({ currentPage: pageNumber, pageSize, totalPages, totalCount: expected.length, hasPrevious: pageNumber > 1, hasNext: pageNumber < totalPages });
        expect(result.items.map((slot) => slot.id)).toEqual(expected.slice((pageNumber - 1) * pageSize, pageNumber * pageSize).map((slot) => slot.id));
        return result.items.map((slot) => slot.id);
    };
    const sortDue = (rows: ISeededSlot[]) => [...rows].sort((a, b) => a.dueAt === null ? b.dueAt === null ? compareIds(a.id, b.id) : 1 : b.dueAt === null ? -1 : a.dueAt.getTime() - b.dueAt.getTime() || compareIds(a.id, b.id));
    await assertPage(1, 20, []);
    for (const [index, count] of [1, 22, 22, 56].entries())
    {
        const dueAt = index === 3 ? null : new Date(now.getTime() + [-60000, 60000, 0][index]!);
        const seeded = await seedQueueRequest(template.ownerId, template, requestNumbers[index]!, index % 2 === 0 ? 1 : 2, Array.from({ length: count }, () => ({ reviewerId: reviewer.id, dueAt })));
        all.push(...seeded.slots);
        const expected = sortDue(all);
        if (all.length === 1) await assertPage(1, 20, expected);
        if (all.length === 45 || all.length === 101)
        {
            const ids: string[] = [];
            for (let page = 1; page <= Math.ceil(all.length / 20); page++) ids.push(...await assertPage(page, 20, expected));
            expect(new Set(ids).size).toBe(all.length);
            await assertPage(Math.ceil(all.length / 20) + 1, 20, expected);
        }
    }
    await assertPage(1, 100, sortDue(all));
    await assertPage(2, 100, sortDue(all));
    for (const field of ["dueAt", "stageNumber", "requestNumber"] as const)
    {
        for (const direction of ["asc", "desc"] as const)
        {
            const expected = [...all].sort((a, b) =>
            {
                const left = a[field], right = b[field];
                if (left === null || right === null) return left === right ? compareIds(a.id, b.id) : left === null ? 1 : -1;
                const comparison = left < right ? -1 : left > right ? 1 : 0;
                return (direction === "asc" ? comparison : -comparison) || compareIds(a.id, b.id);
            });
            for (const pageNumber of [1, 2])
            {
                const result = await search({ pageNumber, pageSize: 100, orderBy: `${field} ${direction}` });
                expect(result.items.map((slot) => slot.id)).toEqual(expected.slice((pageNumber - 1) * 100, pageNumber * 100).map((slot) => slot.id));
                expect(result.pagination).toEqual({ currentPage: pageNumber, pageSize: 100, totalPages: 2, totalCount: 101, hasPrevious: pageNumber > 1, hasNext: pageNumber < 2 });
            }
        }
    }
    for (const stageNumber of [1, 2] as const)
    {
        const result = await search({ pageSize: 100, search: [{ name: "stageNumber", condition: "EQUAL", value: stageNumber }] });
        expect(result.items.map((slot) => slot.id)).toEqual(sortDue(all.filter((slot) => slot.stageNumber === stageNumber)).map((slot) => slot.id));
    }
    vi.setSystemTime(now);
    try
    {
        for (const overdue of [true, false])
        {
            const expected = sortDue(all.filter((slot) => overdue === (slot.dueAt !== null && slot.dueAt.getTime() <= now.getTime())));
            const result = await search({ pageSize: 100, search: [{ name: "overdue", condition: "EQUAL", value: overdue }] });
            expect(result.items.map((slot) => slot.id)).toEqual(expected.map((slot) => slot.id));
            expect(result.pagination.totalCount).toBe(overdue ? 23 : 78);
        }
    }
    finally
    {
        vi.useRealTimers();
    }
    for (const [value, condition, expectedNumber] of [["%", "CONTAINS", requestNumbers[0]!], ["B_", "STARTWITH", requestNumbers[1]!], [requestNumbers[0]!.toUpperCase().replace("A%", "a%"), "EQUAL", requestNumbers[0]!]] as const)
    {
        const result = await search({ pageSize: 100, search: [{ name: "requestNumber", condition, value }] });
        const expected = sortDue(all.filter((slot) => slot.requestNumber === expectedNumber));
        expect(result.items.map((slot) => slot.id)).toEqual(expected.map((slot) => slot.id));
        expect(result.pagination.totalCount).toBe(expected.length);
    }
    for (const name of ["requestNumber", "title", "requestNumber,title"] as const)
    {
        for (const [value, expectedNumber] of [["%", requestNumbers[0]!], ["_", requestNumbers[1]!]] as const)
        {
            const result = await search({ pageSize: 100, searchTerm: { name, value } });
            const expected = sortDue(all.filter((slot) => slot.requestNumber === expectedNumber));
            expect(result.items.map((slot) => slot.id)).toEqual(expected.map((slot) => slot.id));
            expect(result.pagination.totalCount).toBe(expected.length);
        }
    }
});
test("REV-PG-03 excludes inactive, stale and terminal tasks and disabled identities", async () =>
{
    const item = await parallelSubmission();
    const tasks = new ApprovalTaskService(new ApprovalTaskUnitOfWork(db));
    const first = await tasks.Search(item.first, item.query);
    const second = await tasks.Search(item.second, item.query);
    expect(first.pagination.totalCount).toBe(1);
    expect(second.pagination.totalCount).toBe(1);
    expect(first.items[0]!.id).not.toBe(second.items[0]!.id);
    await expect(tasks.Read(item.first, second.items[0]!.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const slotId = first.items[0]!.id;
    const assertHidden = async () =>
    {
        const result = await tasks.Search(item.first, item.query);
        expect(result.items).toEqual([]);
        expect(result.pagination.totalCount).toBe(0);
        await expect(tasks.Read(item.first, slotId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    };
    await db.update(approvalCycles).set({ isActive: false }).where(eq(approvalCycles.id, item.submitted.currentCycleId!));
    await assertHidden();
    await db.update(approvalCycles).set({ isActive: true }).where(eq(approvalCycles.id, item.submitted.currentCycleId!));
    await db.update(requests).set({ currentCycleId: null }).where(eq(requests.id, item.draft.id));
    await assertHidden();
    await db.update(requests).set({ currentCycleId: item.submitted.currentCycleId, status: "APPROVED" }).where(eq(requests.id, item.draft.id));
    await assertHidden();
    expect((await tasks.Search(item.second, item.query)).items).toEqual([]);
    const separate = await parallelSubmission();
    const visible = await tasks.Search(separate.first, separate.query);
    expect(visible.pagination.totalCount).toBe(1);
    expect((await tasks.Read(separate.first, visible.items[0]!.id)).id).toBe(visible.items[0]!.id);
    await db.update(users).set({ isActive: false }).where(eq(users.id, separate.owner.reviewerId));
    await expect(tasks.Search(separate.first, separate.query)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(tasks.Read(separate.first, visible.items[0]!.id)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});
test("REV-PG-05 committed assignment and role changes govern cached actors", async () =>
{
    const item = await parallelSubmission();
    const replacement = await newReviewer(["REQUESTER", "REVIEWER"]);
    const tasks = new ApprovalTaskService(new ApprovalTaskUnitOfWork(db));
    const first = await tasks.Search(item.first, item.query);
    const slotId = first.items[0]!.id;
    expect(first.pagination.totalCount).toBe(1);
    await observer.connection.transaction(async (tx) =>
    {
        await tx.update(approvalSlots).set({ reviewerId: replacement.id }).where(eq(approvalSlots.id, slotId));
        const before = await tasks.Search(item.first, item.query);
        expect(before.items.map((slot) => slot.id)).toEqual([slotId]);
        expect(before.pagination.totalCount).toBe(1);
    });
    const removed = await tasks.Search(item.first, item.query);
    expect(removed.items).toEqual([]);
    expect(removed.pagination.totalCount).toBe(0);
    await expect(tasks.Read(item.first, slotId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const assigned = await tasks.Search(replacement.actor, item.query);
    expect(assigned.items.map((slot) => slot.id)).toEqual([slotId]);
    expect(assigned.pagination.totalCount).toBe(1);
    expect((await tasks.Read(replacement.actor, slotId)).id).toBe(slotId);
    const saved = (await observer.connection.select().from(approvalSlots).where(eq(approvalSlots.id, slotId)))[0];
    await observer.connection.transaction(async (tx) =>
    {
        await tx.delete(userRoles).where(and(eq(userRoles.userId, replacement.id), eq(userRoles.roleCode, "REVIEWER")));
        const before = await tasks.Search(replacement.actor, item.query);
        expect(before.items.map((slot) => slot.id)).toEqual([slotId]);
        expect(before.pagination.totalCount).toBe(1);
        expect((await tasks.Read(replacement.actor, slotId)).id).toBe(slotId);
    });
    await expect(tasks.Search(replacement.actor, item.query)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(tasks.Read(replacement.actor, slotId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await tasks.Search(item.first, item.query)).items).toEqual([]);
    await expect(tasks.Read(item.first, slotId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await observer.connection.select().from(approvalSlots).where(eq(approvalSlots.id, slotId)))[0]).toEqual(saved);
});
test("reviewer queue scopes rows and detail to the current assignment", async () =>
{
    const item = await fixture();
    const familyId = randomUUID();
    await db.insert(sessionFamilies).values({ id: familyId, userId: item.reviewerId, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
    const reviewer = (await new IdentityRepository(db).ReadCurrentIdentity(item.reviewerId, familyId))!;
    const draft = await item.draft();
    const submitted = await service.Mutate(item.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    const tasks = new ApprovalTaskService(new ApprovalTaskUnitOfWork(db));
    const query = approvalTaskSearchSchema.parse({ search: [{ name: "requestNumber", condition: "EQUAL", value: submitted.requestNumber }] });
    const result = await tasks.Search(reviewer, query);
    expect(result.pagination.totalCount).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(await tasks.Read(reviewer, result.items[0]!.id)).toEqual(result.items[0]);
    await expect(tasks.Read(reviewer, randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.update(approvalSlots).set({ status: "WAITING" }).where(eq(approvalSlots.id, result.items[0]!.id));
    expect((await tasks.Search(reviewer, query)).pagination.totalCount).toBe(0);
    await expect(tasks.Read(reviewer, result.items[0]!.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
test("reviewer task HTTP enforces assignment, validation, pagination and due-date filters", async () =>
{
    const item = await fixture();
    const other = await fixture();
    const adminId = randomUUID();
    const reviewerFamily = randomUUID(), otherFamily = randomUUID(), adminFamily = randomUUID();
    await db.insert(users).values({ id: adminId, email: `${adminId}@example.test`, displayName: "Admin", passwordHash: "not-for-login" });
    await db.insert(userRoles).values({ userId: adminId, roleCode: "ADMINISTRATOR" });
    await db.insert(sessionFamilies).values([[reviewerFamily, item.reviewerId], [otherFamily, other.reviewerId], [adminFamily, adminId]].map(([id, userId]) => ({ id: id!, userId: userId!, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) })));
    const draft = await item.draft();
    const submitted = await service.Mutate(item.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    const slot = (await db.select().from(approvalSlots).innerJoin(approvalStages, eq(approvalSlots.stageId, approvalStages.id)).where(eq(approvalStages.cycleId, submitted.currentCycleId!)))[0]!.approval_slots;
    await db.update(approvalSlots).set({ dueAt: null }).where(eq(approvalSlots.id, slot.id));
    const env = readEnvironment({ NODE_ENV: "test", DATABASE_URL: process.env.TEST_DATABASE_URL, AUTH_JWT_SECRET: "request-http-test-only-secret-32-bytes-long", AUTH_JWT_ISSUER: "request-http-tests", AUTH_JWT_AUDIENCE: "request-http-tests-api", AUTH_ALLOWED_ORIGINS: "http://localhost:3000", AUTH_COOKIE_SECURE: "false" });
    const identity = await createIdentityComposition(env, database);
    const TokenProvider = (await import("../../src/Infrastructures/Security/TokenProvider")).TokenProvider;
    const provider = new TokenProvider(env.AUTH_JWT_SECRET, { Now: () => new Date() }, env.AUTH_JWT_ISSUER, env.AUTH_JWT_AUDIENCE);
    const reviewerToken = await provider.Sign(item.reviewerId, reviewerFamily, 0);
    const otherToken = await provider.Sign(other.reviewerId, otherFamily, 0);
    const adminToken = await provider.Sign(adminId, adminFamily, 0);
    const ownerToken = await provider.Sign(item.ownerId, item.actor.family.id, 0);
    const app = createApplication(undefined, identity, service, new ApprovalTaskService(new ApprovalTaskUnitOfWork(db)));
    const requestId = randomUUID();
    const send = (method: string, path: string, body?: string, token = reviewerToken) => app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers: { authorization: token ? `Bearer ${token}` : "", "content-type": "application/json", origin: "http://localhost:3000", "x-request-id": requestId }, ...(body === undefined ? {} : { body }) }));
    const filter = { name: "requestNumber", condition: "EQUAL", value: submitted.requestNumber };
    const search = (filters: object[], token = reviewerToken) => send("POST", "/approval-tasks/search", JSON.stringify({ pageSize: 1, search: [filter, ...filters] }), token);
    const response = await search([]);
    expect(response.status).toBe(200);
    const expected = { id: slot.id, slotId: slot.id, requestId: draft.id, cycleId: submitted.currentCycleId, revisionId: submitted.submittedRevision!.id, stageNumber: 1, assignedReviewer: { id: item.reviewerId, displayName: "Reviewer" }, status: "ACTIONABLE", dueAt: null, canCurrentUserDecide: true, version: slot.version };
    expect(await response.json()).toEqual([expected]);
    expect(JSON.parse(response.headers.get("x-pagination")!)).toEqual({ currentPage: 1, pageSize: 1, totalPages: 1, totalCount: 1, hasPrevious: false, hasNext: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
    const beyond = await send("POST", "/approval-tasks/search", JSON.stringify({ pageNumber: 2, pageSize: 1, search: [filter] }));
    expect(beyond.status).toBe(200);
    expect(await beyond.json()).toEqual([]);
    expect(beyond.headers.get("cache-control")).toBe("no-store");
    expect(JSON.parse(beyond.headers.get("x-pagination")!)).toEqual({ currentPage: 2, pageSize: 1, totalPages: 1, totalCount: 1, hasPrevious: true, hasNext: false });
    expect(response.headers.get("access-control-expose-headers")?.toLowerCase()).toContain("x-pagination");
    const detail = await send("GET", `/approval-tasks/${slot.id}`);
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual(expected);
    const foreign = await search([], otherToken);
    expect(await foreign.json()).toEqual([]);
    expect(JSON.parse(foreign.headers.get("x-pagination")!)).toEqual({ currentPage: 1, pageSize: 1, totalPages: 0, totalCount: 0, hasPrevious: false, hasNext: false });
    const hidden = await Promise.all([send("GET", `/approval-tasks/${slot.id}`, undefined, otherToken), send("GET", `/approval-tasks/${randomUUID()}`), send("GET", "/approval-tasks/invalid"), send("GET", `/approval-tasks/${slot.id}`, undefined, adminToken), send("GET", `/approval-tasks/${slot.id}`, undefined, ownerToken)]);
    expect(hidden.map((entry) => entry.status)).toEqual([404, 404, 404, 404, 404]);
    const hiddenBodies = await Promise.all(hidden.map((entry) => entry.json()));
    expect(hiddenBodies).toEqual(Array(5).fill(hiddenBodies[0]));
    expect(hiddenBodies[0]).toMatchObject({ code: "NOT_FOUND", requestId });
    expect((await send("GET", `/approval-tasks/${slot.id}`, undefined, "")).status).toBe(401);
    expect((await send("POST", "/approval-tasks/search", "{}", "")).status).toBe(401);
    expect((await send("POST", "/approval-tasks/search", "{}", adminToken)).status).toBe(403);
    expect((await send("POST", "/approval-tasks/search", "{}", ownerToken)).status).toBe(403);
    expect((await send("POST", "/approval-tasks/search", JSON.stringify({ actorId: item.reviewerId }))).status).toBe(422);
    expect((await send("POST", "/approval-tasks/search", JSON.stringify({ orderBy: "id desc" }))).status).toBe(422);
    expect((await send("POST", "/approval-tasks/search", "{")).status).toBe(400);
    expect(await (await search([{ name: "dueAt", condition: "ISNULL" }])).json()).toEqual([expected]);
    expect(await (await search([{ name: "dueAt", condition: "ISNOTNULL" }])).json()).toEqual([]);
    await db.update(approvalSlots).set({ dueAt: new Date("2026-11-07T12:00:00Z") }).where(eq(approvalSlots.id, slot.id));
    expect(await (await search([{ name: "dueAt", condition: "ISNULL" }])).json()).toEqual([]);
    expect(await (await search([{ name: "dueAt", condition: "ISNOTNULL" }])).json()).toHaveLength(1);
    for (const condition of ["GREATER", "GREATEROREQUAL"])
        expect(await (await search([{ name: "dueAt", condition, value: "2026-11-07T11:00:00Z" }])).json()).toHaveLength(1);
    for (const condition of ["LESSER", "LESSEROREQUAL"])
        expect(await (await search([{ name: "dueAt", condition, value: "2026-11-07T13:00:00Z" }])).json()).toHaveLength(1);
    const preflight = await app.handle(new Request("http://localhost/api/v1/approval-tasks/search", { method: "OPTIONS", headers: { origin: "http://localhost:3000", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" } }));
    expect(preflight.status).toBe(204);
});
test.each(["wrong-role", "unresolved", "empty", "stage-two"] as const)("REV-PG-02 HTTP rejects %s configuration atomically", async (condition) =>
{
    const stages: IStageDefinition[] = [{ stageNumber: condition === "stage-two" ? 2 : 1, reviewerAssignmentKeys: condition === "empty" ? [] : [condition === "unresolved" ? "missing" : "review"], slaBusinessMinutes: 480 }];
    const item = await fixture(false, false, stages);
    if (condition === "wrong-role") await db.delete(userRoles).where(eq(userRoles.userId, item.reviewerId));
    const draft = await item.draft();
    const persisted = async () => ({
        request: await observer.connection.select().from(requests).where(eq(requests.id, draft.id)),
        revisions: await observer.connection.select().from(requestRevisions).where(eq(requestRevisions.requestId, draft.id)),
        audit: await observer.connection.select().from(requestAuditEvents).where(eq(requestAuditEvents.requestId, draft.id)),
    });
    const before = await persisted();
    const env = readEnvironment({ NODE_ENV: "test", DATABASE_URL: process.env.TEST_DATABASE_URL, AUTH_JWT_SECRET: "request-http-test-only-secret-32-bytes-long", AUTH_JWT_ISSUER: "request-http-tests", AUTH_JWT_AUDIENCE: "request-http-tests-api", AUTH_ALLOWED_ORIGINS: "http://localhost:3000", AUTH_COOKIE_SECURE: "false" });
    const identity = await createIdentityComposition(env, database);
    const TokenProvider = (await import("../../src/Infrastructures/Security/TokenProvider")).TokenProvider;
    const token = await new TokenProvider(env.AUTH_JWT_SECRET, { Now: () => new Date() }, env.AUTH_JWT_ISSUER, env.AUTH_JWT_AUDIENCE).Sign(item.ownerId, item.actor.family.id, 0);
    const app = createApplication(undefined, identity, service);
    const response = await app.handle(new Request(`http://localhost/api/v1/requests/${draft.id}/submit`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "Idempotency-Key": randomUUID() }, body: JSON.stringify({ expectedVersion: 0 }) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "CONFIGURATION_INCOMPLETE" });
    expect(await persisted()).toEqual(before);
    expect(before.request[0]).toMatchObject({ status: "DRAFT", version: 0, requestNumber: null, submittedRevisionId: null, currentCycleId: null });
    expect(before.revisions).toHaveLength(1);
    expect(before.revisions[0]).toMatchObject({ submittedAt: null, submittedBy: null });
    expect(await observer.connection.select().from(approvalCycles).where(eq(approvalCycles.requestId, draft.id))).toEqual([]);
    expect(await observer.connection.select().from(approvalStages).innerJoin(approvalCycles, eq(approvalStages.cycleId, approvalCycles.id)).where(eq(approvalCycles.requestId, draft.id))).toEqual([]);
    expect(await observer.connection.select().from(approvalSlots).innerJoin(approvalStages, eq(approvalSlots.stageId, approvalStages.id)).innerJoin(approvalCycles, eq(approvalStages.cycleId, approvalCycles.id)).where(eq(approvalCycles.requestId, draft.id))).toEqual([]);
    expect(await observer.connection.select().from(requestOutboxEvents).where(sql`${requestOutboxEvents.payload}->>'requestId' = ${draft.id}`)).toEqual([]);
});
test("self-only assignment rejects submission without creating a cycle", async () =>
{
    const item = await fixture();
    await db.insert(userRoles).values({ userId: item.ownerId, roleCode: "REVIEWER" });
    await db.update(reviewerAssignmentRules).set({ reviewerId: item.ownerId }).where(eq(reviewerAssignmentRules.id, item.assignmentId));
    const draft = await item.draft();
    await expect(service.Mutate(item.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID())).rejects.toMatchObject({ code: "CONFIGURATION_INCOMPLETE" });
    expect(await counts(draft.id)).toEqual({ cycles: 0, revisions: 1, audit: 1 });
    expect((await db.select().from(requests).where(eq(requests.id, draft.id)))[0]!.status).toBe("DRAFT");
});
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
    expect(await restarted.Read(item.actor, draft.id)).toEqual(submitted);
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
        const definition = await service.Type(item.actor, item.typeId);
        await db.insert(requestTypeVersions).values({ id: versionId, typeId: item.typeId, versionNumber: 2, definition: { ...definition, versionId, versionNumber: 2 } });
        await db.update(requestTypes).set({ publishedVersionId: versionId }).where(eq(requestTypes.id, item.typeId));
        const published = await service.Types(item.actor, requestTypeSearchSchema.parse({ search: [{ name: "code", condition: "EQUAL", value: `T${item.typeId}` }] }));
        expect(published.items).toEqual([expect.objectContaining({ id: item.typeId, code: `T${item.typeId}`, versionNumber: 2 })]);
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
    const env = readEnvironment({
        NODE_ENV: "test", DATABASE_URL: process.env.TEST_DATABASE_URL,
        AUTH_JWT_SECRET: "request-http-test-only-secret-32-bytes-long",
        AUTH_JWT_ISSUER: "request-http-tests", AUTH_JWT_AUDIENCE: "request-http-tests-api",
        AUTH_ALLOWED_ORIGINS: "http://localhost:3000", AUTH_COOKIE_SECURE: "false",
    });
    const identity = await createIdentityComposition(env, database);
    const tokenProvider = (await import("../../src/Infrastructures/Security/TokenProvider")).TokenProvider;
    const token = await new tokenProvider(env.AUTH_JWT_SECRET, { Now: () => new Date() }, env.AUTH_JWT_ISSUER, env.AUTH_JWT_AUDIENCE).Sign(item.ownerId, item.actor.family.id, 0);
    const app = createApplication(undefined, identity, service);
    const send = (method: string, path: string, body?: unknown, authorization = `Bearer ${token}`, key = randomUUID()) => app.handle(new Request(`http://localhost/api/v1${path}`, { method, headers: { authorization, "content-type": "application/json", "Idempotency-Key": key, origin: env.AUTH_ALLOWED_ORIGINS[0]! }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }));
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
    const versionPath = `/request-types/${item.typeId}/versions/${item.versionId}`;
    expect((await send("GET", versionPath, undefined, "")).status).toBe(401);
    expect((await send("GET", versionPath)).status).toBe(404);
    expect((await send("GET", `${versionPath}?requestId=invalid`)).status).toBe(404);
    expect((await send("GET", `${versionPath}?requestId=${randomUUID()}`)).status).toBe(404);
    const pinned = await send("GET", `${versionPath}?requestId=${draft.id}`);
    expect(pinned.status).toBe(200);
    expect(pinned.headers.get("cache-control")).toBe("no-store");
    expect(await pinned.json()).toMatchObject({ id: item.typeId, versionId: item.versionId });
    const patched = await send("PATCH", `/requests/${draft.id}/draft`, { expectedVersion: 0, title: "Updated" });
    expect(patched.status).toBe(200);
    expect((await send("POST", `/requests/${draft.id}/submit`, { expectedVersion: 0 })).status).toBe(409);
    const submitted = await send("POST", `/requests/${draft.id}/submit`, { expectedVersion: 1 });
    expect(submitted.status).toBe(200);
    const submittedDetail = requestDetailSchema.parse(await submitted.json());
    expect(submittedDetail.title).toBe("Updated");
    const ownerRead = await send("GET", `/requests/${draft.id}`);
    expect(ownerRead.status).toBe(200);
    expect(requestDetailSchema.parse(await ownerRead.json())).toEqual(submittedDetail);
    const reviewerFamily = randomUUID();
    await db.insert(sessionFamilies).values({ id: reviewerFamily, userId: item.reviewerId, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
    const reviewerToken = await new tokenProvider(env.AUTH_JWT_SECRET, { Now: () => new Date() }, env.AUTH_JWT_ISSUER, env.AUTH_JWT_AUDIENCE).Sign(item.reviewerId, reviewerFamily, 0);
    expect((await send("GET", `/requests/${draft.id}`, undefined, `Bearer ${reviewerToken}`)).status).toBe(200);
    const replacement = await fixture();
    await db.insert(userRoles).values({ userId: replacement.ownerId, roleCode: "REVIEWER" });
    const replacementToken = await new tokenProvider(env.AUTH_JWT_SECRET, { Now: () => new Date() }, env.AUTH_JWT_ISSUER, env.AUTH_JWT_AUDIENCE).Sign(replacement.ownerId, replacement.actor.family.id, 0);
    const replacementDraft = await replacement.draft();
    const stage = (await db.select().from(approvalStages).where(eq(approvalStages.cycleId, submittedDetail.currentCycleId!)))[0]!;
    await db.update(approvalSlots).set({ reviewerId: replacement.ownerId }).where(eq(approvalSlots.stageId, stage.id));
    expect((await send("GET", `/requests/${draft.id}`, undefined, `Bearer ${replacementToken}`)).status).toBe(200);
    const search = async (authorization: string) =>
    {
        const response = await send("POST", "/requests/search", {}, authorization);
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.get("access-control-expose-headers")?.toLowerCase()).toContain("x-pagination");
        return { items: requestSummarySchema.array().parse(await response.json()), pagination: JSON.parse(response.headers.get("x-pagination")!) };
    };
    const ownerSearch = await search(`Bearer ${token}`);
    expect(ownerSearch.items).toHaveLength(1);
    expect(ownerSearch.pagination).toMatchObject({ totalCount: 1, currentPage: 1, pageSize: 20, totalPages: 1, hasPrevious: false, hasNext: false });
    expect(ownerSearch.items[0]).toMatchObject({ id: draft.id, status: "PENDING", requestNumber: submittedDetail.requestNumber, revisionNumber: submittedDetail.submittedRevision!.revisionNumber, currentCycleId: submittedDetail.currentCycleId, version: submittedDetail.version });
    const replacementSearch = await search(`Bearer ${replacementToken}`);
    expect(replacementSearch.items.map((row) => row.id)).toEqual([replacementDraft.id]);
    expect(replacementSearch.pagination).toMatchObject({ totalCount: 1, currentPage: 1, pageSize: 20, totalPages: 1, hasPrevious: false, hasNext: false });
    for (const name of ["requesterId", "id"])
    {
        expect((await send("POST", "/requests/search", { search: [{ name, condition: "EQUAL", value: replacement.ownerId }] })).status).toBe(422);
    }
    const other = await fixture();
    const otherToken = await new tokenProvider(env.AUTH_JWT_SECRET, { Now: () => new Date() }, env.AUTH_JWT_ISSUER, env.AUTH_JWT_AUDIENCE).Sign(other.ownerId, other.actor.family.id, 0);
    const adminFamily = randomUUID();
    await db.delete(userRoles).where(eq(userRoles.userId, other.reviewerId));
    await db.insert(userRoles).values({ userId: other.reviewerId, roleCode: "ADMINISTRATOR" });
    await db.insert(sessionFamilies).values({ id: adminFamily, userId: other.reviewerId, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
    const adminToken = await new tokenProvider(env.AUTH_JWT_SECRET, { Now: () => new Date() }, env.AUTH_JWT_ISSUER, env.AUTH_JWT_AUDIENCE).Sign(other.reviewerId, adminFamily, 0);
    const hiddenResponses = await Promise.all([
        send("GET", `/requests/${draft.id}`, undefined, `Bearer ${reviewerToken}`),
        send("GET", `/requests/${draft.id}`, undefined, `Bearer ${otherToken}`),
        send("GET", `/requests/${draft.id}`, undefined, `Bearer ${adminToken}`),
        send("GET", `/requests/${randomUUID()}`, undefined, `Bearer ${reviewerToken}`),
    ]);
    for (const response of hiddenResponses) await expectHttpError(response, 404);
    expect((await send("GET", `/requests/${draft.id}`, undefined, "")).status).toBe(401);
    expect((await send("GET", `/requests/${randomUUID()}`)).status).toBe(404);
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

test("SEC-03 pinned definitions require matching current request context and survive publication/disablement", async () =>
{
    const item = await fixture();
    const draft = await item.draft();
    const definition = await service.TypeVersion(item.actor, item.typeId, item.versionId, draft.id);
    const foreign = await fixture();
    await expect(service.TypeVersion(foreign.actor, item.typeId, item.versionId, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.TypeVersion(item.actor, item.typeId, item.versionId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(service.TypeVersion(item.actor, foreign.typeId, foreign.versionId, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const familyId = randomUUID();
    await db.insert(sessionFamilies).values({ id: familyId, userId: item.reviewerId, authVersion: 0, createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
    const reviewer = (await new IdentityRepository(db).ReadCurrentIdentity(item.reviewerId, familyId))!;
    await expect(service.TypeVersion(reviewer, item.typeId, item.versionId, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await service.Mutate(item.actor, "submit", draft.id, { expectedVersion: 0 }, randomUUID());
    expect(await service.TypeVersion(reviewer, item.typeId, item.versionId, draft.id)).toEqual(definition);
    const nextId = randomUUID();
    const next = { ...definition, versionId: nextId, versionNumber: 2, fields: [] };
    await db.insert(requestTypeVersions).values({ id: nextId, typeId: item.typeId, versionNumber: 2, definition: next });
    await db.update(requestTypes).set({ publishedVersionId: nextId, isEnabled: false }).where(eq(requestTypes.id, item.typeId));
    expect(await service.TypeVersion(item.actor, item.typeId, item.versionId, draft.id)).toEqual(definition);
    await expect(service.TypeVersion(item.actor, item.typeId, nextId, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.insert(userRoles).values({ userId: foreign.ownerId, roleCode: "ADMINISTRATOR" });
    expect(await service.TypeVersion(foreign.actor, item.typeId, item.versionId)).toEqual(definition);
    await expect(service.Read(foreign.actor, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.update(requests).set({ status: "WITHDRAWN" }).where(eq(requests.id, draft.id));
    await expect(service.TypeVersion(reviewer, item.typeId, item.versionId, draft.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
});
