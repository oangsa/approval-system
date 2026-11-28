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
    ambiguousCommit?: boolean;
}

/** Single failure type for every transport call so callers can branch on kind/status/code. */
export class ApiFailure extends Error
{
    public readonly kind: ApiFailureKind;
    public readonly status: number | undefined;
    public readonly code: string | undefined;
    public readonly requestId: string | undefined;
    public readonly details: ErrorResponse["details"];
    public readonly ambiguousCommit: boolean;

    constructor(options: IApiFailureOptions)
    {
        super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = "ApiFailure";
        this.kind = options.kind;
        this.status = options.status;
        this.code = options.code;
        this.requestId = options.requestId;
        this.details = options.details;
        this.ambiguousCommit = options.ambiguousCommit ?? false;
    }
}

export type ApiError = ApiFailure;

export function isApiFailure(value: unknown): value is ApiFailure
{
    return value instanceof ApiFailure;
}

export function isAuthenticationFailure(value: unknown): boolean
{
    return isApiFailure(value) && value.kind === "http" && value.status === 401;
}

function fallbackErrorCode(status: number): string
{
    if (status === 400) return "BAD_REQUEST";
    if (status === 401) return "UNAUTHENTICATED";
    if (status === 403) return "FORBIDDEN";
    if (status === 404) return "NOT_FOUND";
    if (status === 409) return "CONFLICT";
    if (status === 413) return "FILE_TOO_LARGE";
    if (status === 415) return "UNSUPPORTED_MEDIA_TYPE";
    if (status === 422) return "VALIDATION_ERROR";
    if (status === 429) return "RATE_LIMITED";
    if (status === 503) return "SERVICE_UNAVAILABLE";
    return "INTERNAL_ERROR";
}

/** Parses the frozen error envelope from raw HTTP fields when a Response object is unavailable (e.g., XHR). */
export function parseErrorEnvelopeFromValues(status: number, statusText: string, requestIdHeader: string | null, body: unknown): ErrorResponse
{
    const parsed = errorResponseSchema.safeParse(body);
    if (parsed.success) return parsed.data;
    return {
        statusCode: status,
        code: fallbackErrorCode(status),
        message: statusText || `Request failed (${status})`,
        error: statusText || `Request failed (${status})`,
        requestId: requestIdHeader ?? crypto.randomUUID(),
    };
}

/** Parses the frozen error envelope, falling back to a safe synthetic body when the response is not conforming. */
export function parseErrorEnvelope(response: Response, body: unknown): ErrorResponse
{
    return parseErrorEnvelopeFromValues(response.status, response.statusText, response.headers.get("x-request-id"), body);
}