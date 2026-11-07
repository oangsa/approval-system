import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { itemTotal, requestDetailSchema, requestSummarySchema, type CreateRequest, type RequestRevision, type RequestTypeSearch, type RequestSearchQuery } from "@workflow/contracts";
import { isCurrentIdentity, type IActor } from "../../../Domains/Identity/Identity";
import type { IRequestRepository, IRequestUnitOfWork } from "../../../Domains/Requests/Ports";
import { businessDueAt, RequestError, type IConfiguration, type IPlan } from "../../../Domains/Requests/RequestRules";
import type { Database } from "../Database";
import { IdentityRepository } from "./IdentityRepository";
import { approvalCycles, approvalPolicyVersions, approvalSlots, approvalStages, budgetPolicies, departmentMemberships, departments, idempotencyRecords, requestAuditEvents, requestItems, requestOutboxEvents, requestRevisions, requests, requestTypes, requestTypeVersions, reviewerAssignmentRules, userRoles, users } from "../schema";

type Connection = Database["connection"];
type Transaction = Parameters<Parameters<Connection["transaction"]>[0]>[0];
export class RequestRepository implements IRequestRepository
{
    constructor(private readonly db: Transaction)
    {
    }
    public async CurrentActor(actor: IActor): Promise<IActor>
    {
        const identity = new IdentityRepository(this.db);
        await identity.LockUser(actor.account.id);
        const current = await identity.ReadCurrentIdentity(actor.account.id, actor.family.id);
        if (!current || !current.roles.length || !isCurrentIdentity(current, actor.account.authVersion, new Date())) throw new RequestError("UNAUTHENTICATED");
        return current;
    }
    public async Replay(actorId: string, scope: string, key: string, bodyHash: string)
    {
        await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${actorId}:${scope}:${key}`}, 0))`);
        const row = (await this.db.select().from(idempotencyRecords).where(and(eq(idempotencyRecords.actorId, actorId), eq(idempotencyRecords.scope, scope), eq(idempotencyRecords.key, key))))[0];
        if (!row) return null;
        if (row.bodyHash !== bodyHash) throw new RequestError("IDEMPOTENCY_CONFLICT");
        return requestDetailSchema.parse(row.response);
    }
    public async Complete(actorId: string, scope: string, key: string, bodyHash: string, result: import("@workflow/contracts").RequestDetail): Promise<void>
    {
        await this.db.insert(idempotencyRecords).values({ actorId, scope, key, bodyHash, response: result });
    }
    private async Revision(id: string | null): Promise<RequestRevision | null>
    {
        if (!id) return null;
        const revision = (await this.db.select().from(requestRevisions).where(eq(requestRevisions.id, id)))[0]!;
        const items = await this.db.select().from(requestItems).where(eq(requestItems.revisionId, id)).orderBy(asc(requestItems.id));
        return { id, revisionNumber: revision.revisionNumber, formDefinitionVersionId: revision.formDefinitionVersionId, fields: revision.fields, amount: revision.amount, currency: revision.currency,
            submittedAt: revision.submittedAt?.toISOString() ?? null, submittedBy: revision.submittedBy,
            lineItems: items.map(({ id, description, quantity, unitAmount, totalAmount }) => ({ id, description, quantity, unitAmount, totalAmount })) };
    }
    public async Read(id: string, lock = false)
    {
        const query = this.db.select().from(requests).where(eq(requests.id, id));
        const row = (await (lock ? query.for("update") : query))[0];
        if (!row) return null;
        const owner = (await this.db.select().from(users).where(eq(users.id, row.requesterId)))[0]!;
        const roles = await this.db.select().from(userRoles).where(eq(userRoles.userId, owner.id));
        const type = (await this.db.select().from(requestTypes).where(eq(requestTypes.id, row.typeId)))[0]!;
        const slots = row.currentCycleId ? await this.db.select({ slot: approvalSlots, stage: approvalStages, reviewer: { id: users.id, displayName: users.displayName } })
            .from(approvalStages).innerJoin(approvalSlots, eq(approvalSlots.stageId, approvalStages.id)).innerJoin(users, eq(users.id, approvalSlots.reviewerId)).where(eq(approvalStages.cycleId, row.currentCycleId)).orderBy(asc(approvalStages.stageNumber), asc(approvalSlots.id)) : [];
        const workingRevision = await this.Revision(row.workingRevisionId);
        const submittedRevision = await this.Revision(row.submittedRevisionId);
        return requestDetailSchema.parse({
            id: row.id, requestNumber: row.requestNumber, typeId: row.typeId, typeCode: type.code, title: row.title, justification: row.justification, priority: row.priority, status: row.status,
            requester: { id: owner.id, displayName: owner.displayName, email: owner.email, roles: roles.map((item) => item.roleCode), isActive: owner.isActive, department: row.departmentSnapshot },
            department: row.departmentSnapshot, revisionNumber: submittedRevision?.revisionNumber ?? null, currentCycleId: row.currentCycleId,
            createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), submittedAt: row.submittedAt?.toISOString() ?? null, version: row.version,
            workingRevision, submittedRevision, currentStageNumber: slots.find((item) => item.stage.status === "ACTIVE")?.stage.stageNumber ?? null,
            currentApprovers: slots.map(({ slot, stage, reviewer }) => ({ slotId: slot.id, stageNumber: stage.stageNumber, reviewer, status: slot.status })), availableActions: row.status === "DRAFT" ? ["EDIT_DRAFT", "SUBMIT"] : [],
        });
    }
    public async Search(ownerId: string, query: RequestSearchQuery)
    {
        const columns = { status: requests.status, typeId: requests.typeId, priority: requests.priority, createdAt: requests.createdAt, updatedAt: requests.updatedAt, submittedAt: requests.submittedAt, requestNumber: requests.requestNumber, title: requests.title };
        const predicates = [eq(requests.requesterId, ownerId)];
        const escape = (value: string) => value.replace(/[\\%_]/g, "\\$&");
        for (const filter of query.search)
        {
            const column = columns[filter.name];
            if (filter.condition === "ISNULL") predicates.push(sql`${column} is null`);
            else if (filter.condition === "ISNOTNULL") predicates.push(sql`${column} is not null`);
            else if (filter.condition === "CONTAINS" || filter.condition === "STARTWITH") predicates.push(ilike(column, `${filter.condition === "CONTAINS" ? "%" : ""}${escape(filter.value)}%`));
            else if ("value" in filter)
            {
                const value = filter.value;
                switch (filter.condition)
                {
                    case "EQUAL": predicates.push(sql`${column} = ${value}`); break;
                    case "NOTEQUAL": predicates.push(sql`${column} <> ${value}`); break;
                    case "GREATER": predicates.push(sql`${column} > ${value}`); break;
                    case "LESSER": predicates.push(sql`${column} < ${value}`); break;
                    case "GREATEROREQUAL": predicates.push(sql`${column} >= ${value}`); break;
                    case "LESSEROREQUAL": predicates.push(sql`${column} <= ${value}`); break;
                }
            }
        }
        if (query.searchTerm)
        {
            const term = `%${escape(query.searchTerm.value)}%`;
            predicates.push(or(...query.searchTerm.name.split(",").map((name) => ilike(name === "title" ? requests.title : requests.requestNumber, term)))!);
        }
        const where = and(...predicates);
        const [field, direction] = query.orderBy.split(" ") as ["updatedAt" | "createdAt" | "submittedAt" | "requestNumber" | "title", "asc" | "desc"];
        const order = direction === "asc" ? sql`${columns[field]} asc nulls last` : sql`${columns[field]} desc nulls last`;
        const total = (await this.db.select({ count: count() }).from(requests).where(where))[0]!.count;
        const rows = await this.db.select({ request: requests, typeCode: requestTypes.code, revisionNumber: requestRevisions.revisionNumber }).from(requests)
            .innerJoin(requestTypes, eq(requestTypes.id, requests.typeId)).leftJoin(requestRevisions, eq(requestRevisions.id, requests.submittedRevisionId))
            .where(where).orderBy(order, asc(requests.id)).limit(query.pageSize).offset((query.pageNumber - 1) * query.pageSize);
        const owner = (await this.db.select().from(users).where(eq(users.id, ownerId)))[0]!;
        const roles = await this.db.select().from(userRoles).where(eq(userRoles.userId, ownerId));
        const items = rows.map(({ request: row, typeCode, revisionNumber }) => requestSummarySchema.parse({
            id: row.id, requestNumber: row.requestNumber, typeId: row.typeId, typeCode, title: row.title, priority: row.priority, status: row.status,
            requester: { id: owner.id, displayName: owner.displayName, email: owner.email, roles: roles.map((role) => role.roleCode), isActive: owner.isActive, department: row.departmentSnapshot },
            department: row.departmentSnapshot, revisionNumber, currentCycleId: row.currentCycleId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), submittedAt: row.submittedAt?.toISOString() ?? null, version: row.version,
        }));
        const totalPages = Math.ceil(total / query.pageSize);
        return { items, pagination: { currentPage: query.pageNumber, pageSize: query.pageSize, totalPages, totalCount: total, hasPrevious: query.pageNumber > 1, hasNext: query.pageNumber < totalPages } };
    }
    public async Configuration(typeId: string, versionId: string, actorId: string): Promise<IConfiguration>
    {
        const type = (await this.db.select().from(requestTypes).where(eq(requestTypes.id, typeId)).for("share"))[0];
        const version = (await this.db.select().from(requestTypeVersions).where(and(eq(requestTypeVersions.id, versionId), eq(requestTypeVersions.typeId, typeId))).for("share"))[0];
        if (!type || !version) throw new RequestError("NOT_FOUND");
        const membership = (await this.db.select().from(departmentMemberships).where(and(eq(departmentMemberships.userId, actorId), eq(departmentMemberships.isActive, true), eq(departmentMemberships.isPrimary, true))).for("share"))[0];
        const department = membership ? (await this.db.select().from(departments).where(eq(departments.id, membership.departmentId)).for("share"))[0] ?? null : null;
        const policies = await this.db.select().from(approvalPolicyVersions).where(and(eq(approvalPolicyVersions.typeId, typeId), eq(approvalPolicyVersions.isActive, true))).orderBy(asc(approvalPolicyVersions.id)).for("share");
        const rules = department ? await this.db.select().from(reviewerAssignmentRules).where(and(eq(reviewerAssignmentRules.departmentId, department.id), eq(reviewerAssignmentRules.isActive, true))).orderBy(asc(reviewerAssignmentRules.id)).for("share") : [];
        const reviewerIds = [...new Set(rules.map((rule) => rule.reviewerId))].sort();
        const reviewers = reviewerIds.length ? await this.db.select().from(users).where(inArray(users.id, reviewerIds)).orderBy(asc(users.id)).for("share") : [];
        const roles = reviewerIds.length ? await this.db.select().from(userRoles).where(inArray(userRoles.userId, reviewerIds)).for("share") : [];
        const budgets = await this.db.select().from(budgetPolicies).where(and(eq(budgetPolicies.typeId, typeId), eq(budgetPolicies.isActive, true))).for("share");
        return { definition: version.definition, activeVersionId: type.publishedVersionId, isEnabled: type.isEnabled, department, policies, budgets,
            assignments: rules.map((rule) => ({ ...rule, displayName: reviewers.find((user) => user.id === rule.reviewerId)?.displayName ?? "", isEligible: !!reviewers.find((user) => user.id === rule.reviewerId)?.isActive && roles.some((role) => role.userId === rule.reviewerId && role.roleCode === "REVIEWER") })) };
    }
    private async Items(revisionId: string, content: CreateRequest): Promise<void>
    {
        const items = (content.lineItems ?? []).map((item) => ({ ...item, id: randomUUID(), revisionId, totalAmount: itemTotal(item.quantity, item.unitAmount) }));
        if (items.length) await this.db.insert(requestItems).values(items);
    }
    public async Create(actor: IActor, content: CreateRequest, amount: string | null): Promise<string>
    {
        const id = randomUUID();
        const revisionId = randomUUID();
        await this.db.insert(requests).values({ id, requesterId: actor.account.id, typeId: content.typeId, title: content.title ?? "", justification: content.justification ?? "", priority: content.priority ?? "MEDIUM" });
        await this.db.insert(requestRevisions).values({ id: revisionId, requestId: id, typeId: content.typeId, formDefinitionVersionId: content.formDefinitionVersionId, revisionNumber: 1, fields: content.fields ?? {}, amount, currency: amount === null ? null : "THB" });
        await this.Items(revisionId, content);
        await this.db.update(requests).set({ workingRevisionId: revisionId }).where(eq(requests.id, id));
        await this.db.insert(requestAuditEvents).values({ id: randomUUID(), requestId: id, actorId: actor.account.id, eventType: "REQUEST_CREATED", revisionId });
        return id;
    }
    public async Patch(id: string, actorId: string, content: CreateRequest, amount: string | null): Promise<void>
    {
        const row = (await this.db.select().from(requests).where(eq(requests.id, id)))[0]!;
        await this.db.update(requestRevisions).set({ fields: content.fields ?? {}, formDefinitionVersionId: content.formDefinitionVersionId, amount, currency: amount === null ? null : "THB" }).where(eq(requestRevisions.id, row.workingRevisionId!));
        await this.db.delete(requestItems).where(eq(requestItems.revisionId, row.workingRevisionId!));
        await this.Items(row.workingRevisionId!, content);
        await this.db.update(requests).set({ title: content.title ?? "", justification: content.justification ?? "", priority: content.priority ?? "MEDIUM", version: row.version + 1, updatedAt: new Date() }).where(eq(requests.id, id));
        await this.db.insert(requestAuditEvents).values({ id: randomUUID(), requestId: id, actorId, eventType: "DRAFT_UPDATED", revisionId: row.workingRevisionId });
    }
    public async Submit(id: string, actorId: string, plan: IPlan): Promise<void>
    {
        const row = (await this.db.select().from(requests).where(eq(requests.id, id)))[0]!;
        const revisionId = row.workingRevisionId!;
        const cycleId = randomUUID();
        const now = new Date();
        const numbers = await this.db.execute<{ value: string }>(sql`select nextval('request_number_sequence')::text as value`);
        const number = `REQ-${String(numbers[0]!.value).padStart(8, "0")}`;
        await this.db.update(requestRevisions).set({ submittedAt: now, submittedBy: actorId }).where(eq(requestRevisions.id, revisionId));
        await this.db.insert(approvalCycles).values({ id: cycleId, requestId: id, revisionId, policyVersionId: plan.policy.id, snapshot: { policy: plan.policy, assignments: plan.assignments, department: plan.department, title: row.title, justification: row.justification, priority: row.priority } });
        for (const stage of plan.policy.stages)
        {
            const stageId = randomUUID();
            const active = stage.stageNumber === 1;
            await this.db.insert(approvalStages).values({ id: stageId, cycleId, stageNumber: stage.stageNumber, status: active ? "ACTIVE" : "WAITING", slaBusinessMinutes: stage.slaBusinessMinutes });
            for (const key of stage.reviewerAssignmentKeys)
            {
                const assignment = plan.assignments.find((item) => item.assignmentKey === key)!;
                await this.db.insert(approvalSlots).values({ id: randomUUID(), stageId, assignmentKey: key, reviewerId: assignment.reviewerId, status: active ? "ACTIONABLE" : "WAITING", dueAt: active ? businessDueAt(now, stage.slaBusinessMinutes) : null });
            }
        }
        await this.db.update(requests).set({ status: "PENDING", requestNumber: number, departmentId: plan.department.id, departmentSnapshot: plan.department, submittedAt: now, updatedAt: now, version: row.version + 1, workingRevisionId: null, submittedRevisionId: revisionId, currentCycleId: cycleId }).where(eq(requests.id, id));
        await this.db.insert(requestAuditEvents).values({ id: randomUUID(), requestId: id, actorId, eventType: "REQUEST_SUBMITTED", revisionId, cycleId });
        await this.db.insert(requestOutboxEvents).values({ id: randomUUID(), eventKey: `REQUEST_SUBMITTED:${cycleId}`, eventType: "REQUEST_SUBMITTED", payload: { requestId: id, cycleId } });
    }
    public async TypeVersion(id: string, versionId: string)
    {
        const row = (await this.db.select({ definition: requestTypeVersions.definition }).from(requestTypeVersions).where(and(eq(requestTypeVersions.typeId, id), eq(requestTypeVersions.id, versionId))))[0];
        return row?.definition ?? null;
    }
    public async Type(id: string)
    {
        const row = (await this.db.select({ definition: requestTypeVersions.definition }).from(requestTypes).innerJoin(requestTypeVersions, eq(requestTypes.publishedVersionId, requestTypeVersions.id)).where(and(eq(requestTypes.id, id), eq(requestTypes.isEnabled, true))))[0];
        return row?.definition ?? null;
    }
    public async Types(query: RequestTypeSearch)
    {
        const predicates = [eq(requestTypes.isEnabled, true)];
        for (const filter of query.search)
        {
            predicates.push(filter.name === "code" ? eq(requestTypes.code, String(filter.value)) : eq(requestTypes.isEnabled, filter.value === true));
        }
        if (query.searchTerm)
        {
            const term = `%${query.searchTerm.value.replace(/[\\%_]/g, "\\$&")}%`;
            const columns = query.searchTerm.name.split(",");
            predicates.push(or(...columns.map((column) => column === "code" ? ilike(requestTypes.code, term) : or(ilike(sql`${requestTypeVersions.definition}->'name'->>'en'`, term), ilike(sql`${requestTypeVersions.definition}->'name'->>'th'`, term))))!);
        }
        const where = and(...predicates);
        const order = query.orderBy.endsWith("desc") ? desc : asc;
        const field = query.orderBy.startsWith("name") ? sql`${requestTypeVersions.definition}->'name'->>'en'` : requestTypes.code;
        const total = (await this.db.select({ count: count() }).from(requestTypes).innerJoin(requestTypeVersions, eq(requestTypes.publishedVersionId, requestTypeVersions.id)).where(where))[0]!.count;
        const rows = await this.db.select({ definition: requestTypeVersions.definition }).from(requestTypes).innerJoin(requestTypeVersions, eq(requestTypes.publishedVersionId, requestTypeVersions.id)).where(where).orderBy(order(field), asc(requestTypes.id)).limit(query.pageSize).offset((query.pageNumber - 1) * query.pageSize);
        const totalPages = Math.ceil(total / query.pageSize);
        return { items: rows.map((row) => row.definition), pagination: { currentPage: query.pageNumber, pageSize: query.pageSize, totalPages, totalCount: total, hasPrevious: query.pageNumber > 1, hasNext: query.pageNumber < totalPages } };
    }
}
export class RequestUnitOfWork implements IRequestUnitOfWork
{
    constructor(private readonly db: Connection)
    {
    }
    public Run<T>(operation: (repository: IRequestRepository) => Promise<T>): Promise<T>
    {
        return this.db.transaction((tx) => operation(new RequestRepository(tx)));
    }
}
