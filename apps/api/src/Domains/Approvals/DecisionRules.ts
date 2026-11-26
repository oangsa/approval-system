import type { DecisionRequest, DecisionResult } from "@workflow/contracts";
import { rejectionReasonMinimumLength, decisionReasonMaximumLength } from "@workflow/contracts";
import { ApprovalTaskError, AssertReviewerCanDecide, type IReviewerDecisionContext } from "./ApprovalTaskRules";

export interface IDecisionState
{
    requestId: string; cycleId: string; revisionId: string; requestVersion: number;
    context: IReviewerDecisionContext;
    stages: { id: string; stageNumber: 1 | 2; status: string; requiredKeys: string[] }[];
    slots: { id: string; stageId: string; assignmentKey: string; status: string; version: number }[];
}
export interface IDecisionTransition
{
    stageId: string; stageComplete: boolean; requestStatus: DecisionResult["requestStatus"]; currentStageNumber: 1 | 2 | null;
}
export function decideTransition(state: IDecisionState, taskId: string, body: DecisionRequest): IDecisionTransition
{

    const reasonLength = body.reason?.trim().length ?? 0;
    if (body.decision === "RETURN" && (reasonLength < 1 || reasonLength > decisionReasonMaximumLength)) throw new ApprovalTaskError("VALIDATION_ERROR");
    if (body.decision === "REJECT" && (reasonLength < rejectionReasonMinimumLength || reasonLength > decisionReasonMaximumLength)) throw new ApprovalTaskError("VALIDATION_ERROR");
    AssertReviewerCanDecide({ ...state.context, expectedVersion: body.expectedVersion });
    const slot = state.slots.find((item) => item.id === taskId);
    const stage = state.stages.find((item) => item.id === slot?.stageId);
    if (!slot || !stage || state.stages.length < 1 || state.stages.length > 2 || state.stages.some((item, index) =>
    {
        const actual = state.slots.filter((candidate) => candidate.stageId === item.id);
        return item.stageNumber !== index + 1 || !item.requiredKeys.length || new Set(item.requiredKeys).size !== item.requiredKeys.length ||
            item.requiredKeys.some((key) => !actual.some((candidate) => candidate.assignmentKey === key)) ||
            actual.some((candidate) => !item.requiredKeys.includes(candidate.assignmentKey));
    }) || state.slots.some((item) => !state.stages.some((candidate) => candidate.id === item.stageId)))
    {
        throw new ApprovalTaskError("INVALID_REQUEST_TRANSITION");
    }
    if (state.stages.some((item) => item.stageNumber < stage.stageNumber && (item.status !== "COMPLETED" || state.slots.some((candidate) => candidate.stageId === item.id && candidate.status !== "APPROVED")))) throw new ApprovalTaskError("APPROVAL_TASK_STALE");
    if (stage.status !== "ACTIVE" || slot.status !== "ACTIONABLE" || state.slots.some((item) => item.stageId === stage.id && !["ACTIONABLE", "APPROVED"].includes(item.status)) || state.stages.some((item) => item.stageNumber > stage.stageNumber && (item.status !== "WAITING" || state.slots.some((candidate) => candidate.stageId === item.id && candidate.status !== "WAITING"))) || state.stages.some((item) => item.id !== stage.id && item.status === "ACTIVE")) throw new ApprovalTaskError("APPROVAL_TASK_STALE");
    if (body.decision === "RETURN") return { stageId: stage.id, stageComplete: true, requestStatus: "RETURNED", currentStageNumber: null };
    if (body.decision === "REJECT") return { stageId: stage.id, stageComplete: true, requestStatus: "REJECTED", currentStageNumber: null };
    const stageComplete = state.slots.filter((item) => item.stageId === stage.id).every((item) => item.id === taskId || item.status === "APPROVED");
    const final = stageComplete && stage.stageNumber === state.stages.length;
    return { stageId: stage.id, stageComplete, requestStatus: final ? "APPROVED" : "PENDING", currentStageNumber: final ? null : stageComplete ? 2 : stage.stageNumber };
}
