import { z } from "zod";
import {
    adminRequestTypeSummarySchema,
    createRequestTypeSchema,
    errorResponseSchema,
    patchRequestTypeDraftSchema,
    publishedRequestTypeSchema,
    requestTypeDraftDtoSchema,
    versionedRequestTypeActionSchema,
} from "@workflow/contracts";
import type { RequestTypeService } from "../../Applications/RequestTypes/RequestTypeService";
import { RequestTypeError } from "../../Domains/RequestTypes/RequestTypeRules";
import type { IIdentityHttpDependencies } from "../composition";
import { requireAuthentication } from "../Guards/authentication";
import { HttpError } from "../errors";

const adminRequestTypeRoutes = [
    ["POST", "/api/v1/admin/request-types", "create"],
    ["PATCH", "/api/v1/admin/request-types/:id/draft", "patch"],
    ["POST", "/api/v1/admin/request-types/:id/draft", "branch"],
    ["POST", "/api/v1/admin/request-types/:id/publish", "publish"],
    ["POST", "/api/v1/admin/request-types/:id/enable", "enable"],
    ["POST", "/api/v1/admin/request-types/:id/disable", "disable"],
] as const;

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

export function createRequestTypeOpenApi()
{
    const paths: Record<string, Record<string, unknown>> = {};
    for (const [method, path, action] of adminRequestTypeRoutes)
    {
        const body = action === "create"
            ? createRequestTypeSchema
            : action === "patch"
                ? patchRequestTypeDraftSchema
                : versionedRequestTypeActionSchema;
        const response = action === "publish"
            ? publishedRequestTypeSchema
            : action === "enable" || action === "disable"
                ? adminRequestTypeSummarySchema
                : requestTypeDraftDtoSchema;
        const status = action === "create" || action === "branch" || action === "publish" ? "201" : "200";
        const normalizedPath = path.replace(":id", "{id}");
        paths[normalizedPath] ??= {};
        paths[normalizedPath]![method.toLowerCase()] = {
            security: [{ bearerAuth: [] }],
            parameters: [
                ...(path.includes(":id") ? [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }] : []),
                { name: "Idempotency-Key", in: "header", required: action === "publish", schema: { type: "string", format: "uuid" } },
            ],
            requestBody: { required: true, content: { "application/json": { schema: z.toJSONSchema(body, { io: "input" }) } } },
            responses: {
                [status]: { description: "Success", content: { "application/json": { schema: z.toJSONSchema(response) } } },
                default: { description: "Error", content: { "application/json": { schema: z.toJSONSchema(errorResponseSchema) } } },
            },
        };
    }
    return {
        openapi: "3.1.0",
        info: { title: "Request type configuration API", version: "1.0.0" },
        paths,
        components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } } },
    };
}

export function registerRequestTypeRoutes(
    app: {
        route(
            method: "GET" | "POST" | "PATCH",
            path: string,
            handler: (context: { request: Request; params: Record<string, string> }) => Promise<Response>,
            hook: { parse: "none" },
        ): unknown;
    },
    identity: IIdentityHttpDependencies,
    service: RequestTypeService,
): void
{
    for (const [method, path, action] of adminRequestTypeRoutes)
    {
        app.route(method, path, async ({ request, params = {} }) =>
        {
            const actor = await requireAuthentication(request.headers.get("authorization"), identity.authenticate);
            if (params.id && !z.uuid().safeParse(params.id).success) throw new HttpError("NOT_FOUND");
            let value: unknown;
            try
            {
                value = await request.json();
            }
            catch
            {
                throw new HttpError("BAD_REQUEST");
            }

            const schema = action === "create"
                ? createRequestTypeSchema
                : action === "patch"
                    ? patchRequestTypeDraftSchema
                    : versionedRequestTypeActionSchema;
            const parsed = schema.safeParse(value);
            if (!parsed.success)
            {
                throw new RequestTypeError(
                    "VALIDATION_ERROR",
                    parsed.error.issues.map((issue) => ({
                        field: formatIssuePath(issue.path),
                        code: "VALIDATION_ERROR",
                        message: issue.message,
                    })),
                );
            }

            const key = request.headers.get("idempotency-key");
            if ((action === "publish" || key !== null) && !z.uuid().safeParse(key).success)
            {
                throw new HttpError("VALIDATION_ERROR");
            }
            const normalizedKey = key?.toLowerCase();

            if (action === "create")
            {
                const result = requestTypeDraftDtoSchema.parse(await service.Create(actor, parsed.data as z.infer<typeof createRequestTypeSchema>, normalizedKey));
                return Response.json(result, { status: 201, headers: { Location: `/api/v1/request-types/${result.id}?view=admin` } });
            }
            if (action === "patch")
            {
                const result = requestTypeDraftDtoSchema.parse(await service.PatchDraft(actor, params.id!, parsed.data as z.infer<typeof patchRequestTypeDraftSchema>, normalizedKey));
                return Response.json(result, { status: 200 });
            }
            if (action === "branch")
            {
                const result = requestTypeDraftDtoSchema.parse(await service.BranchDraft(actor, params.id!, parsed.data as z.infer<typeof versionedRequestTypeActionSchema>, normalizedKey));
                return Response.json(result, { status: 201, headers: { Location: `/api/v1/request-types/${result.id}?view=admin` } });
            }
            if (action === "publish")
            {
                const result = publishedRequestTypeSchema.parse(await service.Publish(actor, params.id!, parsed.data as z.infer<typeof versionedRequestTypeActionSchema>, normalizedKey!));
                return Response.json(result, { status: 201, headers: { Location: `/api/v1/request-types/${result.id}/versions/${result.versionId}` } });
            }
            const enabled = action === "enable";
            const result = adminRequestTypeSummarySchema.parse(await service.SetEnabled(actor, params.id!, enabled, parsed.data as z.infer<typeof versionedRequestTypeActionSchema>, normalizedKey));
            return Response.json(result, { status: 200 });
        }, { parse: "none" });
    }
}
