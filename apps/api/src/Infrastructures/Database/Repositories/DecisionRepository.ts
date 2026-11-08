import { randomUUID } from "node:crypto";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { auditTimelineItemSchema, decisionResultSchema, type DecisionRequest, type TimelineQuery } from "@workflow/contracts";
import type { IActor } from "../../../Domains/Identity/Identity";
import { ApprovalTaskError } from "../../../Domains/Approvals/ApprovalTaskRules";
import type { IDecisionRepository, IDecisionUnitOfWork } from "../../../Domains/Approvals/DecisionPorts";
import type { IDecisionState, IDecisionTransition } from "../../../Domains/Approvals/DecisionRules";
import type { Database } from "../Database";
import { approvalCycles, approvalDecisions, approvalSlots, approvalStages, decisionIdempotencyRecords, requestAuditEvents, requestOutboxEvents, requests, users } from "../schema";
import { RequestRepository } from "./RequestRepository";

type Connection = Database["connection"];
type Transaction = Parameters<Parameters<Connection["transaction"]>[0]>[0];
const planSchema = z.object({ policy: z.object({ stages: z.array(z.object({ stageNumber: z.union([z.literal(1), z.literal(2)]), reviewerAssignmentKeys: z.array(z.string()).min(1) })).min(1).max(2) }) });
export class DecisionRepository implements IDecisionRepository
{
    constructor(private readonly db: Transaction)
{}
    public CurrentActor(actor: IActor)
{
 return new RequestRepository(this.db).CurrentActor(actor);
}
    public async Replay(actorId: string, scope: string, key: string, hash: string)
    {
        await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${actorId}:${scope}:${key}`}, 0))`);
        const row = (await this.db.select().from(decisionIdempotencyRecords).where(and(eq(decisionIdempotencyRecords.actorId, actorId), eq(decisionIdempotencyRecords.scope, scope), eq(decisionIdempotencyRecords.key, key))))[0];
        if (!row) return null;
        if (row.bodyHash !== hash) throw new ApprovalTaskError("IDEMPOTENCY_CONFLICT");
        return decisionResultSchema.parse(row.response);
    }
    public async Complete(actorId: string, scope: string, key: string, hash: string, result: import("@workflow/contracts").DecisionResult)
    {
        await this.db.insert(decisionIdempotencyRecords).values({ actorId, scope, key, bodyHash: hash, response: result });
    }
    public async Lock(actor: IActor, taskId: string): Promise<IDecisionState>
    {
        const target = (await this.db.select({ requestId: approvalCycles.requestId }).from(approvalSlots).innerJoin(approvalStages, eq(approvalSlots.stageId, approvalStages.id)).innerJoin(approvalCycles, eq(approvalStages.cycleId, approvalCycles.id)).where(eq(approvalSlots.id, taskId)))[0];
        if (!target) throw new ApprovalTaskError("NOT_FOUND");
        const request = (await this.db.select().from(requests).where(eq(requests.id, target.requestId)).for("update"))[0]!;
        const targetStage = (await this.db.select({ cycleId: approvalStages.cycleId }).from(approvalSlots).innerJoin(approvalStages, eq(approvalSlots.stageId, approvalStages.id)).where(eq(approvalSlots.id, taskId)))[0]!;
        const cycle = (await this.db.select().from(approvalCycles).where(eq(approvalCycles.id, targetStage.cycleId)).for("update"))[0]!;
        const stages = await this.db.select().from(approvalStages).where(eq(approvalStages.cycleId, cycle.id)).orderBy(asc(approvalStages.stageNumber)).for("update");
        const slots = await this.db.select().from(approvalSlots).where(inArray(approvalSlots.stageId, stages.map((item) => item.id))).orderBy(asc(approvalSlots.id)).for("update");
        const slot = slots.find((item) => item.id === taskId)!;
        const stage = stages.find((item) => item.id === slot.stageId)!;
        // Do not reveal configuration or state to foreign actors.
        if (actor.account.id === request.requesterId) throw new ApprovalTaskError("SELF_APPROVAL_FORBIDDEN");
        if (slot.reviewerId !== actor.account.id) throw new ApprovalTaskError("NOT_FOUND");
        const plan = planSchema.safeParse(cycle.snapshot);
        if (!plan.success || plan.data.policy.stages.length !== stages.length) throw new ApprovalTaskError("INVALID_REQUEST_TRANSITION");
        return { requestId: request.id, cycleId: cycle.id, revisionId: cycle.revisionId, requestVersion: request.version,
            stages: stages.map((item) => ({ ...item, requiredKeys: plan.data.policy.stages.find((configured) => configured.stageNumber === item.stageNumber)?.reviewerAssignmentKeys ?? [] })), slots,
            context: { actorId: actor.account.id, roles: actor.roles, isActive: actor.account.isActive, requesterId: request.requesterId, requestStatus: request.status,
                currentCycleId: request.currentCycleId, slotCycleId: cycle.id, cycleIsActive: cycle.isActive, slotRevisionId: cycle.revisionId,
                submittedRevisionId: request.submittedRevisionId, stageStatus: stage.status, slotStatus: slot.status, assignedReviewerId: slot.reviewerId,
                expectedVersion: slot.version, slotVersion: slot.version } };
    }
    public async Save(actorId: string, taskId: string, body: DecisionRequest, state: IDecisionState, transition: IDecisionTransition)
    {
        const decisionId = randomUUID(), now = new Date();
        await this.db.insert(approvalDecisions).values({ id: decisionId, slotId: taskId, actorId, decision: body.decision === "APPROVE" ? "APPROVE" : "REJECT", reason: body.reason ?? null, decidedAt: now });
        await this.db.update(approvalSlots).set({ status: body.decision === "APPROVE" ? "APPROVED" : "REJECTED", version: body.expectedVersion + 1 }).where(eq(approvalSlots.id, taskId));
        if (transition.stageComplete) await this.db.update(approvalStages).set({ status: body.decision === "REJECT" ? "REJECTED" : "COMPLETED" }).where(eq(approvalStages.id, transition.stageId));
        if (transition.requestStatus !== "PENDING")
        {
            await this.db.update(approvalCycles).set({ isActive: false }).where(eq(approvalCycles.id, state.cycleId));
            const unfinished = state.slots.filter((item) => item.id !== taskId && ["ACTIONABLE", "WAITING"].includes(item.status));
            if (unfinished.length) await this.db.update(approvalSlots).set({ status: "CANCELLED", version: sql`${approvalSlots.version} + 1` }).where(inArray(approvalSlots.id, unfinished.map((item) => item.id)));
            await this.db.update(approvalStages).set({ status: "CANCELLED" }).where(and(eq(approvalStages.cycleId, state.cycleId), inArray(approvalStages.status, ["ACTIVE", "WAITING"])));
        }
        await this.db.update(requests).set({ status: transition.requestStatus, version: state.requestVersion + 1, updatedAt: now }).where(eq(requests.id, state.requestId));
        await this.db.insert(requestAuditEvents).values({ id: randomUUID(), requestId: state.requestId, actorId, eventType: `DECISION_${body.decision}`, revisionId: state.revisionId, cycleId: state.cycleId, decisionId, occurredAt: now });
        if (transition.requestStatus !== state.context.requestStatus)
        {
            await this.db.insert(requestAuditEvents).values({ id: randomUUID(), requestId: state.requestId, actorId, eventType: `REQUEST_${transition.requestStatus}`, revisionId: state.revisionId, cycleId: state.cycleId, occurredAt: now });
        }
        await this.db.insert(requestOutboxEvents).values({ id: randomUUID(), eventKey: `decision:${decisionId}`, eventType: `DECISION_${body.decision}`, payload: { requestId: state.requestId, cycleId: state.cycleId } });
        return decisionResultSchema.parse({ taskId, slotId: taskId, decisionId, decision: body.decision, decidedBy: actorId, decidedAt: now.toISOString(), requestStatus: transition.requestStatus,
            currentStageNumber: transition.currentStageNumber, requestVersion: state.requestVersion + 1, taskVersion: body.expectedVersion + 1 });
    }
    public async Timeline(actor: IActor, requestId: string, query: TimelineQuery)
    {
        // Keep participant scope, count and page stable against a concurrent decision.
        await this.db.select({ id: requests.id }).from(requests).where(eq(requests.id, requestId)).for("share");
        const detail = await new RequestRepository(this.db).Read(requestId);
        if (!detail) throw new ApprovalTaskError("NOT_FOUND");
        const current = detail.requester.id === actor.account.id || actor.roles.includes("REVIEWER") && detail.status === "PENDING" && detail.currentApprovers.some((item) => item.reviewer.id === actor.account.id && ["ACTIONABLE", "WAITING"].includes(item.status));
        const scope = current ? eq(requestAuditEvents.requestId, requestId) : and(eq(requestAuditEvents.requestId, requestId), eq(requestAuditEvents.actorId, actor.account.id), sql`${requestAuditEvents.decisionId} is not null`);
        // Historical access is restricted to the actor's exact handled decision.
        const total = (await this.db.select({ value: count() }).from(requestAuditEvents).where(scope))[0]!.value;
        if (!current && !total) throw new ApprovalTaskError("NOT_FOUND");
        const rows = await this.db.select({ event: requestAuditEvents, actor: { id: users.id, displayName: users.displayName }, decision: approvalDecisions }).from(requestAuditEvents)
            .innerJoin(users, eq(requestAuditEvents.actorId, users.id)).leftJoin(approvalDecisions, eq(requestAuditEvents.decisionId, approvalDecisions.id))
            .where(scope).orderBy(asc(requestAuditEvents.occurredAt), asc(requestAuditEvents.id)).limit(query.pageSize).offset((query.pageNumber - 1) * query.pageSize);
        const items = rows.map(({ event, actor: eventActor, decision }) => auditTimelineItemSchema.parse({ id: event.id, requestId, cycleId: event.cycleId, revisionId: event.revisionId, eventType: event.eventType, actor: eventActor, occurredAt: event.occurredAt.toISOString(), note: decision?.reason ?? null,
            metadata: decision ? { decision: decision.decision, slotId: decision.slotId } : {} }));
        const totalPages = Math.ceil(total / query.pageSize);
        return { items, pagination: { currentPage: query.pageNumber, pageSize: query.pageSize, totalPages, totalCount: total, hasPrevious: query.pageNumber > 1, hasNext: query.pageNumber < totalPages } };
    }
}
export class DecisionUnitOfWork implements IDecisionUnitOfWork
{
    constructor(private readonly db: Connection)
{}
    public Run<T>(operation: (repository: IDecisionRepository) => Promise<T>): Promise<T>
    {
        return this.db.transaction((tx) => operation(new DecisionRepository(tx)));
    }
}
