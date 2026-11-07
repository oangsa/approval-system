import type { UserRole } from "@workflow/contracts";

export type ApprovalTaskErrorCode = "NOT_FOUND" | "FORBIDDEN" | "SELF_APPROVAL_FORBIDDEN" | "APPROVAL_TASK_STALE";
export class ApprovalTaskError extends Error
{
    constructor(public readonly code: ApprovalTaskErrorCode)
    {
        super(code);
    }
}
export interface IReviewerDecisionContext
{
    actorId: string; roles: readonly UserRole[]; isActive: boolean; requesterId: string;
    requestStatus: string; currentCycleId: string | null; slotCycleId: string; slotRevisionId: string;
    submittedRevisionId: string | null; stageStatus: string; slotStatus: string; assignedReviewerId: string;
    expectedVersion: number; slotVersion: number; delegationValid?: boolean;
}
export function AssertReviewerCanDecide(context: IReviewerDecisionContext): void
{
    if (context.actorId === context.requesterId) throw new ApprovalTaskError("SELF_APPROVAL_FORBIDDEN");
    if (context.assignedReviewerId !== context.actorId && !context.delegationValid) throw new ApprovalTaskError("NOT_FOUND");
    if (!context.isActive || !context.roles.includes("REVIEWER")) throw new ApprovalTaskError("FORBIDDEN");
    if (context.requestStatus !== "PENDING" || context.currentCycleId !== context.slotCycleId || context.submittedRevisionId !== context.slotRevisionId || context.stageStatus !== "ACTIVE" || context.slotStatus !== "ACTIONABLE" || context.expectedVersion !== context.slotVersion) throw new ApprovalTaskError("APPROVAL_TASK_STALE");
}
export function CanReadCurrentTask(context: IReviewerDecisionContext): boolean
{
    try
    {
        AssertReviewerCanDecide(context);
        return true;
    }
    catch
    {
        return false;
    }
}
