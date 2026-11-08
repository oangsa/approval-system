import type { DecisionRequest, DecisionResult } from "@workflow/contracts";
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
    if (body.decision === "RETURN") throw new ApprovalTaskError("INVALID_REQUEST_TRANSITION");
    if (body.decision === "REJECT" && !body.reason?.trim()) throw new ApprovalTaskError("VALIDATION_ERROR");
    AssertReviewerCanDecide({ ...state.context, expectedVersion: body.expectedVersion });
    const slot = state.slots.find((item) => item.id === taskId);
    const stage = state.stages.find((item) => item.id === slot?.stageId);
    if (!slot || !stage || !state.stages.length || state.stages.some((item, index) => item.stageNumber !== index + 1 || !item.requiredKeys.length || item.requiredKeys.some((key) => !state.slots.some((candidate) => candidate.stageId === item.id && candidate.assignmentKey === key))))
    {
        throw new ApprovalTaskError("INVALID_REQUEST_TRANSITION");
    }
    if (stage.stageNumber !== 1) throw new ApprovalTaskError("INVALID_REQUEST_TRANSITION");
    if (state.stages.some((item) => item.stageNumber < stage.stageNumber && item.status !== "COMPLETED")) throw new ApprovalTaskError("APPROVAL_TASK_STALE");
    if (body.decision === "REJECT") return { stageId: stage.id, stageComplete: true, requestStatus: "REJECTED", currentStageNumber: null };
    const stageComplete = state.slots.filter((item) => item.stageId === stage.id).every((item) => item.id === taskId || item.status === "APPROVED");
    const final = stageComplete && stage.stageNumber === state.stages.length;
    return { stageId: stage.id, stageComplete, requestStatus: final ? "APPROVED" : "PENDING", currentStageNumber: final ? null : stageComplete ? null : stage.stageNumber };
}
