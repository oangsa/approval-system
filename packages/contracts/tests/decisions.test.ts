import { expect, test } from "vitest";
import { decisionReplayRequestSchema, decisionRequestSchema, decisionResultSchema, auditTimelineItemSchema, timelineQuerySchema } from "../src";
const id = "00000000-0000-4000-8000-000000000001";

test.each([
    ["123456789", false],
    ["1234567890", true],
])("Lab 7 NEW rejection boundary %s is accepted=%s", (reason, accepted) =>
{
    expect(decisionRequestSchema.safeParse({ decision: "REJECT", reason, expectedVersion: 0 }).success).toBe(accepted);
});

test("decision schema validates semantic reason, version and exact writable fields", () =>
{
    expect(decisionRequestSchema.parse({ decision: "REJECT", reason: "  Incomplete  ", expectedVersion: 0 }).reason).toBe("Incomplete");
    for (const body of [{ decision: "REJECT", expectedVersion: 0 }, { decision: "REJECT", reason: " \n ", expectedVersion: 0 }, { decision: "INVALID", reason: "later", expectedVersion: 0 }, { decision: "APPROVE", expectedVersion: -1 }, { decision: "APPROVE", expectedVersion: 0, actorId: id }]) expect(decisionRequestSchema.safeParse(body).success).toBe(false);
    expect(decisionRequestSchema.parse({ decision: "APPROVE", expectedVersion: 0 })).toEqual({ decision: "APPROVE", expectedVersion: 0 });
});

test("Lab 7 reason semantics preserve trimming, Unicode units, maximum and other decisions", () =>
{
    for (const reason of [undefined, "", " \n ", "123456789", "😀😀😀😀x", "x".repeat(4001)])
    {
        expect(decisionRequestSchema.safeParse({ decision: "REJECT", reason, expectedVersion: 0 }).success).toBe(false);
    }
    for (const reason of ["1234567890", "12345678901", " 1234567890 ", "😀😀😀😀😀", "e\u0301".repeat(5), "x".repeat(4000), ` ${"x".repeat(4000)} `])
    {
        expect(decisionRequestSchema.parse({ decision: "REJECT", reason, expectedVersion: 0 }).reason).toBe(reason.trim());
    }
    expect(decisionRequestSchema.parse({ decision: "APPROVE", expectedVersion: 0 }).reason).toBeUndefined();
    expect(decisionRequestSchema.parse({ decision: "RETURN", reason: "No", expectedVersion: 0 }).reason).toBe("No");
    expect(decisionReplayRequestSchema.parse({ decision: "REJECT", reason: " No ", expectedVersion: 0 }).reason).toBe("No");
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
