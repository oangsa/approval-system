import { RequestError, type RequestErrorCode } from "../Domains/Requests/RequestRules";
import { IdentityError } from "../Domains/Identity/IdentityError";
import { ApprovalTaskError, type ApprovalTaskErrorCode } from "../Domains/Approvals/ApprovalTaskRules";

export type HttpErrorCode = RequestErrorCode | ApprovalTaskErrorCode | "BAD_REQUEST" | "VALIDATION_ERROR" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "RATE_LIMITED" | "SERVICE_UNAVAILABLE" | "INTERNAL_ERROR";
export class HttpError extends Error
{
    constructor(public readonly code: HttpErrorCode)
    {
        super(code);
    }
}
const errors: Record<HttpErrorCode, [number, string, string]> = {
    SELF_APPROVAL_FORBIDDEN: [403, "Self approval is forbidden", "Forbidden"],
    APPROVAL_TASK_STALE: [409, "This approval task has changed. Refresh and try again", "Conflict"],
    FORM_FIELD_NOT_APPLICABLE: [422, "A form field is not applicable", "Unprocessable Entity"],
    FORM_DEFINITION_CHANGED: [409, "The form changed. Review the updated definition", "Conflict"],
    CONFIGURATION_INCOMPLETE: [409, "Submission configuration is incomplete. Contact an administrator", "Conflict"],
    AMBIGUOUS_APPROVAL_POLICY: [409, "Approval policy configuration is ambiguous", "Conflict"],
    BUDGET_LIMIT_EXCEEDED: [422, "Amount exceeds the configured limit", "Unprocessable Entity"],
    INVALID_REQUEST_TRANSITION: [409, "Request cannot be changed in its current state", "Conflict"],
    REQUEST_STALE: [409, "Request has changed. Reload before editing", "Conflict"],
    IDEMPOTENCY_CONFLICT: [409, "This action key was already used with different content", "Conflict"],
    BAD_REQUEST: [400, "Bad request", "Bad Request"],
    VALIDATION_ERROR: [422, "Validation failed", "Unprocessable Entity"],
    UNAUTHENTICATED: [401, "Authentication required", "Unauthorized"],
    FORBIDDEN: [403, "Forbidden", "Forbidden"],
    NOT_FOUND: [404, "Not found", "Not Found"],
    RATE_LIMITED: [429, "Too many requests", "Too Many Requests"],
    SERVICE_UNAVAILABLE: [503, "Service unavailable", "Service Unavailable"],
    INTERNAL_ERROR: [500, "Internal server error", "Internal Server Error"],
};
const unavailable = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH", "CONNECTION_CLOSED", "CONNECTION_ENDED", "CONNECT_TIMEOUT", "57P01", "57P02", "57P03", "53300"]);
function isUnavailable(error: unknown): boolean
{
    let current: unknown = error;
    for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++)
    {
        const value = current as { code?: unknown; cause?: unknown };
        if (typeof value.code === "string" && (unavailable.has(value.code) || /^08[A-Z0-9]{3}$/.test(value.code))) return true;
        current = value.cause;
    }
    return false;
}
export function errorResponse(error: unknown, frameworkCode: string | number, requestId: string)
{
    let code: HttpErrorCode = "INTERNAL_ERROR";
    if (error instanceof RequestError || error instanceof ApprovalTaskError) code = error.code;
    else if (error instanceof HttpError) code = error.code;
    else if (error instanceof IdentityError)
    {
        code = error.code === "FORBIDDEN" ? "FORBIDDEN" : error.code === "RATE_LIMITED" ? "RATE_LIMITED" : "UNAUTHENTICATED";
    }
    else if (frameworkCode === "NOT_FOUND") code = "NOT_FOUND";
    else if (frameworkCode === "PARSE") code = "BAD_REQUEST";
    else if (frameworkCode === "VALIDATION") code = "VALIDATION_ERROR";
    else if (isUnavailable(error)) code = "SERVICE_UNAVAILABLE";
    const [statusCode, message, label] = errors[code];
    return { statusCode, code, message, error: label, requestId, ...(error instanceof RequestError && error.details.length ? { details: error.details } : {}) };
}
