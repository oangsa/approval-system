import { errorResponseSchema, type ErrorResponse } from "@workflow/contracts";

export type ApiFailureKind = "network" | "http" | "malformed";

export interface IApiFailureOptions
{
    kind: ApiFailureKind;
    status?: number;
    code?: string;
    message: string;
    requestId?: string;
    details?: ErrorResponse["details"];
    cause?: unknown;
}

/** Single failure type for every transport call so callers can branch on kind/status/code. */
export class ApiFailure extends Error
{
    public readonly kind: ApiFailureKind;
    public readonly status: number | undefined;
    public readonly code: string | undefined;
    public readonly requestId: string | undefined;
    public readonly details: ErrorResponse["details"];

    constructor(options: IApiFailureOptions)
    {
        super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = "ApiFailure";
        this.kind = options.kind;
        this.status = options.status;
        this.code = options.code;
        this.requestId = options.requestId;
        this.details = options.details;
    }
}

export function isApiFailure(value: unknown): value is ApiFailure
{
    return value instanceof ApiFailure;
}

export function isAuthenticationFailure(value: unknown): boolean
{
    return isApiFailure(value) && value.kind === "http" && value.status === 401;
}

/** Parses the frozen error envelope, falling back to a safe synthetic body when the response is not conforming. */
export function parseErrorEnvelope(response: Response, body: unknown): ErrorResponse
{
    const parsed = errorResponseSchema.safeParse(body);
    if (parsed.success) return parsed.data;
    return {
        statusCode: response.status,
        code: response.status === 401 ? "UNAUTHENTICATED" : response.status === 403 ? "FORBIDDEN" : response.status === 404 ? "NOT_FOUND" : response.status === 429 ? "RATE_LIMITED" : "INTERNAL_ERROR",
        message: response.statusText || `Request failed (${response.status})`,
        error: response.statusText || `Request failed (${response.status})`,
        requestId: response.headers.get("x-request-id") ?? crypto.randomUUID(),
    };
}