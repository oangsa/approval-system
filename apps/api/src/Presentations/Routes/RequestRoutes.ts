import { z } from "zod";
import {
    adminRequestTypeDetailSchema,
    adminRequestTypeSearchSchema,
    adminRequestTypeSummarySchema,
    createRequestSchema,
    errorResponseSchema,
    paginationSchema,
    patchDraftSchema,
    publishedRequestTypeSchema,
    requestDetailSchema,
    requestRevisionSchema, revisionMetadataSchema, revisionQuerySchema,
    requestTypeSearchSchema,
    requestSearchSchema,
    requestSummarySchema,
    submitRequestSchema,
    withdrawRequestSchema,
} from "@workflow/contracts";
import type { RequestService } from "../../Applications/Requests/RequestService";
import type { RequestTypeService } from "../../Applications/RequestTypes/RequestTypeService";
import { RequestError } from "../../Domains/Requests/RequestRules";
import type { IIdentityHttpDependencies } from "../composition";
import { requireAuthentication } from "../Guards/authentication";
import { HttpError } from "../errors";

const requestRoutes = [
        ["GET", "/api/v1/request-types/:id/versions/:versionId", "typeVersion"],
        ["POST", "/api/v1/requests/search", "search"], ["POST", "/api/v1/requests", "create"], ["PATCH", "/api/v1/requests/:id/draft", "patch"], ["POST", "/api/v1/requests/:id/submit", "submit"],
        ["POST", "/api/v1/requests/:id/resubmit", "resubmit"], ["GET", "/api/v1/requests/:id/revisions", "revisions"], ["GET", "/api/v1/requests/:id/revisions/:revisionId", "revision"], ["POST", "/api/v1/requests/:id/withdraw", "withdraw"], ["GET", "/api/v1/requests/:id", "read"], ["POST", "/api/v1/request-types/search", "types"], ["GET", "/api/v1/request-types/:id", "type"],
    ] as const;

export function createRequestOpenApi()
{
    const paths: Record<string, Record<string, unknown>> = {};
    for (const [method, path, action] of requestRoutes)
    {
        const body = action === "create"
            ? createRequestSchema
            : action === "patch"
                ? patchDraftSchema
                : action === "submit" || action === "resubmit"
                    ? submitRequestSchema
                    : action === "withdraw"
                        ? withdrawRequestSchema
                        : action === "types"
                            ? z.union([requestTypeSearchSchema, adminRequestTypeSearchSchema])
                            : action === "search"
                                ? requestSearchSchema
                                : null;
        const response = action === "types"
            ? z.union([z.array(publishedRequestTypeSchema), z.array(adminRequestTypeSummarySchema)])
            : action === "revisions"
                ? z.array(revisionMetadataSchema)
                : action === "revision"
                    ? requestRevisionSchema
            : action === "search"
                ? z.array(requestSummarySchema)
                : action === "type"
                    ? z.union([publishedRequestTypeSchema, adminRequestTypeDetailSchema])
                    : action === "typeVersion"
                        ? publishedRequestTypeSchema
                        : requestDetailSchema;
        const keyRequired = action === "create" || action === "submit" || action === "resubmit" || action === "withdraw";
        paths[path.replace(":id", "{id}").replace(":versionId", "{versionId}").replace(":revisionId", "{revisionId}")] ??= {};
        paths[path.replace(":id", "{id}").replace(":versionId", "{versionId}").replace(":revisionId", "{revisionId}")]![method.toLowerCase()] = {
            security: [{ bearerAuth: [] }],
            parameters: [
                ...(action === "types" || action === "type" ? [{ name: "view", in: "query", required: false, description: "Set to 'admin' for administrator request-type views.", schema: { type: "string", enum: ["admin"] } }] : []),
                ...(action === "typeVersion" ? [{ name: "versionId", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { name: "requestId", in: "query", required: false, description: "Required for non-admins; must identify an authorized request using this version.", schema: { type: "string", format: "uuid" } }] : []),
                ...(action === "revision" ? [{ name: "revisionId", in: "path", required: true, schema: { type: "string", format: "uuid" } }] : []),
                ...(action === "revisions" ? ["pageNumber", "pageSize"].map((name) => ({ name, in: "query", schema: { type: "integer", minimum: 1, maximum: name === "pageSize" ? 100 : 10000 } })) : []),
                ...(path.includes(":id") ? [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }] : []),
                ...(keyRequired || action === "patch" ? [{ name: "Idempotency-Key", in: "header", required: keyRequired, schema: { type: "string", format: "uuid" } }] : []),
            ],
            ...(body ? { requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(body, { io: "input" }) } } } } : {}),
            responses: {
                [action === "create" ? "201" : "200"]: { description: "Success", ...(action === "search" || action === "types" || action === "revisions" ? { headers: { "X-Pagination": { description: "JSON pagination metadata", schema: z.toJSONSchema(paginationSchema) } } } : {}), content: { "application/json": { schema: z.toJSONSchema(response) } } },
                default: { description: "Error", content: { "application/json": { schema: z.toJSONSchema(errorResponseSchema) } } },
            },
        };
    }
    return { openapi: "3.1.0", info: { title: "Request submission API", version: "1.0.0" }, paths, components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } } };
}

function formatIssuePath(path: readonly PropertyKey[]): string
{
    let result = "";
    for (const segment of path)
    {
        if (typeof segment === "number") result += `[${segment}]`;
        else result += result ? `.${String(segment)}` : String(segment);
    }
    return result || "body";
}

export function registerRequestRoutes(app: {
    route(method: "GET" | "POST" | "PATCH", path: string, handler: (context: { request: Request; params: Record<string, string> }) => Promise<Response>, hook: { parse: "none" }): unknown;
}, identity: IIdentityHttpDependencies, service: RequestService, requestTypes?: RequestTypeService): void
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
            if (action === "revisions")
            {
                const query = revisionQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
                if (!query.success) throw new HttpError("VALIDATION_ERROR");
                const result = await service.Revisions(actor, params.id!.toLowerCase(), query.data);
                return Response.json(z.array(revisionMetadataSchema).parse(result.items), { headers: { "X-Pagination": JSON.stringify(result.pagination) } });
            }
            if (action === "revision")
            {
                if (!z.uuid().safeParse(params.revisionId).success) throw new HttpError("NOT_FOUND");
                return Response.json(requestRevisionSchema.parse(await service.Revision(actor, params.id!.toLowerCase(), params.revisionId!.toLowerCase())));
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
                const view = new URL(request.url).searchParams.get("view");
                if (view !== null && view !== "admin") throw new HttpError("VALIDATION_ERROR");
                if (action === "type")
                {
                    if (view === "admin")
                    {
                        if (!requestTypes) throw new HttpError("NOT_FOUND");
                        return Response.json(adminRequestTypeDetailSchema.parse(await requestTypes.ReadAdmin(actor, params.id!)));
                    }
                    return Response.json(publishedRequestTypeSchema.parse(await service.Type(actor, params.id!)));
                }
                if (view === "admin")
                {
                    if (!requestTypes) throw new HttpError("NOT_FOUND");
                    const adminQuery = adminRequestTypeSearchSchema.safeParse(value);
                    if (!adminQuery.success) throw new RequestError("VALIDATION_ERROR", adminQuery.error.issues.map((issue) => ({ field: formatIssuePath(issue.path), code: "VALIDATION_ERROR", message: issue.message })));
                    const result = await requestTypes.SearchAdmin(actor, adminQuery.data);
                    return Response.json(z.array(adminRequestTypeSummarySchema).parse(result.items), { headers: { "X-Pagination": JSON.stringify(result.pagination) } });
                }
                const query = requestTypeSearchSchema.safeParse(value);
                if (!query.success) throw new HttpError("VALIDATION_ERROR");
                const result = await service.Types(actor, query.data);
                return Response.json(z.array(publishedRequestTypeSchema).parse(result.items), { headers: { "X-Pagination": JSON.stringify(result.pagination) } });
            }
            if (action === "search")
            {
                const query = requestSearchSchema.safeParse(value);
                if (!query.success) throw new RequestError("VALIDATION_ERROR", query.error.issues.map((issue) => ({ field: formatIssuePath(issue.path), code: "VALIDATION_ERROR", message: issue.message })));
                const result = await service.Search(actor, query.data);
                return Response.json(z.array(requestSummarySchema).parse(result.items), { headers: { "X-Pagination": JSON.stringify(result.pagination) } });
            }
            const schema = action === "create" ? createRequestSchema : action === "patch" ? patchDraftSchema : action === "withdraw" ? withdrawRequestSchema : submitRequestSchema;
            const parsed = schema.safeParse(value);
            if (!parsed.success) throw new RequestError("VALIDATION_ERROR", parsed.error.issues.map((issue) => ({ field: formatIssuePath(issue.path), code: "VALIDATION_ERROR", message: issue.message })));
            const key = request.headers.get("idempotency-key");
            if ((action !== "patch" || key !== null) && !z.uuid().safeParse(key).success) throw new HttpError("VALIDATION_ERROR");
            const result = requestDetailSchema.parse(await service.Mutate(actor, action, params.id ?? null, parsed.data, key?.toLowerCase()));
            return Response.json(result, { status: action === "create" ? 201 : 200, headers: action === "create" ? { Location: `/api/v1/requests/${result.id}` } : {} });
        }, { parse: "none" });
    }
}
