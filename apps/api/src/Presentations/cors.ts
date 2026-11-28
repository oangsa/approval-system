import { HttpError } from "./errors";

export function checkOrigin(request: Request, allowed: readonly string[], required: boolean): string | null
{
    const origin = request.headers.get("origin");
    if ((!origin && required) || (origin && !allowed.includes(origin))) throw new HttpError("FORBIDDEN");
    return origin;
}

export function corsHeaders(headers: Headers, origin: string | null): void
{
    if (!origin) return;
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Credentials", "true");
    headers.set("Access-Control-Expose-Headers", "X-Pagination, X-Request-Id, Location, Content-Disposition");
    headers.append("Vary", "Origin");
}

export function preflight(request: Request, allowed: readonly string[]): Response
{
    const origin = checkOrigin(request, allowed, true);
    const pathname = new URL(request.url).pathname;
    const attachmentDownloadResource = /^\/api\/v1\/attachments\/[^/]+\/download$/.test(pathname);
    const attachmentRequestResource = /^\/api\/v1\/requests\/[^/]+\/attachments(?:\/[^/]+)?$/.test(pathname);
    const commentRequestResource = /^\/api\/v1\/requests\/[^/]+\/comments$/.test(pathname);
    const requestResource = /^\/api\/v1\/(?:requests|request-types)(?:\/|$)/.test(pathname);
    const adminRequestTypeResource = /^\/api\/v1\/admin\/request-types(?:\/|$)/.test(pathname);
    const adminConfigurationResource = /^\/api\/v1\/admin\/(?:approval-policies|reviewer-assignments|budget-policies)(?:\/|$)/.test(pathname);

    const methods = attachmentDownloadResource
        ? ["GET"]
        : attachmentRequestResource
            ? ["GET", "POST", "DELETE"]
            : commentRequestResource
                ? ["GET", "POST"]
                : requestResource
                    ? ["GET", "POST", "PATCH"]
                    : (adminRequestTypeResource || adminConfigurationResource)
                        ? ["POST", "PATCH"]
                        : ["GET", "POST"];

    const decisionResource = /^\/api\/v1\/approval-tasks\/[^/]+\/decisions$/.test(pathname);
    const supportsIdempotency =
        (!attachmentDownloadResource && !attachmentRequestResource && !commentRequestResource && requestResource)
        || adminRequestTypeResource
        || adminConfigurationResource
        || decisionResource;

    const allowedHeaders = ["authorization", "content-type", "x-request-id", ...(supportsIdempotency ? ["idempotency-key"] : [])];
    const method = request.headers.get("access-control-request-method")?.toUpperCase();
    const headers = (request.headers.get("access-control-request-headers") ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (!method || !methods.includes(method) || headers.some((value) => !allowedHeaders.includes(value))) throw new HttpError("FORBIDDEN");
    const result = new Headers();
    corsHeaders(result, origin);
    result.set("Access-Control-Allow-Methods", methods.join(", "));
    result.set("Access-Control-Allow-Headers", `Authorization, Content-Type, X-Request-Id${supportsIdempotency ? ", Idempotency-Key" : ""}`);
    return new Response(null, { status: 204, headers: result });
}
