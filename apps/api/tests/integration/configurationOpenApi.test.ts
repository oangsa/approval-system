import { expect, test } from "vitest";
import { createConfigurationOpenApi } from "../../src/Presentations/Routes/ConfigurationRoutes";
test("PRB-AC-01/05 EP-022/049–060 strict admin API contracts and publication key", () =>
{
    const document = createConfigurationOpenApi();
    expect(Object.keys(document.paths)).toHaveLength(13);
    expect(document.paths["/api/v1/admin/approval-policies/{id}/publish"]?.post).toMatchObject({ parameters: expect.arrayContaining([{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", format: "uuid" } }]), responses: { "201": expect.any(Object) } });
    for (const path of ["/api/v1/admin/approval-policies/{id}/draft", "/api/v1/admin/reviewer-assignments/{id}", "/api/v1/admin/budget-policies/{id}"])
        expect(document.paths[path]?.patch).toMatchObject({ requestBody: { content: { "application/json": { schema: { additionalProperties: false, required: expect.arrayContaining(["expectedVersion"]) } } } } });
    expect(document.paths["/api/v1/reviewers/eligible/search"]?.post).toMatchObject({ security: [{ bearerAuth: [] }], responses: { "200": { headers: { "X-Pagination": expect.any(Object) } } } });
});

test("PRB-AC-01 cross-origin admin publish and PATCH permit the required headers and methods", async () =>
{
    const { preflight } = await import("../../src/Presentations/cors");
    for (const [path, method, headers] of [
        ["/api/v1/admin/approval-policies/11111111-1111-4111-8111-111111111111/publish", "POST", "authorization,content-type,idempotency-key"],
        ["/api/v1/admin/approval-policies/11111111-1111-4111-8111-111111111111/draft", "PATCH", "authorization,content-type,idempotency-key"],
        ["/api/v1/admin/reviewer-assignments/11111111-1111-4111-8111-111111111111", "PATCH", "authorization,content-type"],
        ["/api/v1/admin/budget-policies/11111111-1111-4111-8111-111111111111", "PATCH", "authorization,content-type"],
    ])
    {
        const response = preflight(new Request(`http://localhost${path}`, { method: "OPTIONS", headers: { Origin: "http://localhost:3000", "Access-Control-Request-Method": method!, "Access-Control-Request-Headers": headers! } }), ["http://localhost:3000"]);
        expect(response.status).toBe(204);
        expect(response.headers.get("Access-Control-Allow-Methods")).toContain(method!);
        expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Idempotency-Key");
    }
});
