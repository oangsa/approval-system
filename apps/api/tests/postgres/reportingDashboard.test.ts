import { randomUUID } from "node:crypto";
import { afterAll, expect, test, vi } from "vitest";
import { asc, eq, sql } from "drizzle-orm";
import { dashboardSchema, reportSearchSchema, type UserRole } from "@workflow/contracts";
import { createTestDatabase } from "../helpers/testDatabase";
import { approvalReportingFixture, reportingFixture } from "../helpers/reportingFixtures";
import { RequestRepository } from "../../src/Infrastructures/Database/Repositories/RequestRepository";
import { DecisionService } from "../../src/Applications/Approvals/DecisionService";
import { ApprovalTaskService } from "../../src/Applications/Approvals/ApprovalTaskService";
import { DecisionUnitOfWork } from "../../src/Infrastructures/Database/Repositories/DecisionRepository";
import { ApprovalTaskUnitOfWork } from "../../src/Infrastructures/Database/Repositories/ApprovalTaskRepository";
import { ReportingService } from "../../src/Applications/Reporting/ReportingService";
import { ReportingRepository, ReportingUnitOfWork } from "../../src/Infrastructures/Database/Repositories/ReportingRepository";
import { approvalCycles, approvalDecisions, approvalSlots, approvalStages, departments, requestAuditEvents, requestRevisions, requestTypes, requests, sessionFamilies, userRoles, users } from "../../src/Infrastructures/Database/schema";

const database = createTestDatabase();
const db = database.connection;
const service = new ReportingService(new ReportingUnitOfWork(db));
afterAll(async () => database.Close());

test("dashboard projects exactly seven role combinations and rechecks current identity", async () =>
{
    const fixture = await reportingFixture(db);
    const combinations: UserRole[][] = [["REQUESTER"], ["REVIEWER"], ["ADMINISTRATOR"], ["REQUESTER", "REVIEWER"], ["REQUESTER", "ADMINISTRATOR"], ["REVIEWER", "ADMINISTRATOR"], ["REQUESTER", "REVIEWER", "ADMINISTRATOR"]];
    for (const roles of combinations)
    {
        const actor = await fixture.actor(fixture.ownerId, roles);
        const result = dashboardSchema.parse(await service.Dashboard(actor));
        expect("recentRequests" in result).toBe(roles.includes("REQUESTER"));
        expect("pendingTasks" in result).toBe(roles.includes("REVIEWER"));
        expect("administration" in result).toBe(roles.includes("ADMINISTRATOR"));
        if ("recentRequests" in result)
        {
            expect(result.summary).toMatchObject({ ownRequests: 6, pendingRequests: 1, returnedRequests: 1, approvedRequests: 1, rejectedRequests: 1 });
            expect(result.recentRequests).toHaveLength(5);
            expect(result.recentRequests.every((row) => row.requester.id === fixture.ownerId)).toBe(true);
        }
        if (roles.length === 1 && roles[0] === "ADMINISTRATOR") expect(JSON.stringify(result)).not.toContain("Private");
    }
    const stale = await fixture.actor(fixture.ownerId, ["REQUESTER", "ADMINISTRATOR"]);
    await db.delete(userRoles).where(eq(userRoles.userId, fixture.ownerId));
    await db.insert(userRoles).values({ userId: fixture.ownerId, roleCode: "REQUESTER" });
    expect(await service.Dashboard(stale)).not.toHaveProperty("administration");
    await db.update(sessionFamilies).set({ revokedAt: new Date() }).where(eq(sessionFamilies.id, stale.family.id));
    await expect(service.Dashboard(stale)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    const inactive = await fixture.actor(fixture.ownerId, ["REQUESTER"]);
    await db.update(users).set({ isActive: false }).where(eq(users.id, fixture.ownerId));
    await expect(service.Dashboard(inactive)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
});

test("reports scope and group source rows with literal labels, dates and stable pagination", async () =>
{
    const fixture = await reportingFixture(db);
    const actor = await fixture.actor(fixture.ownerId, ["REQUESTER", "REVIEWER"]);
    const search = (query: unknown) => service.Search(actor, reportSearchSchema.parse(query));
    const source = await db.select().from(requests).where(eq(requests.requesterId, fixture.ownerId));
    const statuses = await search({ dimension: "STATUS", pageSize: 2 });
    expect(statuses.pagination).toEqual({ currentPage: 1, pageSize: 2, totalPages: 3, totalCount: 6, hasPrevious: false, hasNext: true });
    const pages = await Promise.all([1, 2, 3, 4].map((pageNumber) => search({ pageSize: 2, pageNumber })));
    expect(pages.flatMap((page) => page.items)).toEqual(source.map((row) => ({ dimension: "STATUS", key: row.status, label: row.status, count: 1 })).sort((a, b) => a.key.localeCompare(b.key)));
    expect(pages[3]!.pagination).toMatchObject({ totalCount: 6, totalPages: 3, hasPrevious: true, hasNext: false });
    expect((await search({ dimension: "OUTCOME" })).items).toEqual(["APPROVED", "REJECTED", "WITHDRAWN"].map((key) => ({ dimension: "OUTCOME", key, label: key, count: 1 })));
    expect((await search({ dimension: "DEPARTMENT", orderBy: "label asc" })).items).toEqual([{ dimension: "DEPARTMENT", key: fixture.departmentId, label: `Department ${fixture.departmentId}`, count: 3 }, { dimension: "DEPARTMENT", key: "UNASSIGNED", label: "No department", count: 3 }]);
    const departmentKeys = await db.execute<{ key: string }>(sql`select key from (values (${fixture.departmentId}::text), ('UNASSIGNED'::text)) as department_keys(key) order by key asc`);
    expect((await search({ dimension: "DEPARTMENT" })).items.map((row) => row.key)).toEqual(departmentKeys.map((row) => row.key));
    expect((await search({ dimension: "TYPE" })).items).toEqual([{ dimension: "TYPE", key: fixture.typeId, label: `T%_${fixture.typeId}`, count: 6 }]);
    expect((await search({ dimension: "TYPE", searchTerm: { name: "label", value: "%_" } })).items).toMatchObject([{ key: fixture.typeId, count: 6 }]);
    expect((await search({ search: [{ name: "createdAt", condition: "GREATEROREQUAL", value: "2026-01-01T00:00:00.123001Z" }] })).items).toEqual([]);
    expect((await search({ search: [{ name: "createdAt", condition: "LESSER", value: "2026-01-01T00:00:00.123001Z" }] })).items).toHaveLength(6);
    expect((await search({ search: [{ name: "typeId", condition: "EQUAL", value: fixture.typeId }, { name: "status", condition: "EQUAL", value: "APPROVED" }] })).items).toMatchObject([{ key: "APPROVED", count: 1 }]);
    const before = await db.select().from(requests).where(eq(requests.requesterId, fixture.ownerId));
    const restarted = new ReportingService(new ReportingUnitOfWork(db));
    expect(await restarted.Search(actor, reportSearchSchema.parse({}))).toEqual(await search({}));
    expect(await db.select().from(requests).where(eq(requests.requesterId, fixture.ownerId))).toEqual(before);
});


test("dashboard and reports retain their PostgreSQL snapshot across concurrent commits", async () =>
{
    const fixture = await reportingFixture(db);
    const actor = await fixture.actor(fixture.ownerId, ["REQUESTER"]);
    const observer = createTestDatabase();
    const insertRequest = async (typeId: string) => observer.connection.insert(requests).values({ id: randomUUID(), requesterId: fixture.ownerId, typeId, title: "Concurrent", justification: "Private", priority: "HIGH", status: "DRAFT" });
    const originalRequests = RequestRepository.prototype.Search;
    const requestBarrier = vi.spyOn(RequestRepository.prototype, "Search").mockImplementationOnce(async function(this: RequestRepository, ...args)
    {
        await insertRequest(fixture.typeId);
        return originalRequests.apply(this, args);
    });
    try
    {
        const snapshot = await service.Dashboard(actor);
        expect(snapshot).toMatchObject({ summary: { ownRequests: 6 } });
        if (!("recentRequests" in snapshot)) throw new Error("Missing requester projection");
        expect(snapshot.recentRequests).toHaveLength(5);
        expect(snapshot.recentRequests.every((row) => row.title !== "Concurrent")).toBe(true);
        expect(await service.Dashboard(actor)).toMatchObject({ summary: { ownRequests: 7 } });
    }
    finally
    {
        requestBarrier.mockRestore();
    }
    const typeId = randomUUID();
    const originalReports = ReportingRepository.prototype.Search;
    const reportBarrier = vi.spyOn(ReportingRepository.prototype, "Search").mockImplementationOnce(async function(this: ReportingRepository, ...args)
    {
        await observer.connection.insert(requestTypes).values({ id: typeId, code: `Concurrent ${typeId}` });
        await insertRequest(typeId);
        return originalReports.apply(this, args);
    });
    try
    {
        const query = reportSearchSchema.parse({ dimension: "TYPE", pageSize: 1 });
        const snapshot = await service.Search(actor, query);
        expect(snapshot.items).toMatchObject([{ key: fixture.typeId, count: 7 }]);
        expect(snapshot.pagination).toMatchObject({ totalCount: 1, totalPages: 1 });
        const fresh = await service.Search(actor, query);
        expect(fresh.pagination).toMatchObject({ totalCount: 2, totalPages: 2 });
    }
    finally
    {
        reportBarrier.mockRestore();
        await observer.Close();
    }
});

test("accepted decision refreshes dashboard and report scope while preserving safe history", async () =>
{
    const fixture = await approvalReportingFixture(db);
    const submitted = await fixture.submit();
    const slotId = submitted.currentApprovers[0]!.slotId;
    const decisions = new DecisionService(new DecisionUnitOfWork(db));
    const tasks = new ApprovalTaskService(new ApprovalTaskUnitOfWork(db));
    expect(await service.Dashboard(fixture.reviewer)).toMatchObject({ summary: { pendingReviews: 1 }, pendingTasks: [{ id: slotId }] });
    expect((await service.Search(fixture.reviewer, reportSearchSchema.parse({}))).items).toMatchObject([{ key: "PENDING", count: 1 }]);
    const accepted = await decisions.Decide(fixture.reviewer, slotId, { decision: "APPROVE", expectedVersion: 0 }, randomUUID());
    expect(await service.Dashboard(fixture.owner)).toMatchObject({ summary: { pendingRequests: 0, approvedRequests: 1 } });
    const dashboard = await service.Dashboard(fixture.reviewer);
    expect(dashboard).toMatchObject({ summary: { pendingReviews: 0 }, pendingTasks: [], recentDecisions: [{ id: accepted.decisionId, taskId: slotId, requestId: submitted.id, cycleId: submitted.currentCycleId, revisionId: submitted.submittedRevision!.id, decision: "APPROVE" }] });
    if (!("recentDecisions" in dashboard)) throw new Error("Missing reviewer projection");
    expect(Object.keys(dashboard.recentDecisions[0]!).sort()).toEqual(["cycleId", "decidedAt", "decision", "id", "requestId", "revisionId", "taskId"]);
    expect((await service.Search(fixture.reviewer, reportSearchSchema.parse({}))).items).toEqual([]);
    await expect(fixture.requestService.Read(fixture.reviewer, submitted.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await tasks.Read(fixture.reviewer, slotId)).toMatchObject({ canCurrentUserDecide: false });
});

test("reviewer queue counts due boundaries and caps ordered current tasks", async () =>
{
    const fixture = await approvalReportingFixture(db);
    const now = new Date();
    const fixed = new ReportingService(new ReportingUnitOfWork(db), () => now);
    const submitted = [];
    for (let index = 0; index < 7; index++) submitted.push(await fixture.submit());
    const due = [-1000, 0, 1000, 2000, 2000, 3000, null];
    for (const [index, item] of submitted.entries())
    {
        await db.update(approvalSlots).set({ dueAt: due[index] === null ? null : new Date(now.getTime() + due[index]!) }).where(eq(approvalSlots.id, item.currentApprovers[0]!.slotId));
    }
    const dashboard = await fixed.Dashboard(fixture.reviewer);
    expect(dashboard).toMatchObject({ summary: { pendingReviews: 7, overdueTasks: 2 } });
    if (!("pendingTasks" in dashboard)) throw new Error("Missing reviewer projection");
    const expected = submitted.map((item, index) => ({ id: item.currentApprovers[0]!.slotId, due: due[index] })).sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity) || a.id.localeCompare(b.id));
    expect(dashboard.pendingTasks.map((item) => item.id)).toEqual(expected.slice(0, 5).map((item) => item.id));
    expect((await fixed.Search(fixture.reviewer, reportSearchSchema.parse({}))).items).toMatchObject([{ key: "PENDING", count: 7 }]);
    await db.update(requests).set({ submittedRevisionId: null }).where(eq(requests.id, submitted[0]!.id));
    await db.update(requests).set({ currentCycleId: null }).where(eq(requests.id, submitted[1]!.id));
    expect(await fixed.Dashboard(fixture.reviewer)).toMatchObject({ summary: { pendingReviews: 5, overdueTasks: 0 } });
    expect((await fixed.Search(fixture.reviewer, reportSearchSchema.parse({}))).items).toMatchObject([{ key: "PENDING", count: 5 }]);
});

test("report filters cannot reveal foreign-only groups and honor nulls and Bangkok bounds", async () =>
{
    const fixture = await reportingFixture(db);
    const actor = await fixture.actor(fixture.ownerId, ["REQUESTER"]);
    const foreignType = randomUUID(), foreignDepartment = randomUUID();
    await db.insert(requestTypes).values({ id: foreignType, code: foreignType });
    await db.insert(departments).values({ id: foreignDepartment, code: foreignDepartment, name: foreignDepartment });
    await db.insert(requests).values({ id: randomUUID(), requesterId: fixture.foreignId, typeId: foreignType, departmentId: foreignDepartment, title: "Foreign", justification: "Private", priority: "HIGH", status: "PENDING" });
    const search = (query: unknown) => service.Search(actor, reportSearchSchema.parse(query));
    for (const [name, value] of [["typeId", foreignType], ["departmentId", foreignDepartment]])
    {
        const result = await search({ search: [{ name, condition: "EQUAL", value }] });
        expect(result.items).toEqual([]);
        expect(result.pagination).toMatchObject({ totalCount: 0, totalPages: 0, hasPrevious: false, hasNext: false });
    }
    expect((await search({ search: [{ name: "status", condition: "NOTEQUAL", value: "APPROVED" }] })).items).toHaveLength(5);
    expect((await search({ dimension: "DEPARTMENT", search: [{ name: "departmentId", condition: "ISNULL" }] })).items).toMatchObject([{ key: "UNASSIGNED", count: 3 }]);
    expect((await search({ dimension: "DEPARTMENT", search: [{ name: "departmentId", condition: "ISNOTNULL" }] })).items).toMatchObject([{ key: fixture.departmentId, count: 3 }]);
    await db.update(requests).set({ createdAt: new Date("2025-12-31T17:00:00.000Z") }).where(eq(requests.requesterId, fixture.ownerId));
    expect((await search({ search: [{ name: "createdAt", condition: "GREATEROREQUAL", value: "2025-12-31T17:00:00.000Z" }, { name: "createdAt", condition: "LESSER", value: "2026-01-01T17:00:00.000Z" }] })).items).toHaveLength(6);
    expect((await search({ search: [{ name: "createdAt", condition: "LESSER", value: "2025-12-31T17:00:00.000Z" }] })).items).toEqual([]);
});

test("parallel assignments count tasks separately but reports count each request once", async () =>
{
    const fixture = await approvalReportingFixture(db, true);
    const submitted = await fixture.submit();
    expect(submitted.currentApprovers).toHaveLength(3);
    expect(await service.Dashboard(fixture.reviewer)).toMatchObject({ summary: { pendingReviews: 2 }, pendingTasks: [{ requestId: submitted.id }, { requestId: submitted.id }] });
    expect((await service.Search(fixture.reviewer, reportSearchSchema.parse({}))).items).toMatchObject([{ key: "PENDING", count: 1 }]);
    await db.insert(userRoles).values({ userId: fixture.reviewerId, roleCode: "REQUESTER" });
    await db.insert(requests).values({ id: randomUUID(), requesterId: fixture.reviewerId, typeId: fixture.typeId, title: "Own draft", justification: "Private", priority: "HIGH", status: "DRAFT" });
    expect((await service.Search(fixture.reviewer, reportSearchSchema.parse({}))).items).toEqual([{ dimension: "STATUS", key: "DRAFT", label: "DRAFT", count: 1 }, { dimension: "STATUS", key: "PENDING", label: "PENDING", count: 1 }]);
});

test("timeline persists ordered events across synthetic cycles with scoped historical access", async () =>
{
    const fixture = await approvalReportingFixture(db);
    const submitted = await fixture.submit();
    const decisions = new DecisionService(new DecisionUnitOfWork(db));
    await decisions.Decide(fixture.reviewer, submitted.currentApprovers[0]!.slotId, { decision: "APPROVE", expectedVersion: 0 }, randomUUID());
    const oldRevision = (await db.select().from(requestRevisions).where(eq(requestRevisions.id, submitted.submittedRevision!.id)))[0]!;
    const oldCycle = (await db.select().from(approvalCycles).where(eq(approvalCycles.id, submitted.currentCycleId!)))[0]!;
    const revisionId = randomUUID(), cycleId = randomUUID(), stageId = randomUUID();
    await db.insert(requestRevisions).values({ ...oldRevision, id: revisionId, revisionNumber: 2 });
    await db.insert(approvalCycles).values({ ...oldCycle, id: cycleId, revisionId, isActive: true });
    await db.insert(approvalStages).values({ id: stageId, cycleId, stageNumber: 1, status: "ACTIVE", slaBusinessMinutes: 480 });
    await db.insert(approvalSlots).values({ id: randomUUID(), stageId, reviewerId: fixture.reviewerId, assignmentKey: "review", status: "ACTIONABLE" });
    await db.update(requests).set({ status: "PENDING", submittedRevisionId: revisionId, currentCycleId: cycleId }).where(eq(requests.id, submitted.id));
    const tie = new Date("2026-01-01T00:00:00.000Z");
    await db.insert(requestAuditEvents).values([oldCycle.id, cycleId].map((id, index) => ({ id: randomUUID(), requestId: submitted.id, actorId: fixture.ownerId, eventType: "SUBMITTED", revisionId: index ? revisionId : oldRevision.id, cycleId: id, occurredAt: tie })));
    const expected = await db.select().from(requestAuditEvents).where(eq(requestAuditEvents.requestId, submitted.id)).orderBy(asc(requestAuditEvents.occurredAt), asc(requestAuditEvents.id));
    const query = { pageNumber: 1, pageSize: 100 };
    const timeline = await decisions.Timeline(fixture.owner, submitted.id, query);
    expect(timeline.items.map((item) => item.id)).toEqual(expected.map((item) => item.id));
    expect(timeline.items.every((item) => Object.keys(item.metadata).every((key) => ["decision", "slotId"].includes(key)))).toBe(true);
    const pages = await Promise.all(expected.map((_, index) => decisions.Timeline(fixture.owner, submitted.id, { pageNumber: index + 1, pageSize: 1 })));
    expect(pages.flatMap((page) => page.items.map((item) => item.id))).toEqual(expected.map((item) => item.id));
    expect((await decisions.Timeline(fixture.reviewer, submitted.id, query)).items).toEqual(timeline.items);
    await db.update(approvalSlots).set({ status: "WAITING" }).where(eq(approvalSlots.stageId, stageId));
    await db.update(requests).set({ status: "APPROVED" }).where(eq(requests.id, submitted.id));
    const outsider = await reportingFixture(db);
    const foreign = await outsider.actor(outsider.foreignId, ["REQUESTER"]);
    const admin = await outsider.actor(outsider.ownerId, ["ADMINISTRATOR"]);
    await expect(decisions.Timeline(foreign, submitted.id, query)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(decisions.Timeline(admin, submitted.id, query)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const former = await decisions.Timeline(fixture.reviewer, submitted.id, query);
    expect(former.items).toHaveLength(1);
    expect(former.items[0]!.metadata.decision).toBe("APPROVE");
    const observer = createTestDatabase();
    try
    {
        const restarted = new DecisionService(new DecisionUnitOfWork(observer.connection));
        expect(await restarted.Timeline(fixture.owner, submitted.id, query)).toEqual(timeline);
        expect(await observer.connection.select().from(requestAuditEvents).where(eq(requestAuditEvents.requestId, submitted.id)).orderBy(asc(requestAuditEvents.occurredAt), asc(requestAuditEvents.id))).toEqual(expected);
    }
    finally
    {
        await observer.Close();
    }
});

test("administrator dashboard contains only exact organizational aggregates", async () =>
{
    const fixture = await reportingFixture(db);
    const actor = await fixture.actor(fixture.ownerId, ["ADMINISTRATOR"]);
    const now = new Date();
    const fixed = new ReportingService(new ReportingUnitOfWork(db), () => now);
    const statuses = await db.execute<{ key: string; count: number }>(sql`select status as key, count(*)::int as count from requests group by status order by status`);
        const counts = await db.execute<{ types: number; policies: number; rules: number }>(sql`select (select count(*)::int from request_types where is_enabled and published_version_id is not null) as types, (select count(*)::int from approval_policy_versions where is_active) as policies, (select count(*)::int from reviewer_assignment_rules where is_active) as rules`);
    const source = await db.select({ slot: approvalSlots, stage: approvalStages, cycle: approvalCycles, request: requests }).from(approvalSlots).innerJoin(approvalStages, eq(approvalSlots.stageId, approvalStages.id)).innerJoin(approvalCycles, eq(approvalStages.cycleId, approvalCycles.id)).innerJoin(requests, eq(approvalCycles.requestId, requests.id));
    const eligible = source.filter(({ slot, stage, cycle, request }) => request.status === "PENDING" && cycle.isActive && request.currentCycleId === cycle.id && request.submittedRevisionId === cycle.revisionId && stage.status === "ACTIVE" && slot.status === "ACTIONABLE" && slot.reviewerId !== request.requesterId);
const result = await fixed.Dashboard(actor);
    expect(result).toEqual({ roleContext: ["ADMINISTRATOR"], generatedAt: now.toISOString(), administration: { statusCounts: statuses.map((row) => ({ dimension: "STATUS", key: row.key, label: row.key, count: row.count })), configuration: { enabledPublishedTypes: counts[0]!.types, activePolicyVersions: counts[0]!.policies, activeAssignmentRules: counts[0]!.rules }, escalation: { actionableTasks: eligible.length, overdueTasks: eligible.filter(({ slot }) => slot.dueAt !== null && slot.dueAt <= now).length } } });
    expect(JSON.stringify(result)).not.toContain(fixture.ownerId);
    expect(JSON.stringify(result)).not.toContain("Private");
});

test("own recent decisions are ordered and capped without another actor's decisions", async () =>
{
    const fixture = await approvalReportingFixture(db), other = await approvalReportingFixture(db);
    const decisions = new DecisionService(new DecisionUnitOfWork(db));
    for (let index = 0; index < 6; index++)
    {
        const item = await fixture.submit();
        await decisions.Decide(fixture.reviewer, item.currentApprovers[0]!.slotId, { decision: "APPROVE", expectedVersion: 0 }, randomUUID());
    }
    const foreign = await other.submit();
    await decisions.Decide(other.reviewer, foreign.currentApprovers[0]!.slotId, { decision: "APPROVE", expectedVersion: 0 }, randomUUID());
    const expected = await db.select().from(approvalDecisions).where(eq(approvalDecisions.actorId, fixture.reviewerId));
    expected.sort((a, b) => b.decidedAt.getTime() - a.decidedAt.getTime() || a.id.localeCompare(b.id));
    const dashboard = await service.Dashboard(fixture.reviewer);
    if (!("recentDecisions" in dashboard)) throw new Error("Missing reviewer projection");
    expect(dashboard.recentDecisions.map((item) => item.id)).toEqual(expected.slice(0, 5).map((item) => item.id));
    expect(dashboard.recentDecisions.every((item) => item.requestId !== foreign.id)).toBe(true);
});

test("self assignments and waiting-only assignments do not grant reviewer report scope", async () =>
{
    const fixture = await approvalReportingFixture(db, true);
    const item = await fixture.submit();
    await db.update(approvalSlots).set({ status: "WAITING" }).where(eq(approvalSlots.reviewerId, fixture.reviewerId));
    expect((await service.Search(fixture.reviewer, reportSearchSchema.parse({}))).items).toEqual([]);
    await db.update(approvalSlots).set({ status: "ACTIONABLE", reviewerId: fixture.ownerId }).where(eq(approvalSlots.id, item.currentApprovers[0]!.slotId));
    await db.insert(userRoles).values({ userId: fixture.ownerId, roleCode: "REVIEWER" });
    const dashboard = await service.Dashboard(fixture.owner);
    expect(dashboard).toMatchObject({ summary: { ownRequests: 1, pendingReviews: 0 } });
    expect((await service.Search(fixture.owner, reportSearchSchema.parse({}))).items).toMatchObject([{ key: "PENDING", count: 1 }]);
});
