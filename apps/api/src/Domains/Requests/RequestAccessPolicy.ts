import type { RequestDetail } from "@workflow/contracts";
import type { IActor } from "../Identity/Identity";
import { RequestError } from "./RequestRules";

export interface IDelegationContext
{
    delegateId: string;
    startsAt?: Date | null;
    expiresAt: Date;
    revokedAt?: Date | null;
}

export interface IRequestApproverContext
{
    reviewerId: string;
    status: "WAITING" | "ACTIONABLE" | "APPROVED" | "REJECTED" | "RETURNED" | "CANCELLED";
    delegation?: IDelegationContext | null;
    delegationValid?: boolean;
}

export interface IRequestAccessContext
{
    requestId?: string;
    requesterId: string;
    status: RequestDetail["status"];
    workingRevisionId?: string | null;
    submittedRevisionId?: string | null;
    currentApprovers: readonly IRequestApproverContext[];
    now?: Date;
}

export interface IAttachmentRevisionContext
{
    requestId?: string;
    revisionId: string;
    submittedAt: Date | null;
}

/**
 * Converts a full RequestDetail projection into the minimal IRequestAccessContext
 * used by RequestAccessPolicy across detail, comment, and attachment endpoints.
 */
export function ToRequestAccessContext(detail: RequestDetail, now?: Date): IRequestAccessContext
{
    return {
        requestId: detail.id,
        requesterId: detail.requester.id,
        status: detail.status,
        workingRevisionId: detail.workingRevision?.id ?? null,
        submittedRevisionId: detail.submittedRevision?.id ?? null,
        currentApprovers: detail.currentApprovers.map((slot) => ({
            reviewerId: slot.reviewer.id,
            status: slot.status,
        })),
        ...(now ? { now } : {}),
    };
}

function isActiveOwner(actor: IActor, requestContext: IRequestAccessContext): boolean
{
    return actor.account.isActive
        && actor.account.id === requestContext.requesterId
        && actor.roles.includes("REQUESTER");
}

function isCurrentAssignedReviewer(actor: IActor, requestContext: IRequestAccessContext): boolean
{
    if (!actor.account.isActive)
    {
        return false;
    }
    if (actor.account.id === requestContext.requesterId)
    {
        return false;
    }
    if (!actor.roles.includes("REVIEWER"))
    {
        return false;
    }
    if (requestContext.status !== "PENDING")
    {
        return false;
    }

    const now = requestContext.now ?? new Date();
    return requestContext.currentApprovers.some((slot) =>
    {
        if (slot.status !== "ACTIONABLE" && slot.status !== "WAITING")
        {
            return false;
        }
        if (slot.reviewerId === actor.account.id)
        {
            return true;
        }
        if (slot.delegationValid === true)
        {
            return true;
        }
        const delegation = slot.delegation;
        if (!delegation || delegation.delegateId !== actor.account.id)
        {
            return false;
        }
        if (delegation.revokedAt != null)
        {
            return false;
        }
        if (delegation.startsAt != null && now < delegation.startsAt)
        {
            return false;
        }
        return now < delegation.expiresAt;
    });
}

function evaluateWorkingAttachmentMutation(actor: IActor, requestContext: IRequestAccessContext): "ALLOWED" | "NOT_FOUND" | "FORBIDDEN" | "INVALID_REQUEST_TRANSITION"
{
    if (!actor.account.isActive)
    {
        return "FORBIDDEN";
    }
    if (actor.account.id !== requestContext.requesterId)
    {
        return "NOT_FOUND";
    }
    if (!actor.roles.includes("REQUESTER"))
    {
        return "FORBIDDEN";
    }
    if ((requestContext.status !== "DRAFT" && requestContext.status !== "RETURNED") || !requestContext.workingRevisionId)
    {
        return "INVALID_REQUEST_TRANSITION";
    }
    return "ALLOWED";
}

/**
 * Shared pure Domain authorization policy enforcing SDS §5 current-participant boundaries
 * across request detail reads, comments, working attachment mutations, and downloads.
 */
export class RequestAccessPolicy
{
    public static CanReadCurrentRequest(actor: IActor, requestContext: IRequestAccessContext): boolean
    {
        return isActiveOwner(actor, requestContext) || isCurrentAssignedReviewer(actor, requestContext);
    }

    public static AssertCanReadCurrentRequest(actor: IActor, requestContext: IRequestAccessContext): void
    {
        if (!actor.account.isActive)
        {
            throw new RequestError("FORBIDDEN");
        }
        if (actor.account.id === requestContext.requesterId && !actor.roles.includes("REQUESTER"))
        {
            throw new RequestError("FORBIDDEN");
        }
        if (!RequestAccessPolicy.CanReadCurrentRequest(actor, requestContext))
        {
            throw new RequestError("NOT_FOUND");
        }
    }

    public static CanPostComment(actor: IActor, requestContext: IRequestAccessContext): boolean
    {
        return RequestAccessPolicy.CanReadCurrentRequest(actor, requestContext);
    }

    public static AssertCanPostComment(actor: IActor, requestContext: IRequestAccessContext): void
    {
        RequestAccessPolicy.AssertCanReadCurrentRequest(actor, requestContext);
    }

    public static CanMutateWorkingAttachment(actor: IActor, requestContext: IRequestAccessContext): boolean
    {
        return evaluateWorkingAttachmentMutation(actor, requestContext) === "ALLOWED";
    }

    public static AssertCanMutateWorkingAttachment(actor: IActor, requestContext: IRequestAccessContext): void
    {
        const outcome = evaluateWorkingAttachmentMutation(actor, requestContext);
        if (outcome !== "ALLOWED")
        {
            throw new RequestError(outcome);
        }
    }

    public static CanDownloadAttachment(
        actor: IActor,
        requestContext: IRequestAccessContext,
        attachmentRevisionContext: IAttachmentRevisionContext,
    ): boolean
    {
        if (requestContext.requestId && attachmentRevisionContext.requestId && requestContext.requestId !== attachmentRevisionContext.requestId)
        {
            return false;
        }
        if (!RequestAccessPolicy.CanReadCurrentRequest(actor, requestContext))
        {
            return false;
        }
        if (attachmentRevisionContext.submittedAt === null)
        {
            return isActiveOwner(actor, requestContext);
        }
        return true;
    }

    public static AssertCanDownloadAttachment(
        actor: IActor,
        requestContext: IRequestAccessContext,
        attachmentRevisionContext: IAttachmentRevisionContext,
    ): void
    {
        RequestAccessPolicy.AssertCanReadCurrentRequest(actor, requestContext);
        if (!RequestAccessPolicy.CanDownloadAttachment(actor, requestContext, attachmentRevisionContext))
        {
            throw new RequestError("NOT_FOUND");
        }
    }

    public CanReadCurrentRequest(actor: IActor, requestContext: IRequestAccessContext): boolean
    {
        return RequestAccessPolicy.CanReadCurrentRequest(actor, requestContext);
    }

    public AssertCanReadCurrentRequest(actor: IActor, requestContext: IRequestAccessContext): void
    {
        RequestAccessPolicy.AssertCanReadCurrentRequest(actor, requestContext);
    }

    public CanPostComment(actor: IActor, requestContext: IRequestAccessContext): boolean
    {
        return RequestAccessPolicy.CanPostComment(actor, requestContext);
    }

    public AssertCanPostComment(actor: IActor, requestContext: IRequestAccessContext): void
    {
        RequestAccessPolicy.AssertCanPostComment(actor, requestContext);
    }

    public CanMutateWorkingAttachment(actor: IActor, requestContext: IRequestAccessContext): boolean
    {
        return RequestAccessPolicy.CanMutateWorkingAttachment(actor, requestContext);
    }

    public AssertCanMutateWorkingAttachment(actor: IActor, requestContext: IRequestAccessContext): void
    {
        RequestAccessPolicy.AssertCanMutateWorkingAttachment(actor, requestContext);
    }

    public CanDownloadAttachment(
        actor: IActor,
        requestContext: IRequestAccessContext,
        attachmentRevisionContext: IAttachmentRevisionContext,
    ): boolean
    {
        return RequestAccessPolicy.CanDownloadAttachment(actor, requestContext, attachmentRevisionContext);
    }

    public AssertCanDownloadAttachment(
        actor: IActor,
        requestContext: IRequestAccessContext,
        attachmentRevisionContext: IAttachmentRevisionContext,
    ): void
    {
        RequestAccessPolicy.AssertCanDownloadAttachment(actor, requestContext, attachmentRevisionContext);
    }
}
