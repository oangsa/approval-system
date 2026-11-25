import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { approvalPolicySchema, assignmentRuleSchema, budgetPolicySchema, departmentSummarySchema, eligibleReviewerSchema, type ApprovalPolicyDTO, type AssignmentRuleDTO, type BudgetPolicyDTO, type ConfigurationKind, type ConfigurationSearch, type DepartmentSummary, type EligibleReviewer, type IPageResult } from "@workflow/contracts";
import type { IActor } from "../../../Domains/Identity/Identity";
import { isCurrentIdentity } from "../../../Domains/Identity/Identity";
import type { IConfigurationRepository, IConfigurationUnitOfWork, IPolicyRecord, ConfigurationResult } from "../../../Domains/Policies/Ports";
import { RequestError } from "../../../Domains/Requests/RequestRules";
import type { Database } from "../Database";
import { approvalPolicies, approvalPolicyVersions, budgetPolicies, configurationAuditEvents, departments, policyIdempotencyRecords, requestTypes, reviewerAssignmentRules, userRoles, users } from "../schema";
import { IdentityRepository } from "./IdentityRepository";

type Connection = Database["connection"];
type Transaction = Parameters<Parameters<Connection["transaction"]>[0]>[0];
export class ConfigurationRepository implements IConfigurationRepository
{
    constructor(private readonly db: Transaction)
    {
    }

    public async Lock(exclusive: boolean): Promise<void>
    {
        if (exclusive) await this.db.execute(sql`select pg_advisory_xact_lock(941309)`);
        else await this.db.execute(sql`select pg_advisory_xact_lock_shared(941309)`);
    }
    public async CurrentAdmin(actor: IActor): Promise<IActor>
    {
        const identity = new IdentityRepository(this.db);
        await identity.LockUser(actor.account.id);
        const current = await identity.ReadCurrentIdentity(actor.account.id, actor.family.id);
        if (!current || !isCurrentIdentity(current, actor.account.authVersion, new Date())) throw new RequestError("UNAUTHENTICATED");
        if (!current.roles.includes("ADMINISTRATOR")) throw new RequestError("FORBIDDEN");
        return current;
    }
    public async Policy(id: string): Promise<IPolicyRecord | null>
    {
        const row = (await this.db.select().from(approvalPolicies).where(eq(approvalPolicies.id, id)).for("update"))[0];
        if (!row) return null;
        const published = row.publishedVersionId ? (await this.db.select().from(approvalPolicyVersions).where(eq(approvalPolicyVersions.id, row.publishedVersionId)))[0] : null;
        return {
            ...row, published: published ? approvalPolicySchema.parse({
                id, code: row.code, version: row.version, isEnabled: row.isEnabled, isPublished: true, versionId: published.id,
                versionNumber: published.versionNumber, priority: published.priority, typeId: published.typeId, departmentId: published.departmentId,
                minAmount: published.minAmount, maxAmount: published.maxAmount, stages: published.stages,
            }) : null
        };
    }
    public async SavePolicy(record: IPolicyRecord): Promise<void>
    {
        await this.db.insert(approvalPolicies).values({ id: record.id, code: record.code, version: record.version, isEnabled: record.isEnabled, publishedVersionId: record.published?.versionId, draft: record.draft })
            .onConflictDoUpdate({ target: approvalPolicies.id, set: { version: record.version, isEnabled: record.isEnabled, draft: record.draft } });
        if (!record.isEnabled && record.published?.versionId) await this.db.update(approvalPolicyVersions).set({ isActive: false }).where(eq(approvalPolicyVersions.id, record.published.versionId));
    }
    public async Publish(record: IPolicyRecord, result: ApprovalPolicyDTO): Promise<void>
    {
        await this.db.update(approvalPolicyVersions).set({ isActive: false }).where(eq(approvalPolicyVersions.code, record.code));
        await this.db.insert(approvalPolicyVersions).values({
            id: result.versionId!, code: result.code, versionNumber: result.versionNumber!, typeId: result.typeId,
            departmentId: result.departmentId, priority: result.priority, minAmount: result.minAmount, maxAmount: result.maxAmount, stages: result.stages, isActive: true
        });
        await this.db.update(approvalPolicies).set({ publishedVersionId: result.versionId, version: record.version, draft: null, isEnabled: true }).where(eq(approvalPolicies.id, record.id));
    }
    public async Assignment(id: string): Promise<AssignmentRuleDTO | null>
    {
        const row = (await this.db.select().from(reviewerAssignmentRules).where(eq(reviewerAssignmentRules.id, id)).for("update"))[0];
        return row ? { id: row.id, key: row.assignmentKey, departmentId: row.departmentId, reviewerUserIds: row.reviewerUserIds ?? [row.reviewerId], isActive: row.isActive, version: row.version } : null;
    }
    public async SaveAssignment(value: AssignmentRuleDTO): Promise<void>
    {
        const fields = { assignmentKey: value.key, departmentId: value.departmentId, reviewerId: value.reviewerUserIds[0]!, reviewerUserIds: value.reviewerUserIds, isActive: value.isActive, version: value.version };
        await this.db.insert(reviewerAssignmentRules).values({ id: value.id, ...fields }).onConflictDoUpdate({ target: reviewerAssignmentRules.id, set: fields });
    }
    public async Budget(id: string): Promise<BudgetPolicyDTO | null>
    {
        return (await this.db.select().from(budgetPolicies).where(eq(budgetPolicies.id, id)).for("update"))[0] ?? null;
    }
    public async SaveBudget(value: BudgetPolicyDTO): Promise<void>
    {
        await this.db.insert(budgetPolicies).values(value).onConflictDoUpdate({ target: budgetPolicies.id, set: value });
    }
    public async ValidateReferences(typeId: string | null, departmentId: string | null, reviewerIds?: string[]): Promise<boolean>
    {
        if (typeId && !(await this.db.select().from(requestTypes).where(eq(requestTypes.id, typeId)).for("share"))[0]) return false;
        if (departmentId && !(await this.db.select().from(departments).where(and(eq(departments.id, departmentId), eq(departments.isActive, true))).for("share"))[0]) return false;
        if (reviewerIds)
        {
            const candidates = await this.db.select().from(users).where(inArray(users.id, reviewerIds)).for("share");
            const roles = await this.db.select().from(userRoles).where(and(inArray(userRoles.userId, reviewerIds), eq(userRoles.roleCode, "REVIEWER"))).for("share");
            if (reviewerIds.some((id) => !candidates.some((user) => user.id === id && user.isActive) || !roles.some((role) => role.userId === id))) return false;
        }
        return true;
    }
    public async Replay(actorId: string, scope: string, key: string, hash: string): Promise<ApprovalPolicyDTO | null>
    {
        const row = (await this.db.select().from(policyIdempotencyRecords).where(and(eq(policyIdempotencyRecords.actorId, actorId), eq(policyIdempotencyRecords.scope, scope), eq(policyIdempotencyRecords.key, key))))[0];
        if (row && row.bodyHash !== hash) throw new RequestError("IDEMPOTENCY_CONFLICT");
        return row?.response ?? null;
    }
    public async Complete(actorId: string, scope: string, key: string, hash: string, result: ApprovalPolicyDTO): Promise<void>
    {
        await this.db.insert(policyIdempotencyRecords).values({ actorId, scope, key, bodyHash: hash, response: result });
    }
    public async Audit(actorId: string, id: string, action: string, before: Record<string, unknown> | null, after: Record<string, unknown>): Promise<void>
    {
        await this.db.insert(configurationAuditEvents).values({ id: randomUUID(), actorId, resourceId: id, action, before, after });
    }

    public Search(kind: "approval-policies", query: ConfigurationSearch): Promise<IPageResult<ApprovalPolicyDTO>>;
    public Search(kind: "reviewer-assignments", query: ConfigurationSearch): Promise<IPageResult<AssignmentRuleDTO>>;
    public Search(kind: "budget-policies", query: ConfigurationSearch): Promise<IPageResult<BudgetPolicyDTO>>;
    public Search(kind: "reviewers", query: ConfigurationSearch): Promise<IPageResult<EligibleReviewer>>;
    public Search(kind: "departments", query: ConfigurationSearch): Promise<IPageResult<DepartmentSummary>>;
    public async Search(kind: ConfigurationKind, query: ConfigurationSearch): Promise<IPageResult<ConfigurationResult>>
    {
        let source: SQL;
        if (kind === "approval-policies") source = sql`select p.id, p.code, coalesce(p.draft->>'typeId', v.type_id::text) as "typeId", case when p.draft is not null then p.draft->>'departmentId' else v.department_id::text end as "departmentId",
            p.is_enabled as "isEnabled", (p.draft is null) as "isPublished", coalesce((p.draft->>'priority')::integer, v.priority) as priority,
            coalesce(p.draft, jsonb_build_object('priority',v.priority,'typeId',v.type_id,'departmentId',v.department_id,'minAmount',v.min_amount::text,'maxAmount',v.max_amount::text,'stages',v.stages)) ||
            jsonb_build_object('id',p.id,'code',p.code,'version',p.version,'isEnabled',p.is_enabled,'isPublished',p.draft is null,
                'versionId',case when p.draft is null then v.id end,'versionNumber',case when p.draft is null then v.version_number end) as data
            from approval_policies p left join approval_policy_versions v on v.id=p.published_version_id`;
        else if (kind === "reviewer-assignments") source = sql`select id, assignment_key as key, department_id::text as "departmentId", is_active as "isActive",
            jsonb_build_object('id',id,'key',assignment_key,'departmentId',department_id,'reviewerUserIds',coalesce(reviewer_user_ids,ARRAY[reviewer_id]),'isActive',is_active,'version',version) as data from reviewer_assignment_rules`;
        else if (kind === "budget-policies") source = sql`select id, type_id::text as "typeId", department_id::text as "departmentId", is_active as "isActive", max_amount as "maxAmount",
            jsonb_build_object('id',id,'typeId',type_id,'departmentId',department_id,'maxAmount',max_amount::text,'isActive',is_active,'version',version) as data from budget_policies`;
        else if (kind === "reviewers") source = sql`select u.id, u.display_name as "displayName", m.department_id::text as "departmentId",
            jsonb_build_object('id',u.id,'displayName',u.display_name,'departmentId',m.department_id) as data
            from users u left join department_memberships m on m.user_id=u.id and m.is_active and m.is_primary
            where u.is_active and exists(select 1 from user_roles r where r.user_id=u.id and r.role_code='REVIEWER')`;
        else source = sql`select id,code,name,is_active as "isActive",jsonb_build_object('id',id,'code',code,'name',name,'isActive',is_active) as data from departments`;
        // All identifiers come from validated endpoint allowlists, never request SQL.
        const predicates: SQL[] = [];
        const escape = (value: string) => value.replace(/[\\%_]/g, "\\$&");
        for (const filter of query.search)
        {
            const column = sql.identifier(filter.name);
            if (filter.condition === "EQUAL") predicates.push(sql`${column} = ${filter.value}`);
            else predicates.push(sql`${column} ilike ${`${filter.condition === "CONTAINS" ? "%" : ""}${escape(String(filter.value))}%`}`);
        }
        if (query.searchTerm)
        {
            const term = `%${escape(query.searchTerm.value)}%`;
            predicates.push(sql`(${sql.join(query.searchTerm.name.split(",").map((name) => sql`${sql.identifier(name)} ilike ${term}`), sql` or `)})`);
        }
        const where = predicates.length ? sql.join(predicates, sql` and `) : sql`true`;
        const total = Number((await this.db.execute<{ count: string }>(sql`select count(*) as count from (${source}) collection where ${where}`))[0]!.count);
        const [field, direction] = query.orderBy.split(" ");
        const rows = await this.db.execute<{ data: unknown }>(sql`select data from (${source}) collection where ${where} order by ${sql.identifier(field!)} ${direction === "desc" ? sql`desc` : sql`asc`}, id asc limit ${query.pageSize} offset ${(query.pageNumber - 1) * query.pageSize}`);
        const schema = kind === "approval-policies" ? approvalPolicySchema : kind === "reviewer-assignments" ? assignmentRuleSchema : kind === "budget-policies" ? budgetPolicySchema : kind === "reviewers" ? eligibleReviewerSchema : departmentSummarySchema;
        const totalPages = Math.ceil(total / query.pageSize);
        return { items: rows.map((row) => schema.parse(row.data)), pagination: { currentPage: query.pageNumber, pageSize: query.pageSize, totalCount: total, totalPages, hasPrevious: query.pageNumber > 1, hasNext: query.pageNumber < totalPages } };
    }
}
export class ConfigurationUnitOfWork implements IConfigurationUnitOfWork
{
    constructor(private readonly db: Connection)
    {
    }
    public async Run<T>(operation: (repository: IConfigurationRepository) => Promise<T>): Promise<T>
    {
        try
        {
            return await this.db.transaction((transaction) => operation(new ConfigurationRepository(transaction)));
        }
        catch (error)
        {
            let current: unknown = error;
            for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++)
            {
                const value = current as { code?: unknown; cause?: unknown };
                if (value.code === "23505") throw new RequestError("CONFLICT", [{ field: "configuration", code: "DUPLICATE_SCOPE", message: "Code, assignment key or active ceiling already exists in this scope." }]);
                current = value.cause;
            }
            throw error;
        }
    }
}
