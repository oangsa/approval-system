import { and, asc, count, eq, gt, gte, ilike, isNotNull, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { approvalTaskSchema, type ApprovalTaskSearch } from "@workflow/contracts";
import type { IActor } from "../../../Domains/Identity/Identity";
import type { IApprovalTaskRepository, IApprovalTaskUnitOfWork } from "../../../Domains/Approvals/Ports";
import type { Database } from "../Database";
import { approvalDecisions, approvalCycles, approvalSlots, approvalStages, requests, users } from "../schema";
import { RequestRepository } from "./RequestRepository";

type Connection = Database["connection"];
type Transaction = Parameters<Parameters<Connection["transaction"]>[0]>[0];
const escaped = (value: string) => value.replace(/[\\%_]/g, "\\$&");
export class ApprovalTaskRepository implements IApprovalTaskRepository
{
    constructor(private readonly db: Transaction)
    {}
    public CurrentActor(actor: IActor)
    {
        return new RequestRepository(this.db).CurrentActor(actor);
    }
    private Scope(actorId: string): SQL[]
    {
        return [eq(approvalSlots.reviewerId, actorId), ne(requests.requesterId, actorId), eq(requests.status, "PENDING"), eq(approvalCycles.isActive, true), eq(requests.currentCycleId, approvalCycles.id), eq(requests.submittedRevisionId, approvalCycles.revisionId), eq(approvalStages.status, "ACTIVE"), eq(approvalSlots.status, "ACTIONABLE")];
    }
    private Rows(where: SQL | undefined)
    {
        return this.db.select({ id: sql<string>`${approvalSlots.id}`.as("slot_id"), requestId: sql<string>`${requests.id}`.as("request_id"), cycleId: sql<string>`${approvalCycles.id}`.as("cycle_id"), revisionId: sql<string>`${approvalCycles.revisionId}`.as("revision_id"), stageNumber: sql<number>`${approvalStages.stageNumber}`.as("stage_number"), requestNumber: sql<string | null>`${requests.requestNumber}`.as("request_number"), reviewerId: sql<string>`${users.id}`.as("reviewer_id"), displayName: sql<string>`${users.displayName}`.as("display_name"), status: sql<string>`${approvalSlots.status}`.as("slot_status"), dueAt: sql<Date | null>`${approvalSlots.dueAt}`.mapWith({ mapFromDriverValue: (value: string | null) => value === null ? null : new Date(value) }).as("due_at"), version: sql<number>`${approvalSlots.version}`.as("slot_version") })
            .from(approvalSlots).innerJoin(approvalStages, eq(approvalSlots.stageId, approvalStages.id)).innerJoin(approvalCycles, eq(approvalStages.cycleId, approvalCycles.id)).innerJoin(requests, eq(approvalCycles.requestId, requests.id)).innerJoin(users, eq(approvalSlots.reviewerId, users.id)).where(where);
    }
    private Project(row: Awaited<ReturnType<ApprovalTaskRepository["Rows"]>>[number])
    {
        return approvalTaskSchema.parse({ id: row.id, slotId: row.id, requestId: row.requestId, cycleId: row.cycleId, revisionId: row.revisionId, stageNumber: row.stageNumber, assignedReviewer: { id: row.reviewerId, displayName: row.displayName }, status: row.status, dueAt: row.dueAt?.toISOString() ?? null, canCurrentUserDecide: true, version: row.version });
    }
    public async ReadCurrent(actorId: string, taskId: string)
    {
        const row = (await this.Rows(and(...this.Scope(actorId), eq(approvalSlots.id, taskId))))[0];
        return row ? this.Project(row) : null;
    }
    public async ReadHandled(actorId: string, taskId: string)
    {
        const row = (await this.Rows(and(eq(approvalSlots.id, taskId), sql`exists (select 1 from ${approvalDecisions} where ${approvalDecisions.slotId} = ${approvalSlots.id} and ${approvalDecisions.actorId} = ${actorId})`)))[0];
        return row ? { ...this.Project(row), canCurrentUserDecide: false } : null;
    }
    public async Search(actorId: string, query: ApprovalTaskSearch)
    {
        const predicates = this.Scope(actorId);
        const now = new Date();
        for (const filter of query.search)
        {
            if (filter.name === "stageNumber") predicates.push(eq(approvalStages.stageNumber, filter.value));
            else if (filter.name === "status") predicates.push(eq(approvalSlots.status, filter.value));
            else if (filter.name === "overdue") predicates.push(filter.value ? lte(approvalSlots.dueAt, now) : or(isNull(approvalSlots.dueAt), gt(approvalSlots.dueAt, now))!);
            else if (filter.name === "requestNumber")
            {
                const value = escaped(filter.value);
                predicates.push(ilike(requests.requestNumber, filter.condition === "CONTAINS" ? `%${value}%` : filter.condition === "STARTWITH" ? `${value}%` : value));
            }
            else if (filter.condition === "ISNULL") predicates.push(isNull(approvalSlots.dueAt));
            else if (filter.condition === "ISNOTNULL") predicates.push(isNotNull(approvalSlots.dueAt));
            else if ("value" in filter)
            {
                const value = new Date(filter.value);
                predicates.push(filter.condition === "GREATER" ? gt(approvalSlots.dueAt, value) : filter.condition === "LESSER" ? lt(approvalSlots.dueAt, value) : filter.condition === "GREATEROREQUAL" ? gte(approvalSlots.dueAt, value) : lte(approvalSlots.dueAt, value));
            }
        }
        if (query.searchTerm)
        {
            const term = `%${escaped(query.searchTerm.value)}%`;
            predicates.push(or(...query.searchTerm.name.split(",").map((name) => ilike(name === "title" ? requests.title : requests.requestNumber, term)))!);
        }
        const where = and(...predicates);
        const field = query.orderBy.startsWith("stageNumber") ? "stageNumber" : query.orderBy.startsWith("requestNumber") ? "requestNumber" : "dueAt";
        const scoped = this.db.$with("scoped").as(this.Rows(where));
        const total = this.db.$with("total").as(this.db.select({ count: count().as("count") }).from(scoped));
        const order = query.orderBy.endsWith("desc") ? sql`${scoped[field]} desc nulls last` : sql`${scoped[field]} asc nulls last`;
        const page = this.db.$with("page").as(this.db.select().from(scoped).orderBy(order, asc(scoped.id)).limit(query.pageSize).offset((query.pageNumber - 1) * query.pageSize));
        // The single aggregate row is the join driver so the total survives an empty page; the page CTE is optional.
        const pageOrder = query.orderBy.endsWith("desc") ? sql`${page[field]} desc nulls last` : sql`${page[field]} asc nulls last`;
        const rows = await this.db.with(scoped, total, page).select({ id: page.id, requestId: page.requestId, cycleId: page.cycleId, revisionId: page.revisionId, stageNumber: page.stageNumber, requestNumber: page.requestNumber, reviewerId: page.reviewerId, displayName: page.displayName, status: page.status, dueAt: page.dueAt, version: page.version, total: total.count }).from(total).leftJoin(page, sql`true`).orderBy(pageOrder, asc(page.id));
        const totalCount = rows[0]!.total;
        const totalPages = Math.ceil(totalCount / query.pageSize);
        return { items: rows.filter((row) => row.id !== null).map((row) => this.Project(row)), pagination: { currentPage: query.pageNumber, pageSize: query.pageSize, totalPages, totalCount, hasPrevious: query.pageNumber > 1, hasNext: query.pageNumber < totalPages } };
    }
}
export class ApprovalTaskUnitOfWork implements IApprovalTaskUnitOfWork
{
    constructor(private readonly db: Connection)
    {}
    public Run<T>(operation: (repository: IApprovalTaskRepository) => Promise<T>): Promise<T>
    {
        return this.db.transaction((tx) => operation(new ApprovalTaskRepository(tx)));
    }
}
