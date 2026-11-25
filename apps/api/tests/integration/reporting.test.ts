import { expect, test } from "vitest";
import { loginResponseSchema } from "@workflow/contracts";
import { ReportingService } from "../../src/Applications/Reporting/ReportingService";
import type { IReportingRepository } from "../../src/Domains/Reporting/Ports";
import { createApplication } from "../../src/Presentations/createApplication";
import { createReportingOpenApi } from "../../src/Presentations/Routes/ReportingRoutes";
import { identityHttpFixture } from "../helpers/identityHttp";

test("reporting authenticates, preserves server scope and exposes direct paginated rows", async () =>
{
    const fixture = identityHttpFixture();
    const scopes: unknown[] = [];
    const repository: IReportingRepository = {
        CurrentActor: async (actor) => actor,
        Dashboard: async (actor, _scope, now) => ({ roleContext: [...actor.roles], generatedAt: now.toISOString(), summary: { ownRequests: 0, pendingRequests: 0, returnedRequests: 0, approvedRequests: 0, rejectedRequests: 0 }, recentRequests: [] }),
        Search: async (_actor, scope, query) =>
        {
            scopes.push(scope);
            return { items: [], pagination: { currentPage: query.pageNumber, pageSize: query.pageSize, totalPages: 0, totalCount: 0, hasPrevious: false, hasNext: false } };
        },
    };
    const app = createApplication(undefined, fixture.dependencies, undefined, undefined, undefined, undefined, undefined, new ReportingService({ Run: (operation) => operation(repository) }));
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
    const { accessToken } = loginResponseSchema.parse(await login.json());
    const send = (body: string, token = accessToken) => app.handle(new Request("http://localhost/api/v1/reports/requests/search", { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin: "http://localhost:3000" }, body }));
    const response = await send("{}");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(JSON.parse(response.headers.get("x-pagination")!)).toMatchObject({ totalCount: 0, totalPages: 0 });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-expose-headers")?.toLowerCase()).toContain("x-pagination");
    expect(scopes).toEqual([{ requester: true, reviewer: false, administrator: false }]);
    expect((await send('{"role":"ADMINISTRATOR"}')).status).toBe(422);
    expect((await send("{")).status).toBe(400);
    expect((await send("{}", "invalid")).status).toBe(401);
    const dashboard = await app.handle(new Request("http://localhost/api/v1/dashboard", { headers: { authorization: `Bearer ${accessToken}` } }));
    expect(dashboard.status).toBe(200);
    expect(await dashboard.json()).toMatchObject({ roleContext: ["REQUESTER"], recentRequests: [] });
    const preflight = await app.handle(new Request("http://localhost/api/v1/reports/requests/search", { method: "OPTIONS", headers: { origin: "http://localhost:3000", "access-control-request-method": "POST", "access-control-request-headers": "authorization, content-type" } }));
    expect(preflight.status).toBe(204);
    const options = (path: string, origin: string, method: string) => app.handle(new Request(`http://localhost${path}`, { method: "OPTIONS", headers: { origin, "access-control-request-method": method } }));
    expect((await options("/api/v1/dashboard", "http://localhost:3000", "GET")).status).toBe(204);
    expect((await options("/api/v1/dashboard", "http://localhost:3000", "POST")).status).toBe(403);
    expect((await options("/api/v1/reports/requests/search", "http://evil.example", "POST")).status).toBe(403);
});

test("reporting OpenAPI describes direct responses and pagination", () =>
{
    const document = createReportingOpenApi();
    expect(document.paths["/api/v1/reports/requests/search"].post).toMatchObject({ requestBody: { content: { "application/json": { schema: { additionalProperties: false } } } }, responses: { "200": { headers: { "X-Pagination": expect.anything() }, content: { "application/json": { schema: { type: "array" } } } } } });
    expect(document.paths["/api/v1/dashboard"].get.responses["200"]).toBeDefined();
});
