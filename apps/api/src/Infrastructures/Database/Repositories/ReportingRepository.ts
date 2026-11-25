import { sql, type SQL } from "drizzle-orm";
import { dashboardSchema, reportAggregateRowSchema, type ReportSearch } from "@workflow/contracts";
import type { IActor } from "../../../Domains/Identity/Identity";
import { isCurrentIdentity } from "../../../Domains/Identity/Identity";
import { RequestError } from "../../../Domains/Requests/RequestRules";
import type { IReportingRepository, IReportingUnitOfWork } from "../../../Domains/Reporting/Ports";
import type { IReportingScope } from "../../../Domains/Reporting/ReportingRules";
import type { Database } from "../Database";
import { IdentityRepository } from "./IdentityRepository";
import { RequestRepository } from "./RequestRepository";
import { ApprovalTaskRepository } from "./ApprovalTaskRepository";

type Connection = Database["connection"];
type Transaction = Parameters<Parameters<Connection["transaction"]>[0]>[0];
const actionable = sql`r.status = 'PENDING' and c.is_active and r.current_cycle_id = c.id and r.submitted_revision_id = c.revision_id and s.status = 'ACTIVE' and sl.status = 'ACTIONABLE' and sl.reviewer_id <> r.requester_id`;
export class ReportingRepository implements IReportingRepository
{
    constructor(private readonly db: Transaction)
{}
    public async CurrentActor(actor: IActor, now: Date)
    {
        const current = await new IdentityRepository(this.db).ReadCurrentIdentity(actor.account.id, actor.family.id);
        if (!current || !current.roles.length || !isCurrentIdentity(current, actor.account.authVersion, now)) throw new RequestError("UNAUTHENTICATED");
        return current;
    }
    public async Dashboard(actor: IActor, scope: IReportingScope, now: Date)
    {
        const summary: Record<string, number> = {};
        const sections: Record<string, unknown> = {};
        if (scope.requester)
        {
            const rows = await this.db.execute<{ status: string; count: number }>(sql`select status, count(*)::int as count from requests where requester_id = ${actor.account.id} group by status`);
            const counts = new Map(rows.map((row) => [row.status, row.count]));
            Object.assign(summary, { ownRequests: rows.reduce((sum, row) => sum + row.count, 0), pendingRequests: counts.get("PENDING") ?? 0, returnedRequests: counts.get("RETURNED") ?? 0, approvedRequests: counts.get("APPROVED") ?? 0, rejectedRequests: counts.get("REJECTED") ?? 0 });
            sections.recentRequests = (await new RequestRepository(this.db).Search(actor.account.id, { pageNumber: 1, pageSize: 5, search: [], orderBy: "updatedAt desc" })).items;
        }
        if (scope.reviewer)
        {
            const counts = await this.db.execute<{ pending: number; overdue: number }>(sql`select count(*)::int as pending, count(*) filter (where sl.due_at <= ${now.toISOString()}::timestamptz)::int as overdue from approval_slots sl join approval_stages s on s.id = sl.stage_id join approval_cycles c on c.id = s.cycle_id join requests r on r.id = c.request_id where ${actionable} and sl.reviewer_id = ${actor.account.id}`);
            Object.assign(summary, { pendingReviews: counts[0]!.pending, overdueTasks: counts[0]!.overdue });
            sections.pendingTasks = (await new ApprovalTaskRepository(this.db).Search(actor.account.id, { pageNumber: 1, pageSize: 5, search: [], orderBy: "dueAt asc" })).items;
            const decisions = await this.db.execute<{ id: string; decision: string; decidedAt: Date; taskId: string; requestId: string; cycleId: string; revisionId: string }>(sql`select d.id, d.decision, d.decided_at as "decidedAt", sl.id as "taskId", r.id as "requestId", c.id as "cycleId", c.revision_id as "revisionId" from approval_decisions d join approval_slots sl on sl.id = d.slot_id join approval_stages s on s.id = sl.stage_id join approval_cycles c on c.id = s.cycle_id join requests r on r.id = c.request_id where d.actor_id = ${actor.account.id} order by d.decided_at desc, d.id asc limit 5`);
            sections.recentDecisions = decisions.map((row) => ({ ...row, decidedAt: new Date(row.decidedAt).toISOString() }));
        }
        if (scope.administrator)
        {
            const statuses = await this.db.execute<{ key: string; count: number }>(sql`select status as key, count(*)::int as count from requests group by status order by status`);
            const config = await this.db.execute<{ enabledPublishedTypes: number; activePolicyVersions: number; activeAssignmentRules: number; actionableTasks: number; overdueTasks: number }>(sql`select (select count(*)::int from request_types where is_enabled and published_version_id is not null) as "enabledPublishedTypes", (select count(*)::int from approval_policy_versions where is_active) as "activePolicyVersions", (select count(*)::int from reviewer_assignment_rules where is_active) as "activeAssignmentRules", count(*)::int as "actionableTasks", count(*) filter (where sl.due_at <= ${now.toISOString()}::timestamptz)::int as "overdueTasks" from approval_slots sl join approval_stages s on s.id = sl.stage_id join approval_cycles c on c.id = s.cycle_id join requests r on r.id = c.request_id where ${actionable}`);
            const row = config[0]!;
            sections.administration = { statusCounts: statuses.map(({ key, count }) => ({ dimension: "STATUS", key, label: key, count })), configuration: { enabledPublishedTypes: row.enabledPublishedTypes, activePolicyVersions: row.activePolicyVersions, activeAssignmentRules: row.activeAssignmentRules }, escalation: { actionableTasks: row.actionableTasks, overdueTasks: row.overdueTasks } };
        }
        return dashboardSchema.parse({ roleContext: actor.roles, generatedAt: now.toISOString(), ...(scope.requester || scope.reviewer ? { summary } : {}), ...sections });
    }
    public async Search(actor: IActor, scope: IReportingScope, query: ReportSearch)
    {
        const predicates: SQL[] = [];
        if (!scope.administrator)
        {
            const alternatives: SQL[] = [];
            if (scope.requester) alternatives.push(sql`r.requester_id = ${actor.account.id}`);
            if (scope.reviewer) alternatives.push(sql`exists (select 1 from approval_cycles c join approval_stages s on s.cycle_id = c.id join approval_slots sl on sl.stage_id = s.id where c.request_id = r.id and sl.reviewer_id = ${actor.account.id} and ${actionable})`);
            predicates.push(sql`(${sql.join(alternatives, sql` or `)})`);
        }
        for (const filter of query.search)
        {
            const column = filter.name === "status" ? sql`r.status` : filter.name === "typeId" ? sql`r.type_id` : filter.name === "departmentId" ? sql`r.department_id` : sql`r.created_at`;
            if (filter.condition === "ISNULL") predicates.push(sql`${column} is null`);
            else if (filter.condition === "ISNOTNULL") predicates.push(sql`${column} is not null`);
            else if (filter.condition === "EQUAL") predicates.push(sql`${column} = ${filter.value}`);
            else if (filter.condition === "NOTEQUAL") predicates.push(sql`${column} <> ${filter.value}`);
            else if (filter.condition === "GREATEROREQUAL") predicates.push(sql`${column} >= ${filter.value}`);
            else if ("value" in filter) predicates.push(sql`${column} < ${filter.value}`);
        }
        if (query.dimension === "OUTCOME") predicates.push(sql`r.status in ('APPROVED', 'REJECTED', 'WITHDRAWN')`);
        const key = query.dimension === "TYPE" ? sql`r.type_id::text` : query.dimension === "DEPARTMENT" ? sql`coalesce(r.department_id::text, 'UNASSIGNED')` : sql`r.status`;
        const label = query.dimension === "TYPE" ? sql`t.code` : query.dimension === "DEPARTMENT" ? sql`coalesce(dep.name, 'No department')` : sql`r.status`;
        const labelFilter = query.searchTerm ? sql`where label ilike ${`%${query.searchTerm.value.replace(/[\\%_]/g, "\\$&")}%`}` : sql``;
        const [field, direction] = query.orderBy.split(" ");
        const order = sql.raw(`${field} ${direction}, key asc`);
        const pageOrder = sql.raw(`page.${field} ${direction}, page.key asc`);
        const rows = await this.db.execute<{ key: string | null; label: string | null; count: number | null; total: number }>(sql`with grouped as (select ${key} as key, ${label} as label, count(*)::int as count from requests r join request_types t on t.id = r.type_id left join departments dep on dep.id = r.department_id ${predicates.length ? sql`where ${sql.join(predicates, sql` and `)}` : sql``} group by ${key}, ${label}), filtered as (select * from grouped ${labelFilter}), total as (select count(*)::int as total from filtered), page as (select * from filtered order by ${order} limit ${query.pageSize} offset ${(query.pageNumber - 1) * query.pageSize}) select page.key, page.label, page.count, total.total from total left join page on true order by ${pageOrder}`);
        const totalCount = rows[0]!.total;
        const totalPages = Math.ceil(totalCount / query.pageSize);
        return { items: rows.filter((row) => row.key !== null).map((row) => reportAggregateRowSchema.parse({ dimension: query.dimension, key: row.key, label: row.label, count: row.count })), pagination: { currentPage: query.pageNumber, pageSize: query.pageSize, totalPages, totalCount, hasPrevious: query.pageNumber > 1, hasNext: query.pageNumber < totalPages } };
    }
}
export class ReportingUnitOfWork implements IReportingUnitOfWork
{
    constructor(private readonly db: Connection)
{}
    public Run<T>(operation: (repository: IReportingRepository) => Promise<T>): Promise<T>
    {
        return this.db.transaction((tx) => operation(new ReportingRepository(tx)), { isolationLevel: "repeatable read", accessMode: "read only" });
    }
}
