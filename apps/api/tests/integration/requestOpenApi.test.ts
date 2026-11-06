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
