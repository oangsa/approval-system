import { IdentityError } from "../Domains/Identity/IdentityError";

export type HttpErrorCode = "BAD_REQUEST" | "VALIDATION_ERROR" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "RATE_LIMITED" | "SERVICE_UNAVAILABLE" | "INTERNAL_ERROR";
export class HttpError extends Error
{
    constructor(public readonly code: HttpErrorCode)
    {
        super(code);
    }
}
const errors: Record<HttpErrorCode, [number, string, string]> = {
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
    if (error instanceof HttpError) code = error.code;
    else if (error instanceof IdentityError)
    {
        code = error.code === "FORBIDDEN" ? "FORBIDDEN" : error.code === "RATE_LIMITED" ? "RATE_LIMITED" : "UNAUTHENTICATED";
    }
    else if (frameworkCode === "NOT_FOUND") code = "NOT_FOUND";
    else if (frameworkCode === "PARSE") code = "BAD_REQUEST";
    else if (frameworkCode === "VALIDATION") code = "VALIDATION_ERROR";
    else if (isUnavailable(error)) code = "SERVICE_UNAVAILABLE";
    const [statusCode, message, label] = errors[code];
    return { statusCode, code, message, error: label, requestId };
}
