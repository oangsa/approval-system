import { randomUUID } from "node:crypto";
import { Elysia, type ElysiaAdapter } from "elysia";
import { healthResponseSchema } from "@workflow/contracts";
import { z } from "zod";
import type { IIdentityHttpDependencies } from "./composition";
import { checkOrigin, corsHeaders, preflight } from "./cors";
import { errorResponse, HttpError } from "./errors";
import { authRouteDescriptors, registerAuthRoutes } from "./Routes/AuthRoutes";

export function createApplication(adapter?: ElysiaAdapter, identity?: IIdentityHttpDependencies)
{
    const ids = new WeakMap<Request, string>();
    const app = new Elysia({ adapter })
        .onRequest(({ request, set }) =>
        {
            const supplied = request.headers.get("x-request-id");
            const id = supplied && z.uuid().safeParse(supplied).success ? supplied.toLowerCase() : randomUUID();
            ids.set(request, id);
            set.headers["X-Request-Id"] = id;
            const path = new URL(request.url).pathname;
            if (path.startsWith("/api/v1/auth/"))
            {
                set.headers["Cache-Control"] = "no-store";
                if (identity)
                {
                    if (request.method === "OPTIONS")
                    {
                        const method = request.headers.get("access-control-request-method")?.toUpperCase();
                        if (!authRouteDescriptors.some((route) => route.path === path && route.method === method)) throw new HttpError("FORBIDDEN");
                        return preflight(request, identity.allowedOrigins);
                    }
                    const required = ["/api/v1/auth/login", "/api/v1/auth/refresh", "/api/v1/auth/logout"].includes(path);
                    const origin = checkOrigin(request, identity.allowedOrigins, required);
                    const headers = new Headers();
                    corsHeaders(headers, origin);
                    headers.forEach((value, key) => 
{
 set.headers[key] = value; 
});
                }
            }
        })
        .onError(({ code, error, request, set }) =>
        {
            const id = ids.get(request) ?? randomUUID();
            const result = errorResponse(error, code, id);
            set.status = result.statusCode;
            set.headers["X-Request-Id"] = id;
            set.headers["Cache-Control"] = "no-store";
            if (result.code === "RATE_LIMITED") set.headers["Retry-After"] = "900";
            if (error && typeof error === "object" && "responseHeaders" in error && error.responseHeaders instanceof Headers)
            {
                error.responseHeaders.forEach((value, key) => 
{
 set.headers[key] = value; 
});
            }
            if (result.statusCode >= 500) console.error({ code: result.code, requestId: id });
            return result;
        })
        .get("/health", () => ({ status: "ok" as const }), { response: healthResponseSchema });
    if (identity) registerAuthRoutes(app, identity);
    return app;
}
