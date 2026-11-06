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
    headers.set("Access-Control-Expose-Headers", "X-Pagination, X-Request-Id, Location");
    headers.append("Vary", "Origin");
}
export function preflight(request: Request, allowed: readonly string[]): Response
{
    const origin = checkOrigin(request, allowed, true);
    const method = request.headers.get("access-control-request-method")?.toUpperCase();
    const headers = (request.headers.get("access-control-request-headers") ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
    if (!method || !["GET", "POST"].includes(method) || headers.some((value) => !["authorization", "content-type", "x-request-id"].includes(value))) throw new HttpError("FORBIDDEN");
    const result = new Headers();
    corsHeaders(result, origin);
    result.set("Access-Control-Allow-Methods", "GET, POST");
    result.set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-Id");
    return new Response(null, { status: 204, headers: result });
}
