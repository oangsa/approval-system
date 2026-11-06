import { z } from "zod";
import { errorResponseSchema, loginRequestSchema, loginResponseSchema, messageResponseSchema, refreshResponseSchema, userSummarySchema } from "@workflow/contracts";
import type { IIdentityHttpDependencies } from "../composition";
import { requireAuthentication } from "../Guards/authentication";
import { HttpError } from "../errors";

const descriptors = [
    { method: "POST", path: "/api/v1/auth/login", request: loginRequestSchema, success: loginResponseSchema, security: [] },
    { method: "POST", path: "/api/v1/auth/refresh", request: null, success: refreshResponseSchema, security: [{ cookieAuth: [] }] },
    { method: "GET", path: "/api/v1/auth/me", request: null, success: userSummarySchema, security: [{ bearerAuth: [] }] },
    { method: "POST", path: "/api/v1/auth/logout", request: null, success: messageResponseSchema, security: [{ bearerAuth: [] }, { cookieAuth: [] }] },
    { method: "POST", path: "/api/v1/auth/logout-all", request: null, success: messageResponseSchema, security: [{ bearerAuth: [] }] },
] as const;
export const authRouteDescriptors = descriptors;
export function createAuthOpenApi()
{
    const paths: Record<string, Record<string, unknown>> = {};
    for (const descriptor of descriptors)
    {
        paths[descriptor.path] = {
            [descriptor.method.toLowerCase()]: {
                security: descriptor.security,
                ...(descriptor.request ? { requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(descriptor.request, { io: "input" }) } } } } : {}),
                responses: {
                    "200": { description: "Success", content: { "application/json": { schema: z.toJSONSchema(descriptor.success) } } },
                    default: { description: "Error", content: { "application/json": { schema: z.toJSONSchema(errorResponseSchema) } } },
                },
            },
        };
    }
    return { openapi: "3.1.0", info: { title: "Identity API", version: "1.0.0" }, paths, components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" }, cookieAuth: { type: "apiKey", in: "cookie", name: "refreshToken" } } } };
}
function cookie(secret: string, expiresAt: Date | undefined, dependencies: IIdentityHttpDependencies): string
{
    const maxAge = expiresAt ? Math.max(0, Math.floor((expiresAt.getTime() - dependencies.clock.Now().getTime()) / 1000)) : 0;
    return `refreshToken=${secret}; Path=/api/v1/auth; HttpOnly; SameSite=Strict${dependencies.cookieSecure ? "; Secure" : ""}; Max-Age=${maxAge}${expiresAt ? "" : "; Expires=Thu, 01 Jan 1970 00:00:00 GMT"}`;
}
function refreshCookie(request: Request): string | undefined
{
    const entry = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim()).find((part) => part.startsWith("refreshToken="));
    if (!entry) return undefined;
    const value = entry.slice("refreshToken=".length);
    return /^[A-Za-z0-9_-]+$/.test(value) ? value : undefined;
}
async function body(request: Request, expectsLogin: boolean): Promise<unknown>
{
    const text = (await request.text()).trim();
    if (!text) return undefined;
    let value: unknown;
    try 
{
 value = JSON.parse(text); 
}
    catch 
{
 throw new HttpError("BAD_REQUEST"); 
}
    if (!expectsLogin) throw new HttpError("VALIDATION_ERROR");
    return value;
}
export function registerAuthRoutes(app: {
    route(
        method: "GET" | "POST",
        path: string,
        handler: (context: { request: Request }) => Promise<Response>,
        hook: { parse: "none" },
    ): unknown;
}, dependencies: IIdentityHttpDependencies)
{
    for (const descriptor of descriptors)
    {
        app.route(descriptor.method, descriptor.path, async ({ request }) =>
        {
            // Cache-Control: no-store is already applied by the application-level onRequest hook for auth paths.
            const headers = new Headers();
            const authorization = request.headers.get("authorization");
            const secret = refreshCookie(request);
            try
            {
                let payload: unknown;
                if (descriptor.path.endsWith("/login"))
                {
                    const parsed = loginRequestSchema.safeParse(await body(request, true));
                    if (!parsed.success) throw new HttpError("VALIDATION_ERROR");
                    const result = await dependencies.login.Execute(parsed.data.email, parsed.data.password, null);
                    payload = loginResponseSchema.parse({ accessToken: result.accessToken, user: result.user });
                    headers.set("Set-Cookie", cookie(result.secret, result.expiresAt, dependencies));
                }
                else if (descriptor.path.endsWith("/refresh"))
                {
                    await body(request, false);
                    if (!secret) throw new HttpError("UNAUTHENTICATED");
                    const result = await dependencies.refresh.Execute(secret);
                    payload = refreshResponseSchema.parse({ accessToken: result.accessToken });
                    headers.set("Set-Cookie", cookie(result.secret, result.expiresAt, dependencies));
                }
                else if (descriptor.path.endsWith("/me"))
                {
                    const actor = await requireAuthentication(authorization, dependencies.authenticate);
                    payload = userSummarySchema.parse(dependencies.getCurrentUser.Execute(actor));
                }
                else
                {
                    await body(request, false);
                    if (descriptor.path.endsWith("/logout-all"))
                    {
                        const actor = await requireAuthentication(authorization, dependencies.authenticate);
                        await dependencies.logoutAll.Execute(actor);
                    }
                    else
                    {
                        const actor = authorization !== null ? await requireAuthentication(authorization, dependencies.authenticate) : undefined;
                        await dependencies.logout.Execute(actor, secret);
                    }
                    payload = messageResponseSchema.parse({ message: "Logged out" });
                    headers.set("Set-Cookie", cookie("", undefined, dependencies));
                }
                return Response.json(payload, { headers });
            }
            catch (error)
            {
                if ((descriptor.path.endsWith("/refresh") || descriptor.path.endsWith("/logout")) && (error instanceof HttpError && error.code === "UNAUTHENTICATED" || error instanceof Error && "code" in error && (error.code === "INVALID_SESSION" || error.code === "INVALID_CREDENTIALS")))
                {
                    headers.set("Set-Cookie", cookie("", undefined, dependencies));
                }
                throw Object.assign(error !== null && typeof error === "object" ? error : new Error(), { responseHeaders: headers });
            }
        }, { parse: "none" });
    }
    return app;
}
