import { z } from "zod";
import {
    commentQuerySchema,
    commentSchema,
    createCommentSchema,
    errorResponseSchema,
    paginationSchema,
} from "@workflow/contracts";
import type { CommentService } from "../../Applications/Requests/CommentService";
import { RequestError } from "../../Domains/Requests/RequestRules";
import type { IIdentityHttpDependencies } from "../composition";
import { requireAuthentication } from "../Guards/authentication";
import { HttpError } from "../errors";

function formatIssuePath(path: readonly PropertyKey[]): string
{
    let result = "";
    for (const segment of path)
    {
        if (typeof segment === "number")
        {
            result += `[${segment}]`;
        }
        else
        {
            result += result ? `.${String(segment)}` : String(segment);
        }
    }
    return result || "body";
}

export function createCommentOpenApiPaths(): Record<string, Record<string, unknown>>
{
    const idParameter = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
    const defaultError = { description: "Error", content: { "application/json": { schema: z.toJSONSchema(errorResponseSchema) } } };

    return {
        "/api/v1/requests/{id}/comments": {
            get: {
                security: [{ bearerAuth: [] }],
                parameters: [
                    idParameter,
                    { name: "pageNumber", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 10000 } },
                    { name: "pageSize", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
                ],
                responses: {
                    "200": {
                        description: "Success",
                        headers: {
                            "X-Pagination": {
                                description: "JSON pagination metadata",
                                schema: z.toJSONSchema(paginationSchema),
                            },
                        },
                        content: { "application/json": { schema: z.toJSONSchema(z.array(commentSchema)) } },
                    },
                    default: defaultError,
                },
            },
            post: {
                security: [{ bearerAuth: [] }],
                parameters: [idParameter],
                requestBody: {
                    required: true,
                    content: { "application/json": { schema: z.toJSONSchema(createCommentSchema, { io: "input" }) } },
                },
                responses: {
                    "201": {
                        description: "Created",
                        headers: {
                            Location: {
                                description: "URI of the request comments collection",
                                schema: { type: "string" },
                            },
                        },
                        content: { "application/json": { schema: z.toJSONSchema(commentSchema) } },
                    },
                    default: defaultError,
                },
            },
        },
    };
}

export function registerCommentRoutes(app: {
    route(method: "GET" | "POST", path: string, handler: (context: { request: Request; params: Record<string, string> }) => Promise<Response>, hook: { parse: "none" }): unknown;
}, identity: IIdentityHttpDependencies, service: CommentService): void
{
    app.route("GET", "/api/v1/requests/:id/comments", async ({ request, params = {} }) =>
    {
        const actor = await requireAuthentication(request.headers.get("authorization"), identity.authenticate);
        if (!z.uuid().safeParse(params.id).success)
        {
            throw new HttpError("NOT_FOUND");
        }

        const query = commentQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (!query.success)
        {
            throw new HttpError("VALIDATION_ERROR");
        }

        const result = await service.ListComments(actor, params.id!, query.data);
        return Response.json(z.array(commentSchema).parse(result.items), {
            headers: {
                "X-Pagination": JSON.stringify(result.pagination),
                "Cache-Control": "no-store",
            },
        });
    }, { parse: "none" });

    app.route("POST", "/api/v1/requests/:id/comments", async ({ request, params = {} }) =>
    {
        const actor = await requireAuthentication(request.headers.get("authorization"), identity.authenticate);
        if (!z.uuid().safeParse(params.id).success)
        {
            throw new HttpError("NOT_FOUND");
        }

        let body: unknown;
        try
        {
            body = await request.json();
        }
        catch
        {
            throw new HttpError("BAD_REQUEST");
        }

        const parsed = createCommentSchema.safeParse(body);
        if (!parsed.success)
        {
            throw new RequestError(
                "VALIDATION_ERROR",
                parsed.error.issues.map((issue) => ({
                    field: formatIssuePath(issue.path),
                    code: "VALIDATION_ERROR",
                    message: issue.message,
                })),
            );
        }

        const created = await service.AddComment(actor, params.id!, parsed.data.body);
        return Response.json(commentSchema.parse(created), {
            status: 201,
            headers: {
                Location: `/api/v1/requests/${params.id!.toLowerCase()}/comments`,
                "Cache-Control": "no-store",
            },
        });
    }, { parse: "none" });
}
