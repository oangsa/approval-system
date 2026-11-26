import { expect, test } from "vitest";
import { decideTransition, type IDecisionState } from "../../src/Domains/Approvals/DecisionRules";
function state(): IDecisionState
{
    return { requestId: "request", cycleId: "cycle", revisionId: "revision", requestVersion: 1,
        context: { actorId: "reviewer", roles: ["REVIEWER"], isActive: true, requesterId: "owner", requestStatus: "PENDING", currentCycleId: "cycle", slotCycleId: "cycle", cycleIsActive: true, slotRevisionId: "revision", submittedRevisionId: "revision", stageStatus: "ACTIVE", slotStatus: "ACTIONABLE", assignedReviewerId: "reviewer", expectedVersion: 0, slotVersion: 0 },
        stages: [{ id: "stage", stageNumber: 1, status: "ACTIVE", requiredKeys: ["review"] }], slots: [{ id: "slot", stageId: "stage", assignmentKey: "review", status: "ACTIONABLE", version: 0 }] };
}
test("ALL votes, future stages and rejection never prematurely finalize", () =>
{
    const item = state();
    expect(decideTransition(item, "slot", { decision: "APPROVE", expectedVersion: 0 }).requestStatus).toBe("APPROVED");
    item.stages[0]!.requiredKeys.push("peer");
    item.slots.push({ id: "peer", stageId: "stage", assignmentKey: "peer", status: "ACTIONABLE", version: 0 });
    expect(decideTransition(item, "slot", { decision: "APPROVE", expectedVersion: 0 })).toMatchObject({ requestStatus: "PENDING", stageComplete: false });
    item.slots[1]!.status = "APPROVED";
    item.stages.push({ id: "future", stageNumber: 2, status: "WAITING", requiredKeys: ["future"] });
    item.slots.push({ id: "future", stageId: "future", assignmentKey: "future", status: "WAITING", version: 0 });
    expect(decideTransition(item, "slot", { decision: "APPROVE", expectedVersion: 0 })).toMatchObject({ requestStatus: "PENDING", stageComplete: true, currentStageNumber: 2 });
    expect(decideTransition(item, "slot", { decision: "REJECT", reason: "Missing information", expectedVersion: 0 })).toMatchObject({ requestStatus: "REJECTED", currentStageNumber: null });
});

test("Lab 7 domain enforces the trimmed rejection minimum and maximum", () =>
{
    for (const reason of [undefined, "", " \n ", "123456789", "😀😀😀😀x", "x".repeat(4001)])
    {
        expect(() => decideTransition(state(), "slot", { decision: "REJECT", reason, expectedVersion: 0 })).toThrow("VALIDATION_ERROR");
    }
    for (const reason of ["1234567890", "12345678901", " 1234567890 ", "😀😀😀😀😀", "e\u0301".repeat(5), "x".repeat(4000), ` ${"x".repeat(4000)} `])
    {
        expect(decideTransition(state(), "slot", { decision: "REJECT", reason, expectedVersion: 0 }).requestStatus).toBe("REJECTED");
    }
});
test.each([
    { requesterId: "reviewer" }, { assignedReviewerId: "other" }, { roles: [] }, { isActive: false }, { requestStatus: "APPROVED" }, { currentCycleId: "old" }, { submittedRevisionId: "old" }, { cycleIsActive: false }, { stageStatus: "WAITING" }, { slotStatus: "APPROVED" }, { slotVersion: 1 },
])("rejects invalid decision context %j", (change) =>
{
    const item = state();
    Object.assign(item.context, change);
    expect(() => decideTransition(item, "slot", { decision: "APPROVE", expectedVersion: 0 })).toThrow();
    expect(() => decideTransition(item, "slot", { decision: "REJECT", reason: "1234567890", expectedVersion: 0 })).toThrow();
});
test("missing required snapshot slots cannot approve", () =>
{
    const item = state();
    item.stages[0]!.requiredKeys.push("missing");
    expect(() => decideTransition(item, "slot", { decision: "APPROVE", expectedVersion: 0 })).toThrow("INVALID_REQUEST_TRANSITION");
});
test("RETURN and unsupported stage-two approval", () =>
{
    expect(decideTransition(state(), "slot", { decision: "RETURN", reason: "Revise", expectedVersion: 0 }).requestStatus).toBe("RETURNED");
    const item = state();
    item.stages[0]!.stageNumber = 2;
    expect(() => decideTransition(item, "slot", { decision: "APPROVE", expectedVersion: 0 })).toThrow("INVALID_REQUEST_TRANSITION");
});

test("two-stage partial approval stays pending and the completing vote advances", () =>
{
    const item = state();
    item.stages.push({ id: "future", stageNumber: 2, status: "WAITING", requiredKeys: ["future"] });
    item.slots.push({ id: "future", stageId: "future", assignmentKey: "future", status: "WAITING", version: 0 });
    expect(decideTransition(item, "slot", { decision: "APPROVE", expectedVersion: 0 })).toMatchObject({ requestStatus: "PENDING", stageComplete: true, currentStageNumber: 2 });
    item.stages[0]!.requiredKeys.push("peer");
    item.slots.push({ id: "peer", stageId: "stage", assignmentKey: "peer", status: "ACTIONABLE", version: 0 });
    expect(decideTransition(item, "slot", { decision: "APPROVE", expectedVersion: 0 })).toMatchObject({ requestStatus: "PENDING", stageComplete: false, currentStageNumber: 1 });
    item.slots[2]!.status = "APPROVED";
    expect(decideTransition(item, "slot", { decision: "APPROVE", expectedVersion: 0 })).toMatchObject({ requestStatus: "PENDING", stageComplete: true, currentStageNumber: 2 });
});

test("RR-AC-01b RETURN permits valid active stage two and rejects invalid reasons", () =>
{
    const item = state();
    item.stages[0]!.status = "COMPLETED";
    item.slots[0]!.status = "APPROVED";
    item.stages.push({ id: "second", stageNumber: 2, status: "ACTIVE", requiredKeys: ["second"] });
    item.slots.push({ id: "second-slot", stageId: "second", assignmentKey: "second", status: "ACTIONABLE", version: 0 });
    expect(decideTransition(item, "second-slot", { decision: "RETURN", reason: "Fix", expectedVersion: 0 })).toMatchObject({ requestStatus: "RETURNED", stageId: "second" });
    for (const reason of [undefined, " ", "x".repeat(4001)]) expect(() => decideTransition(item, "second-slot", { decision: "RETURN", reason, expectedVersion: 0 })).toThrow("VALIDATION_ERROR");
    item.stages[0]!.status = "ACTIVE";
    expect(() => decideTransition(item, "second-slot", { decision: "RETURN", reason: "Fix", expectedVersion: 0 })).toThrow("APPROVAL_TASK_STALE");
});

test("stage two ALL completes only after each slot approves", () =>
{
    const item = state();
    item.stages[0]!.status = "COMPLETED";
    item.slots[0]!.status = "APPROVED";
    item.stages.push({ id: "second", stageNumber: 2, status: "ACTIVE", requiredKeys: ["a", "b"] });
    item.slots.push({ id: "a", stageId: "second", assignmentKey: "a", status: "ACTIONABLE", version: 0 }, { id: "b", stageId: "second", assignmentKey: "b", status: "ACTIONABLE", version: 0 });
    expect(decideTransition(item, "a", { decision: "APPROVE", expectedVersion: 0 })).toMatchObject({ requestStatus: "PENDING", currentStageNumber: 2 });
    item.slots[2]!.status = "APPROVED";
    expect(decideTransition(item, "a", { decision: "APPROVE", expectedVersion: 0 })).toMatchObject({ requestStatus: "APPROVED", currentStageNumber: null });
});

test("rejects slots outside snapshot and incomplete predecessors", () =>
{
    const item = state();
    item.slots.push({ id: "extra", stageId: "stage", assignmentKey: "unexpected", status: "APPROVED", version: 0 });
    expect(() => decideTransition(item, "slot", { decision: "APPROVE", expectedVersion: 0 })).toThrow("INVALID_REQUEST_TRANSITION");
    item.slots.pop();
    item.stages[0]!.status = "COMPLETED";
    item.stages.push({ id: "second", stageNumber: 2, status: "ACTIVE", requiredKeys: ["next"] });
    item.slots.push({ id: "next", stageId: "second", assignmentKey: "next", status: "ACTIONABLE", version: 0 });
    expect(() => decideTransition(item, "next", { decision: "APPROVE", expectedVersion: 0 })).toThrow("APPROVAL_TASK_STALE");
});
