import { expect, test } from "vitest";
import { createDecisionOpenApi } from "../../src/Presentations/Routes/DecisionRoutes";
test("decision OpenAPI exposes exact result, key and bounded timeline pagination", () =>
{
    const paths = createDecisionOpenApi().paths;
    expect(paths["/api/v1/approval-tasks/{id}/decisions"].post.parameters).toContainEqual({ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", format: "uuid" } });
    expect(paths["/api/v1/approval-tasks/{id}/decisions"].post.responses["201"].content["application/json"].schema).toMatchObject({ type: "object", additionalProperties: false });
    expect(paths["/api/v1/requests/{id}/timeline"].get.responses["200"]).toMatchObject({ headers: { "X-Pagination": expect.anything() }, content: { "application/json": { schema: { type: "array" } } } });
});
