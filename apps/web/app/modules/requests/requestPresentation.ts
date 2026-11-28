import type { RequestDetail, RequestSummary } from "@workflow/contracts";
import { isApiFailure } from "~/api/errors";

export const requestStatusLabels: Record<RequestDetail["status"], string> = { DRAFT: "Draft", PENDING: "Pending approval", RETURNED: "Returned for revision", APPROVED: "Approved", REJECTED: "Rejected", WITHDRAWN: "Withdrawn" };
export const requestPriorityLabels: Record<RequestSummary["priority"], string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High", URGENT: "Urgent" };

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
export function preferredBrowserLocale(): "en" | "th"
{
    if (typeof navigator === "undefined") return "en";
    const candidates = navigator.languages?.length ? navigator.languages : navigator.language ? [navigator.language] : [];
    const preferred = candidates.find((lang) => lang.startsWith("th") || lang.startsWith("en"));
    return preferred?.startsWith("th") ? "th" : "en";
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

export function formatFileSize(bytes: number): string
{
    if (bytes < 1024)
    {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024)
    {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function presentCollaborationFailure(failure: unknown, fallback: string): IViewError
{
    if (!isApiFailure(failure))
    {
        return { message: fallback, terminal: false };
    }
    if (failure.status === 413 || failure.code === "FILE_TOO_LARGE")
    {
        return { message: "File exceeds the 10 MB size limit.", terminal: false, status: 413 };
    }
    if (failure.status === 415 || failure.code === "UNSUPPORTED_MEDIA_TYPE")
    {
        return { message: "Unsupported file type. Allowed formats: PDF, PNG, JPEG, WebP, and plain text.", terminal: false, status: 415 };
    }
    if (failure.code === "INVALID_REQUEST_TRANSITION")
    {
        return { message: "Attachments can only be changed while the request is an editable draft or returned for revision.", terminal: false, status: 409 };
    }
    if (failure.code === "REQUEST_STALE")
    {
        return { message: "The working revision has changed. Reload the request and try again.", terminal: false, status: 409 };
    }
    if (failure.status === 422 || failure.code === "VALIDATION_ERROR")
    {
        return { message: failure.message || fallback, terminal: false, status: 422 };
    }
    return presentFailure(failure, fallback);
}