import { z } from "zod";
import { createRequestSchema, errorResponseSchema, patchDraftSchema, publishedRequestTypeSchema, requestDetailSchema, requestTypeSearchSchema, submitRequestSchema } from "@workflow/contracts";
import type { RequestService } from "../../Applications/Requests/RequestService";
import { RequestError } from "../../Domains/Requests/RequestRules";
import type { IIdentityHttpDependencies } from "../composition";
import { requireAuthentication } from "../Guards/authentication";
import { HttpError } from "../errors";

const requestRoutes = [
        ["GET", "/api/v1/request-types/:id/versions/:versionId", "typeVersion"],
        ["POST", "/api/v1/requests", "create"], ["PATCH", "/api/v1/requests/:id/draft", "patch"], ["POST", "/api/v1/requests/:id/submit", "submit"],
        ["GET", "/api/v1/requests/:id", "read"], ["POST", "/api/v1/request-types/search", "types"], ["GET", "/api/v1/request-types/:id", "type"],
    ] as const;

export function createRequestOpenApi()
{
    const paths: Record<string, Record<string, unknown>> = {};
    for (const [method, path, action] of requestRoutes)
    {
        const body = action === "create" ? createRequestSchema : action === "patch" ? patchDraftSchema : action === "submit" ? submitRequestSchema : action === "types" ? requestTypeSearchSchema : null;
        const response = action === "types" ? z.array(publishedRequestTypeSchema) : ["type", "typeVersion"].includes(action) ? publishedRequestTypeSchema : requestDetailSchema;
        const keyRequired = action === "create" || action === "submit";
        paths[path.replace(":id", "{id}").replace(":versionId", "{versionId}")] ??= {};
        paths[path.replace(":id", "{id}").replace(":versionId", "{versionId}")]![method.toLowerCase()] = {
            security: [{ bearerAuth: [] }],
            parameters: [
                ...(action === "typeVersion" ? [{ name: "versionId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { name: "requestId", in: "query", required: false, description: "Required for non-admins; must identify an authorized request using this version.", schema: { type: "string", format: "uuid" } }] : []),
                ...(path.includes(":id") ? [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }] : []),
                ...(keyRequired || action === "patch" ? [{ name: "Idempotency-Key", in: "header", required: keyRequired, schema: { type: "string", format: "uuid" } }] : []),
            ],
            ...(body ? { requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(body, { io: "input" }) } } } } : {}),
            responses: {
                [action === "create" ? "201" : "200"]: { description: "Success", content: { "application/json": { schema: z.toJSONSchema(response) } } },
                default: { description: "Error", content: { "application/json": { schema: z.toJSONSchema(errorResponseSchema) } } },
            },
        };
    }
    return { openapi: "3.1.0", info: { title: "Request submission API", version: "1.0.0" }, paths, components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } } };
}

export function registerRequestRoutes(app: {
    route(method: "GET" | "POST" | "PATCH", path: string, handler: (context: { request: Request; params: Record<string, string> }) => Promise<Response>, hook: { parse: "none" }): unknown;
}, identity: IIdentityHttpDependencies, service: RequestService): void
{
    for (const [method, path, action] of requestRoutes)
    {
        app.route(method, path, async ({ request, params = {} }) =>
        {
            const actor = await requireAuthentication(request.headers.get("authorization"), identity.authenticate);
            if (params.id && !z.uuid().safeParse(params.id).success) throw new HttpError("NOT_FOUND");
            if (action === "typeVersion")
            {
                const requestId = new URL(request.url).searchParams.get("requestId") ?? undefined;
                if (!z.uuid().safeParse(params.versionId).success || requestId !== undefined && !z.uuid().safeParse(requestId).success) throw new HttpError("NOT_FOUND");
                return Response.json(publishedRequestTypeSchema.parse(await service.TypeVersion(actor, params.id!, params.versionId!, requestId)));
            }
            if (action === "read") return Response.json(requestDetailSchema.parse(await service.Read(actor, params.id!)));
            let value: unknown;
            if (method !== "GET")
            {
                try
                {
                    value = await request.json();
                }
                catch
                {
                    throw new HttpError("BAD_REQUEST");
                }
            }
            if (action === "types" || action === "type")
            {
                if (action === "type") return Response.json(publishedRequestTypeSchema.parse(await service.Type(actor, params.id!)));
                const query = requestTypeSearchSchema.safeParse(value);
                if (!query.success) throw new HttpError("VALIDATION_ERROR");
                const result = await service.Types(actor, query.data);
                return Response.json(result.items, { headers: { "X-Pagination": JSON.stringify(result.pagination) } });
            }
            const schema = action === "create" ? createRequestSchema : action === "patch" ? patchDraftSchema : submitRequestSchema;
            const parsed = schema.safeParse(value);
            if (!parsed.success) throw new RequestError("VALIDATION_ERROR", parsed.error.issues.map((issue) => ({ field: issue.path.join(".") || "body", code: "VALIDATION_ERROR", message: issue.message })));
            const key = request.headers.get("idempotency-key");
            if ((action !== "patch" || key !== null) && !z.uuid().safeParse(key).success) throw new HttpError("VALIDATION_ERROR");
            const result = requestDetailSchema.parse(await service.Mutate(actor, action, params.id ?? null, parsed.data, key?.toLowerCase()));
            return Response.json(result, { status: action === "create" ? 201 : 200, headers: action === "create" ? { Location: `/api/v1/requests/${result.id}` } : {} });
        }, { parse: "none" });
    }
}
