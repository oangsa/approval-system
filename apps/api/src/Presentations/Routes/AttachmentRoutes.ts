import { z } from "zod";
import {
    attachmentQuerySchema,
    attachmentSchema,
    errorResponseSchema,
    paginationSchema,
} from "@workflow/contracts";
import type { AttachmentService } from "../../Applications/Requests/AttachmentService";
import { BuildContentDisposition } from "../../Domains/Requests/AttachmentRules";
import { RequestError } from "../../Domains/Requests/RequestRules";
import type { IIdentityHttpDependencies } from "../composition";
import { requireAuthentication } from "../Guards/authentication";
import { HttpError } from "../errors";

export function createAttachmentOpenApiPaths(): Record<string, Record<string, unknown>>
{
    const idParameter = { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } };
    const attachmentIdParameter = { name: "attachmentId", in: "path", required: true, schema: { type: "string", format: "uuid" } };
    const defaultError = { description: "Error", content: { "application/json": { schema: z.toJSONSchema(errorResponseSchema) } } };

    return {
        "/api/v1/requests/{id}/attachments": {
            get: {
                security: [{ bearerAuth: [] }],
                parameters: [
                    idParameter,
                    { name: "pageNumber", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 10000 } },
                    { name: "pageSize", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
                    { name: "revisionId", in: "query", required: false, schema: { type: "string", format: "uuid" } },
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
                        content: { "application/json": { schema: z.toJSONSchema(z.array(attachmentSchema)) } },
                    },
                    default: defaultError,
                },
            },
            post: {
                security: [{ bearerAuth: [] }],
                parameters: [idParameter],
                requestBody: {
                    required: true,
                    content: {
                        "multipart/form-data": {
                            schema: {
                                type: "object",
                                additionalProperties: false,
                                required: ["file"],
                                properties: {
                                    file: { type: "string", format: "binary" },
                                    workingRevisionId: { type: "string", format: "uuid" },
                                },
                            },
                        },
                    },
                },
                responses: {
                    "201": {
                        description: "Created",
                        headers: {
                            Location: {
                                description: "URI of the attachment download endpoint",
                                schema: { type: "string" },
                            },
                        },
                        content: { "application/json": { schema: z.toJSONSchema(attachmentSchema) } },
                    },
                    default: defaultError,
                },
            },
        },
        "/api/v1/requests/{id}/attachments/{attachmentId}": {
            delete: {
                security: [{ bearerAuth: [] }],
                parameters: [idParameter, attachmentIdParameter],
                responses: {
                    "204": { description: "No Content" },
                    default: defaultError,
                },
            },
        },
        "/api/v1/attachments/{id}/download": {
            get: {
                security: [{ bearerAuth: [] }],
                parameters: [idParameter],
                responses: {
                    "200": {
                        description: "Binary attachment stream",
                        headers: {
                            "Content-Disposition": { schema: { type: "string" } },
                            "X-Content-Type-Options": { schema: { type: "string" } },
                            "Content-Length": { schema: { type: "string" } },
                        },
                        content: {
                            "application/octet-stream": {
                                schema: { type: "string", format: "binary" },
                            },
                        },
                    },
                    default: defaultError,
                },
            },
        },
    };
}

export function registerAttachmentRoutes(app: {
    route(method: "GET" | "POST" | "DELETE", path: string, handler: (context: { request: Request; params: Record<string, string> }) => Promise<Response>, hook: { parse: "none" }): unknown;
}, identity: IIdentityHttpDependencies, service: AttachmentService): void
{
    app.route("GET", "/api/v1/requests/:id/attachments", async ({ request, params = {} }) =>
    {
        const actor = await requireAuthentication(request.headers.get("authorization"), identity.authenticate);
        if (!z.uuid().safeParse(params.id).success)
        {
            throw new HttpError("NOT_FOUND");
        }

        const query = attachmentQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
        if (!query.success)
        {
            throw new HttpError("VALIDATION_ERROR");
        }

        const result = await service.ListAttachments(actor, params.id!, query.data);
        return Response.json(z.array(attachmentSchema).parse(result.items), {
            headers: {
                "X-Pagination": JSON.stringify(result.pagination),
                "Cache-Control": "no-store",
            },
        });
    }, { parse: "none" });

    app.route("POST", "/api/v1/requests/:id/attachments", async ({ request, params = {} }) =>
    {
        const actor = await requireAuthentication(request.headers.get("authorization"), identity.authenticate);
        if (!z.uuid().safeParse(params.id).success)
        {
            throw new HttpError("NOT_FOUND");
        }

        const contentType = request.headers.get("content-type") ?? "";
        if (!contentType.toLowerCase().includes("multipart/form-data"))
        {
            throw new HttpError("BAD_REQUEST");
        }

        let formData: FormData;
        try
        {
            formData = await request.formData();
        }
        catch
        {
            throw new HttpError("BAD_REQUEST");
        }

        const fileEntry = formData.get("file");
        if (!fileEntry || typeof fileEntry === "string" || typeof (fileEntry as Blob).arrayBuffer !== "function")
        {
            throw new RequestError("VALIDATION_ERROR", [
                { field: "file", code: "VALIDATION_ERROR", message: "Attachment file is required." },
            ]);
        }

        const workingRevisionIdEntry = formData.get("workingRevisionId");
        let workingRevisionId: string | undefined;
        if (workingRevisionIdEntry !== null)
        {
            if (typeof workingRevisionIdEntry !== "string" || !z.uuid().safeParse(workingRevisionIdEntry).success)
            {
                throw new RequestError("VALIDATION_ERROR", [
                    { field: "workingRevisionId", code: "VALIDATION_ERROR", message: "workingRevisionId must be a valid UUID." },
                ]);
            }
            workingRevisionId = workingRevisionIdEntry;
        }

        const file = fileEntry as File;
        const bytes = new Uint8Array(await file.arrayBuffer());
        const created = await service.UploadAttachment({
            actor,
            requestId: params.id!,
            fileName: typeof file.name === "string" ? file.name : "attachment",
            declaredMediaType: file.type ?? "",
            bytes,
            ...(workingRevisionId !== undefined ? { workingRevisionId } : {}),
        });

        return Response.json(attachmentSchema.parse(created), {
            status: 201,
            headers: {
                Location: `/api/v1/attachments/${created.id}/download`,
                "Cache-Control": "no-store",
            },
        });
    }, { parse: "none" });

    app.route("DELETE", "/api/v1/requests/:id/attachments/:attachmentId", async ({ request, params = {} }) =>
    {
        const actor = await requireAuthentication(request.headers.get("authorization"), identity.authenticate);
        if (!z.uuid().safeParse(params.id).success || !z.uuid().safeParse(params.attachmentId).success)
        {
            throw new HttpError("NOT_FOUND");
        }

        await service.DeleteWorkingAttachment({
            actor,
            requestId: params.id!,
            attachmentId: params.attachmentId!,
        });

        return new Response(null, {
            status: 204,
            headers: {
                "Cache-Control": "no-store",
            },
        });
    }, { parse: "none" });

    app.route("GET", "/api/v1/attachments/:id/download", async ({ request, params = {} }) =>
    {
        const actor = await requireAuthentication(request.headers.get("authorization"), identity.authenticate);
        if (!z.uuid().safeParse(params.id).success)
        {
            throw new HttpError("NOT_FOUND");
        }

        const result = await service.DownloadAttachment({
            actor,
            attachmentId: params.id!,
        });

        const contentType = result.attachment.mediaType === "text/plain"
            ? "text/plain; charset=utf-8"
            : result.attachment.mediaType;

        return new Response(result.stream, {
            status: 200,
            headers: {
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Type": contentType,
                "Content-Disposition": BuildContentDisposition(result.attachment.fileName),
                "Content-Length": String(result.contentLength),
            },
        });
    }, { parse: "none" });
}
