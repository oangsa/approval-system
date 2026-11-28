import { expect, test } from "vitest";
import { createRequestOpenApi } from "../../src/Presentations/Routes/RequestRoutes";

test("CT-01 request OpenAPI uses the strict shared contracts and critical-action headers", () =>
{
    const document = createRequestOpenApi();
    expect(document.paths["/api/v1/requests"]?.post).toMatchObject({
        requestBody: { content: { "application/json": { schema: { additionalProperties: false } } } },
        responses: { "201": { description: "Success" } },
    });
    expect(document.paths["/api/v1/requests/{id}/submit"]?.post).toMatchObject({
        parameters: expect.arrayContaining([{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", format: "uuid" } }]),
    });
    expect(document.paths["/api/v1/requests/{id}/draft"]?.patch).toMatchObject({
        requestBody: { content: { "application/json": { schema: { required: expect.arrayContaining(["expectedVersion"]) } } } },
    });
});

test("request search OpenAPI declares strict input, bearer authentication and pagination", () =>
{
    expect(createRequestOpenApi().paths["/api/v1/requests/search"]?.post).toMatchObject({
        security: [{ bearerAuth: [] }],
        requestBody: { content: { "application/json": { schema: { additionalProperties: false } } } },
        responses: { "200": { headers: { "X-Pagination": { schema: { required: expect.arrayContaining(["currentPage", "pageSize", "totalPages", "totalCount", "hasPrevious", "hasNext"]) } } }, content: { "application/json": { schema: { type: "array", items: { additionalProperties: false, required: expect.arrayContaining(["id", "requestNumber", "typeId", "typeCode", "title", "priority", "status", "requester", "department", "revisionNumber", "currentCycleId", "createdAt", "updatedAt", "submittedAt", "version"]) } } } } } },
    });
});

test("pinned definition OpenAPI declares version and request context with the shared response", () =>
{
    expect(createRequestOpenApi().paths["/api/v1/request-types/{id}/versions/{versionId}"]?.get).toMatchObject({
        parameters: expect.arrayContaining([
            expect.objectContaining({ name: "versionId", in: "path", required: true }),
            expect.objectContaining({ name: "requestId", in: "query", required: false }),
        ]),
        responses: { "200": { content: { "application/json": { schema: { required: expect.arrayContaining(["versionId", "fields"]) } } } } },
    });
});

test("withdraw OpenAPI requires UUID key and version while reason remains optional", () =>
{
    expect(createRequestOpenApi().paths["/api/v1/requests/{id}/withdraw"]?.post).toMatchObject({
        parameters: expect.arrayContaining([{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", format: "uuid" } }]),
        requestBody: { content: { "application/json": { schema: { additionalProperties: false, required: ["expectedVersion"], properties: { reason: { type: "string" } } } } } },
        responses: { "200": { description: "Success" } },
    });
});

test("RR-AC revision and resubmit OpenAPI documents strict bounded contracts", () =>
{
    const paths = createRequestOpenApi().paths;
    expect(paths["/api/v1/requests/{id}/resubmit"]?.post).toMatchObject({ parameters: expect.arrayContaining([expect.objectContaining({ name: "Idempotency-Key", required: true })]), requestBody: { content: { "application/json": { schema: { additionalProperties: false, required: ["expectedVersion"] } } } } });
    expect(paths["/api/v1/requests/{id}/revisions"]?.get).toMatchObject({ responses: { "200": { headers: { "X-Pagination": expect.anything() }, content: { "application/json": { schema: { type: "array" } } } } } });
    expect(paths["/api/v1/requests/{id}/revisions/{revisionId}"]?.get).toMatchObject({ parameters: expect.arrayContaining([expect.objectContaining({ name: "revisionId", required: true })]) });
});

test("approvers OpenAPI exposes a strict direct array", () =>
{
    expect(createRequestOpenApi().paths["/api/v1/requests/{id}/approvers"]?.get).toMatchObject({
        security: [{ bearerAuth: [] }], responses: { "200": { content: { "application/json": { schema: { type: "array", items: { additionalProperties: false, required: ["slotId", "stageNumber", "reviewer", "status"] } } } } } },
    });
});

test("CMT-CT-04 comments OpenAPI documents GET and POST with bearerAuth, pagination, Location, and errorResponseSchema", () =>
{
    const paths = createRequestOpenApi().paths;
    const commentsPath = paths["/api/v1/requests/{id}/comments"];
    expect(commentsPath?.get).toMatchObject({
        security: [{ bearerAuth: [] }],
        parameters: expect.arrayContaining([
            expect.objectContaining({ name: "id", in: "path", required: true }),
            expect.objectContaining({ name: "pageNumber", in: "query", schema: expect.objectContaining({ minimum: 1, maximum: 10000 }) }),
            expect.objectContaining({ name: "pageSize", in: "query", schema: expect.objectContaining({ minimum: 1, maximum: 100 }) }),
        ]),
        responses: {
            "200": {
                headers: {
                    "X-Pagination": { schema: { required: expect.arrayContaining(["currentPage", "pageSize", "totalPages", "totalCount", "hasPrevious", "hasNext"]) } },
                },
                content: {
                    "application/json": {
                        schema: {
                            type: "array",
                            items: {
                                additionalProperties: false,
                                required: expect.arrayContaining(["id", "requestId", "author", "body", "createdAt"]),
                            },
                        },
                    },
                },
            },
            default: {
                content: {
                    "application/json": {
                        schema: { required: expect.arrayContaining(["statusCode", "code", "message", "error", "requestId"]) },
                    },
                },
            },
        },
    });

    expect(commentsPath?.post).toMatchObject({
        security: [{ bearerAuth: [] }],
        parameters: expect.arrayContaining([expect.objectContaining({ name: "id", in: "path", required: true })]),
        requestBody: {
            required: true,
            content: {
                "application/json": {
                    schema: { additionalProperties: false, required: ["body"] },
                },
            },
        },
        responses: {
            "201": {
                headers: { Location: expect.anything() },
                content: {
                    "application/json": {
                        schema: {
                            additionalProperties: false,
                            required: expect.arrayContaining(["id", "requestId", "author", "body", "createdAt"]),
                        },
                    },
                },
            },
            default: expect.anything(),
        },
    });
});

test("ATT-CT-05 attachments OpenAPI documents list, multipart upload, delete, and binary download routes", () =>
{
    const paths = createRequestOpenApi().paths;
    const collection = paths["/api/v1/requests/{id}/attachments"];
    expect(collection?.get).toMatchObject({
        security: [{ bearerAuth: [] }],
        parameters: expect.arrayContaining([
            expect.objectContaining({ name: "id", in: "path", required: true }),
            expect.objectContaining({ name: "pageNumber", in: "query" }),
            expect.objectContaining({ name: "pageSize", in: "query" }),
            expect.objectContaining({ name: "revisionId", in: "query", required: false }),
        ]),
        responses: {
            "200": {
                headers: { "X-Pagination": expect.anything() },
                content: {
                    "application/json": {
                        schema: {
                            type: "array",
                            items: {
                                additionalProperties: false,
                                required: expect.arrayContaining([
                                    "id",
                                    "requestId",
                                    "workingOrSubmittedRevisionId",
                                    "fileName",
                                    "mediaType",
                                    "sizeBytes",
                                    "uploadedBy",
                                    "uploadedAt",
                                ]),
                            },
                        },
                    },
                },
            },
            default: expect.anything(),
        },
    });

    expect(collection?.post).toMatchObject({
        security: [{ bearerAuth: [] }],
        requestBody: {
            required: true,
            content: {
                "multipart/form-data": {
                    schema: {
                        type: "object",
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
                headers: { Location: expect.anything() },
                content: {
                    "application/json": {
                        schema: {
                            additionalProperties: false,
                            required: expect.arrayContaining(["id", "requestId", "workingOrSubmittedRevisionId", "fileName", "mediaType", "sizeBytes", "uploadedBy", "uploadedAt"]),
                        },
                    },
                },
            },
            default: expect.anything(),
        },
    });

    expect(paths["/api/v1/requests/{id}/attachments/{attachmentId}"]?.delete).toMatchObject({
        security: [{ bearerAuth: [] }],
        parameters: expect.arrayContaining([
            expect.objectContaining({ name: "id", in: "path", required: true }),
            expect.objectContaining({ name: "attachmentId", in: "path", required: true }),
        ]),
        responses: {
            "204": { description: "No Content" },
            default: expect.anything(),
        },
    });

    expect(paths["/api/v1/attachments/{id}/download"]?.get).toMatchObject({
        security: [{ bearerAuth: [] }],
        parameters: expect.arrayContaining([
            expect.objectContaining({ name: "id", in: "path", required: true }),
        ]),
        responses: {
            "200": {
                headers: {
                    "Content-Disposition": expect.anything(),
                    "X-Content-Type-Options": expect.anything(),
                    "Content-Length": expect.anything(),
                },
                content: {
                    "application/octet-stream": {
                        schema: { type: "string", format: "binary" },
                    },
                },
            },
            default: expect.anything(),
        },
    });
});
