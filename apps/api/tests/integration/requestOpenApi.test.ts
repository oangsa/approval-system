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
