import { expect, test } from "vitest";
import { createRequestOpenApi } from "../../src/Presentations/Routes/RequestRoutes";
import { createRequestTypeOpenApi } from "../../src/Presentations/Routes/RequestTypeRoutes";

test("CT-01/03 admin request-type OpenAPI documents strict schemas, versions, and publish Idempotency-Key", () =>
{
    const adminDoc = createRequestTypeOpenApi();
    expect(adminDoc.paths["/api/v1/admin/request-types"]?.post).toMatchObject({
        security: [{ bearerAuth: [] }],
        requestBody: { content: { "application/json": { schema: { additionalProperties: false } } } },
        responses: { "201": { description: "Success" } },
    });
    expect(adminDoc.paths["/api/v1/admin/request-types/{id}/draft"]?.patch).toMatchObject({
        requestBody: { content: { "application/json": { schema: { required: expect.arrayContaining(["expectedVersion"]) } } } },
        responses: { "200": { description: "Success" } },
    });
    expect(adminDoc.paths["/api/v1/admin/request-types/{id}/draft"]?.post).toMatchObject({
        requestBody: { content: { "application/json": { schema: { required: expect.arrayContaining(["expectedVersion"]) } } } },
        responses: { "201": { description: "Success" } },
    });
    expect(adminDoc.paths["/api/v1/admin/request-types/{id}/publish"]?.post).toMatchObject({
        parameters: expect.arrayContaining([
            expect.objectContaining({ name: "Idempotency-Key", in: "header", required: true }),
        ]),
        requestBody: { content: { "application/json": { schema: { required: expect.arrayContaining(["expectedVersion"]) } } } },
        responses: { "201": { description: "Success" } },
    });
    for (const path of ["/api/v1/admin/request-types/{id}/enable", "/api/v1/admin/request-types/{id}/disable"])
    {
        expect(adminDoc.paths[path]?.post).toMatchObject({
            requestBody: { content: { "application/json": { schema: { required: expect.arrayContaining(["expectedVersion"]) } } } },
            responses: { "200": { description: "Success" } },
        });
    }

    const requestDoc = createRequestOpenApi();
    expect(requestDoc.paths["/api/v1/request-types/search"]?.post).toMatchObject({
        parameters: expect.arrayContaining([
            expect.objectContaining({ name: "view", in: "query", required: false, schema: { type: "string", enum: ["admin"] } }),
        ]),
        requestBody: { content: { "application/json": { schema: { anyOf: expect.any(Array) } } } },
        responses: {
            "200": {
                headers: { "X-Pagination": expect.any(Object) },
                content: { "application/json": { schema: { anyOf: expect.any(Array) } } },
            },
        },
    });
    expect(requestDoc.paths["/api/v1/request-types/{id}"]?.get).toMatchObject({
        parameters: expect.arrayContaining([
            expect.objectContaining({ name: "view", in: "query", required: false, schema: { type: "string", enum: ["admin"] } }),
            expect.objectContaining({ name: "id", in: "path", required: true }),
        ]),
        responses: {
            "200": {
                content: { "application/json": { schema: { anyOf: expect.any(Array) } } },
            },
        },
    });
});
