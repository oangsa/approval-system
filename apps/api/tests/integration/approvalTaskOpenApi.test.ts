import { expect, test } from "vitest";
import { createApprovalTaskOpenApi } from "../../src/Presentations/Routes/ApprovalTaskRoutes";

test("task OpenAPI declares strict search, direct array and pagination", () =>
{
    const document = createApprovalTaskOpenApi();
    expect(document.paths["/api/v1/approval-tasks/search"].post).toMatchObject({ requestBody: { content: { "application/json": { schema: { additionalProperties: false } } } }, responses: { "200": { headers: { "X-Pagination": expect.anything() }, content: { "application/json": { schema: { type: "array" } } } } } });
    expect(document.paths["/api/v1/approval-tasks/{id}"].get).toMatchObject({ parameters: [{ name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } }] });
});
