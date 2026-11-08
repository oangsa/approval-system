import { expect, test } from "vitest";
import { decisionRequestSchema, decisionResultSchema, auditTimelineItemSchema, timelineQuerySchema } from "../src";
const id = "00000000-0000-4000-8000-000000000001";
test("decision schema validates semantic reason, version and exact writable fields", () =>
{
    expect(decisionRequestSchema.parse({ decision: "REJECT", reason: "  Incomplete  ", expectedVersion: 0 }).reason).toBe("Incomplete");
    for (const body of [{ decision: "REJECT", expectedVersion: 0 }, { decision: "REJECT", reason: " \n ", expectedVersion: 0 }, { decision: "INVALID", reason: "later", expectedVersion: 0 }, { decision: "APPROVE", expectedVersion: -1 }, { decision: "APPROVE", expectedVersion: 0, actorId: id }]) expect(decisionRequestSchema.safeParse(body).success).toBe(false);
    expect(decisionRequestSchema.parse({ decision: "APPROVE", expectedVersion: 0 })).toEqual({ decision: "APPROVE", expectedVersion: 0 });
});
test("exact decision and UTC timeline DTOs and bounded paging", () =>
{
    const result = { taskId: id, slotId: id, decisionId: id, decision: "APPROVE", decidedBy: id, decidedAt: "2026-11-08T00:00:00Z", requestStatus: "APPROVED", currentStageNumber: null, requestVersion: 2, taskVersion: 1 };
    expect(decisionResultSchema.parse(result)).toEqual(result);
    expect(decisionResultSchema.safeParse({ ...result, secret: "no" }).success).toBe(false);
    const item = { id, requestId: id, cycleId: id, revisionId: id, eventType: "DECISION_APPROVE", actor: { id, displayName: "Reviewer" }, occurredAt: result.decidedAt, note: null, metadata: { decision: "APPROVE", slotId: id } };
    expect(auditTimelineItemSchema.parse(item)).toEqual(item);
    expect(auditTimelineItemSchema.safeParse({ ...item, occurredAt: "2026-11-08T07:00:00+07:00" }).success).toBe(false);
    expect(timelineQuerySchema.parse({})).toEqual({ pageNumber: 1, pageSize: 20 });
    for (const query of [{ pageSize: 101 }, { pageNumber: 0 }, { actorId: id }]) expect(timelineQuerySchema.safeParse(query).success).toBe(false);
});
