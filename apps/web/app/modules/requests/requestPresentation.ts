import type { RequestDetail, RequestSummary } from "@workflow/contracts";
import { isApiFailure } from "~/api/errors";

export const requestStatusLabels: Record<RequestDetail["status"], string> = { DRAFT: "Draft", PENDING: "Pending approval", RETURNED: "Returned for revision", APPROVED: "Approved", REJECTED: "Rejected", WITHDRAWN: "Withdrawn" };
export const requestPriorityLabels: Record<RequestSummary["priority"], string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };
export const requestSortLabels: Record<string, string> = {
    "updatedAt desc": "Last updated (newest first)", "updatedAt asc": "Last updated (oldest first)",
    "createdAt desc": "Created (newest first)", "createdAt asc": "Created (oldest first)",
    "submittedAt desc": "Submitted (newest first)", "submittedAt asc": "Submitted (oldest first)",
    "requestNumber asc": "Request number (A–Z)", "requestNumber desc": "Request number (Z–A)",
    "title asc": "Title (A–Z)", "title desc": "Title (Z–A)",
};
export const approverSlotLabels: Record<string, string> = { WAITING: "Waiting", ACTIONABLE: "Action required", APPROVED: "Approved", REJECTED: "Rejected", RETURNED: "Returned", CANCELLED: "Cancelled" };

export function requestStatusLabel(status: RequestDetail["status"]): string
{
    return requestStatusLabels[status];
}
export function requestPriorityLabel(priority: RequestSummary["priority"]): string
{
    return requestPriorityLabels[priority];
}
/** Short codes such as OPS stay intact; separator-delimited codes become readable words. */
export function requestTypeLabel(code: string): string
{
    if (!/[_\s-]/.test(code)) return code;
    return code.split(/[_\s-]+/).filter(Boolean).map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase()).join(" ");
}
export function approverSlotLabel(status: string): string
{
    return approverSlotLabels[status] ?? status;
}

export interface IViewError
{
    message: string;
    requestId?: string;
    terminal: boolean;
    status?: number;
}

/** Maps a transport failure to fixed safe copy; 401/403/404 are terminal for this view. */
export function presentFailure(failure: unknown, fallback: string): IViewError
{
    if (!isApiFailure(failure)) return { message: fallback, terminal: false };
    if (failure.status === 401) return { message: "Your session has expired. Sign in again to continue.", terminal: true, status: 401 };
    if (failure.status === 403) return { message: "You do not have access to this content.", terminal: true, status: 403 };
    if (failure.status === 404) return { message: "This request is unavailable.", terminal: true, status: 404 };
    if (failure.status === 500 || failure.status === 503) return { message: "The service is temporarily unavailable. Try again.", requestId: failure.requestId, terminal: false, status: failure.status };
    return { message: failure.message, terminal: false, status: failure.status };
}