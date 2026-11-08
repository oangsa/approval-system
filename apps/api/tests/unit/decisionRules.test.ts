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
    expect(decideTransition(item, "slot", { decision: "APPROVE", expectedVersion: 0 })).toMatchObject({ requestStatus: "PENDING", stageComplete: true });
    expect(decideTransition(item, "slot", { decision: "REJECT", reason: "No", expectedVersion: 0 })).toMatchObject({ requestStatus: "REJECTED", currentStageNumber: null });
});
test.each([
    { requesterId: "reviewer" }, { assignedReviewerId: "other" }, { roles: [] }, { isActive: false }, { requestStatus: "APPROVED" }, { currentCycleId: "old" }, { submittedRevisionId: "old" }, { cycleIsActive: false }, { stageStatus: "WAITING" }, { slotStatus: "APPROVED" }, { slotVersion: 1 },
])("rejects invalid decision context %j", (change) =>
{
    const item = state();
    Object.assign(item.context, change);
    expect(() => decideTransition(item, "slot", { decision: "APPROVE", expectedVersion: 0 })).toThrow();
});
test("missing required snapshot slots cannot approve", () =>
{
    const item = state();
    item.stages[0]!.requiredKeys.push("missing");
    expect(() => decideTransition(item, "slot", { decision: "APPROVE", expectedVersion: 0 })).toThrow("INVALID_REQUEST_TRANSITION");
});
test("unsupported RETURN and stage-two execution fail closed", () =>
{
    expect(() => decideTransition(state(), "slot", { decision: "RETURN", reason: "Revise", expectedVersion: 0 })).toThrow("INVALID_REQUEST_TRANSITION");
    const item = state();
    item.stages[0]!.stageNumber = 2;
    expect(() => decideTransition(item, "slot", { decision: "APPROVE", expectedVersion: 0 })).toThrow("INVALID_REQUEST_TRANSITION");
});
