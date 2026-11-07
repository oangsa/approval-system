import { describe, expect, it } from "vitest";
import { ApprovalTaskError, AssertReviewerCanDecide, CanReadCurrentTask, type IReviewerDecisionContext } from "../../src/Domains/Approvals/ApprovalTaskRules";

const eligible: IReviewerDecisionContext = { actorId: "reviewer", roles: ["REVIEWER"], isActive: true, requesterId: "owner", requestStatus: "PENDING", currentCycleId: "cycle", slotCycleId: "cycle", slotRevisionId: "revision", submittedRevisionId: "revision", stageStatus: "ACTIVE", slotStatus: "ACTIONABLE", assignedReviewerId: "reviewer", expectedVersion: 1, slotVersion: 1 };
describe("reviewer decision guard", () =>
{
    it("accepts a current assigned reviewer", () => expect(() => AssertReviewerCanDecide(eligible)).not.toThrow());
    it.each([
        [{ requesterId: "reviewer", roles: ["REQUESTER", "REVIEWER", "ADMINISTRATOR"] }, "SELF_APPROVAL_FORBIDDEN"],
        [{ assignedReviewerId: "other" }, "NOT_FOUND"], [{ roles: [] }, "FORBIDDEN"],
        [{ stageStatus: "WAITING" }, "APPROVAL_TASK_STALE"], [{ submittedRevisionId: "old" }, "APPROVAL_TASK_STALE"], [{ expectedVersion: 0 }, "APPROVAL_TASK_STALE"],
    ] as const)("rejects invalid current context", (change, code) =>
    {
        const context = { ...eligible, ...change };
        expect(() => AssertReviewerCanDecide(context)).toThrowError(expect.objectContaining<Partial<ApprovalTaskError>>({ code }));
        expect(CanReadCurrentTask(context)).toBe(false);
    });
});
