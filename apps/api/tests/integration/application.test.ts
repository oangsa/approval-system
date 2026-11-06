import { afterEach, expect, test, vi } from "vitest";
import { z } from "zod";
import { errorDetailSchema, errorResponseSchema, healthResponseSchema, loginResponseSchema } from "@workflow/contracts";
import { createApplication } from "../../src/Presentations/createApplication";
import { errorResponse } from "../../src/Presentations/errors";
import { identityHttpFixture, expectHttpError } from "../helpers/identityHttp";

afterEach(() => vi.restoreAllMocks());
test("application initializes without binding a listener", () =>
{
    expect(createApplication().server).toBeNull();
});
test("health endpoint returns the shared successful response", async () =>
{
    const response = await createApplication().handle(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({ status: "ok" });
});
test("HTTP-CONTINUE red: unknown route uses complete error envelope", async () =>
{
    const response = await createApplication().handle(new Request("http://localhost/missing"));
    await expectHttpError(response, 404);
    const result = errorResponseSchema.parse(await response.json());
    expect(result).toMatchObject({ statusCode: 404, code: "NOT_FOUND", message: "Not found", error: "Not Found" });
    expect(response.headers.get("x-request-id")).toBe(result.requestId);
    expect(response.headers.get("cache-control")).toBe("no-store");
});
test("unexpected errors do not expose secrets or stack traces", async () =>
{
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const app = createApplication().get("/test-error", () => 
{
 throw new Error("sensitive-infrastructure-value"); 
});
    const response = await app.handle(new Request("http://localhost/test-error"));
    const result = await expectHttpError(response, 500);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(log.mock.calls).toEqual([[{ code: "INTERNAL_ERROR", requestId: result.requestId }]]);
    expect(response.status).toBe(500);
    expect(result.code).toBe("INTERNAL_ERROR");
    expect(log).toHaveBeenCalledWith({ code: "INTERNAL_ERROR", requestId: result.requestId });
});


test.each([["NOT_FOUND", 404, "NOT_FOUND"], ["PARSE", 400, "BAD_REQUEST"], ["VALIDATION", 422, "VALIDATION_ERROR"], [418, 500, "INTERNAL_ERROR"]] as const)("framework mapping %s", (frameworkCode, status, code) =>
{
    expect(errorResponse(new Error(), frameworkCode, "request")).toMatchObject({ statusCode: status, code });
});

test.each(["login", "refresh", "me"] as const)("recognized repository outage on %s fails closed", async (endpoint) =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
    const token = (await login.json() as { accessToken: string }).accessToken;
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const before = structuredClone({ accounts: fixture.accounts, families: fixture.families, history: fixture.history });
    fixture.failures.set(endpoint === "login" ? "FindUserByEmail" : endpoint === "refresh" ? "FindRefreshTokenByHash" : "ReadCurrentIdentity", { cause: { code: "ECONNRESET" } });
    const response = await app.handle(new Request("http://localhost/api/v1/auth/" + endpoint, endpoint === "me" ? { headers: { authorization: "Bearer " + token } } : { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", cookie }, ...(endpoint === "login" ? { body: JSON.stringify({ email: fixture.account.email, password: "password" }) } : {}) }));
    await expectHttpError(response, 503);
    expect(fixture.accounts).toEqual(before.accounts);
    expect(fixture.families).toEqual(before.families);
    expect(fixture.history).toEqual(before.history);
    expect(response.status).toBe(503);
    expect(response.headers.get("set-cookie")).toBeNull();
    const body = errorResponseSchema.parse(await response.json());
    expect(body.code).toBe("SERVICE_UNAVAILABLE");
    expect(log.mock.calls).toEqual([[{ code: "SERVICE_UNAVAILABLE", requestId: body.requestId }]]);
    expect(log).toHaveBeenCalledWith({ code: "SERVICE_UNAVAILABLE", requestId: body.requestId });
    expect(JSON.stringify([body, log.mock.calls])).not.toMatch(/ECONNRESET|password|hash|Bearer|refreshToken|stack/i);
});

test.each(["login", "refresh", "me"] as const)("repository failure shapes on %s preserve safe classification", async (endpoint) =>
{
    const nested = (depth: number): unknown => depth === 1 ? { code: "ECONNRESET", message: "SQL sentinel" } : { cause: nested(depth - 1) };
    const cases: Array<[string, () => unknown, number]> = [
        ["Error cause", () => new Error("raw sentinel", { cause: { code: "ECONNRESET" } }), 503],
        ["fifth object", () => nested(5), 503],
        ["sixth object", () => nested(6), 500],
        ["arbitrary Error", () => new Error("raw sentinel"), 500],
        ["null", () => null, 500],
    ];
    for (const [name, failure, status] of cases)
    {
        const fixture = identityHttpFixture();
        const app = createApplication(undefined, fixture.dependencies);
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
        expect(login.status, name).toBe(200);
        const { accessToken } = loginResponseSchema.parse(await login.json());
        const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
        const before = structuredClone({ families: fixture.families, history: fixture.history });
        fixture.failures.set(endpoint === "login" ? "FindUserByEmail" : endpoint === "refresh" ? "FindRefreshTokenByHash" : "ReadCurrentIdentity", failure());
        const response = await app.handle(new Request("http://localhost/api/v1/auth/" + endpoint, endpoint === "me" ? { headers: { authorization: "Bearer " + accessToken } } : { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", cookie }, ...(endpoint === "login" ? { body: JSON.stringify({ email: fixture.account.email, password: "password" }) } : {}) }));
        await expectHttpError(response, status as 500 | 503);
        expect(response.status, name).toBe(status);
        expect(response.headers.get("set-cookie")).toBeNull();
        const cacheDirectives = (response.headers.get("cache-control") ?? "").split(",").map((directive) => directive.trim().toLowerCase());
        expect(new Set(cacheDirectives)).toEqual(new Set(["no-store"]));
        const body = errorResponseSchema.parse(await response.json());
        const code = status === 503 ? "SERVICE_UNAVAILABLE" : "INTERNAL_ERROR";
        expect(body).toEqual({ statusCode: status, code, message: status === 503 ? "Service unavailable" : "Internal server error", error: status === 503 ? "Service Unavailable" : "Internal Server Error", requestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) });
        expect(response.headers.get("x-request-id")).toBe(body.requestId);
        expect(log.mock.calls).toEqual([[{ code, requestId: body.requestId }]]);
        expect(log).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalledWith({ code, requestId: body.requestId });
        expect(JSON.stringify([body, log.mock.calls])).not.toMatch(/ECONNRESET|sentinel|SQL|password|hash|Bearer|refreshToken|stack/i);
        expect(fixture.families).toEqual(before.families);
        expect(fixture.history).toEqual(before.history);
        log.mockRestore();
    }
});
test.each([
    ["uppercase UUID", "AABBCCDD-1234-4ABC-8ABC-123456789ABC", "aabbccdd-1234-4abc-8abc-123456789abc"],
    ["non-v4 UUID", "aabbccdd-1234-1abc-8abc-123456789abc", "aabbccdd-1234-1abc-8abc-123456789abc"],
    ["invalid", "not-a-uuid", undefined],
    ["absent", undefined, undefined],
])("request IDs on success and error: %s", async (_name, supplied, expected) =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const headers: Record<string, string> = { origin: "http://localhost:3000", "content-type": "application/json" };
    if (supplied) headers["x-request-id"] = supplied;
    const success = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
    expect(success.status).toBe(200);
    loginResponseSchema.parse(await success.json());
    const error = await app.handle(new Request("http://localhost/api/v1/auth/me", { headers }));
    const envelope = await expectHttpError(error, 401);
    for (const id of [success.headers.get("x-request-id"), envelope.requestId])
    {
        if (expected) expect(id).toBe(expected);
        else expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
});

test("HTTP parse, validation, origin and credential errors use exact safe envelopes", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const cases = [
        [400, "{", "http://localhost:3000"],
        [422, JSON.stringify({ email: "invalid", password: "input-sentinel" }), "http://localhost:3000"],
        [403, JSON.stringify({ email: fixture.account.email, password: "password" }), "https://forbidden.example"],
        [401, JSON.stringify({ email: fixture.account.email, password: "input-sentinel" }), "http://localhost:3000"],
    ] as const;
    for (const [status, body, origin] of cases)
    {
        const response = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body }));
        await expectHttpError(response, status);
        expect(response.headers.get("set-cookie")).toBeNull();
    }
    expect(fixture.families.size).toBe(0);
    expect(fixture.history.size).toBe(0);
});

test("R1 error envelope exposes exactly the documented keys with a mirrored v4 requestId", async () =>
{
    const response = await createApplication().handle(new Request("http://localhost/missing"));
    expect(response.status).toBe(404);
    const body = errorResponseSchema.parse(await response.json());
    expect(Object.keys(body).sort()).toEqual(["code", "error", "message", "requestId", "statusCode"]);
    expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
    expect(response.headers.get("cache-control")).toBe("no-store");
});

test("R1 supplied uppercase request id is normalized on success and error envelopes", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const supplied = "AABBCCDD-EEFF-4011-8222-333344445555";
    const normalized = supplied.toLowerCase();
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { "x-request-id": supplied, origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
    expect(login.status).toBe(200);
    expect(login.headers.get("x-request-id")).toBe(normalized);
    const error = await app.handle(new Request("http://localhost/api/v1/auth/me", { headers: { "x-request-id": supplied } }));
    const body = await expectHttpError(error, 401);
    expect(body.requestId).toBe(normalized);
    expect(error.headers.get("x-request-id")).toBe(normalized);
});

test("R5 CT-04 strict contract validation of error responses and ErrorDetail required fields", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const responses = [
        await app.handle(new Request("http://localhost/missing")),
        await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: "{" })),
        await app.handle(new Request("http://localhost/api/v1/auth/me", { headers: {} })),
        await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin: "https://forbidden.example", "content-type": "application/json" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) })),
        await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ email: "invalid", password: "password" }) })),
    ];
    for (const response of responses)
    {
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.status).toBeLessThan(500);
        const body = errorResponseSchema.parse(await response.json());
        expect(response.headers.get("x-request-id")).toBe(body.requestId);
        expect(body).not.toHaveProperty("details");
    }
    const envelopeSchema = z.toJSONSchema(errorResponseSchema);
    expect(envelopeSchema.required).toEqual(["statusCode", "code", "message", "error", "requestId"]);
    const detailSchema = z.toJSONSchema(errorDetailSchema);
    expect(detailSchema.required).toEqual(["field", "code", "message"]);
    expect(errorDetailSchema.safeParse({ field: "email", message: "Invalid email" }).success).toBe(false);
    expect(errorDetailSchema.safeParse({ field: "email", code: "INVALID_FORMAT", message: "Invalid email" }).success).toBe(true);
    expect(errorDetailSchema.safeParse({ field: "email", code: "INVALID_FORMAT", message: "Invalid email", extra: true }).success).toBe(false);
});
