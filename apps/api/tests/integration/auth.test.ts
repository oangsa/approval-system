import { errorResponseSchema, loginRequestSchema, loginResponseSchema, messageResponseSchema, refreshResponseSchema, userSummarySchema } from "@workflow/contracts";
import { z } from "zod";
import { expect, test } from "vitest";
import { SignJWT } from "jose";
import { createApplication } from "../../src/Presentations/createApplication";
import { createAuthOpenApi } from "../../src/Presentations/Routes/AuthRoutes";
import { identityHttpFixture, expectHttpError, testSecret, testIssuer, testAudience } from "../helpers/identityHttp";

test("HTTP-CONTINUE red: login route exists", async () =>
{
    const app = createApplication(undefined, identityHttpFixture().dependencies);
    const response = await app.handle(new Request("http://localhost/api/v1/auth/login", {
        method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "user@example.test", password: "password" }),
    }));
    expect(response.status).toBe(200);
});

test("login rejects bad credentials and invalid body without cookies", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const send = (body: string) => app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:3000" }, body }));
    const wrong = await send(JSON.stringify({ email: "user@example.test", password: "wrong" }));
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get("set-cookie")).toBeNull();
    expect(fixture.families.size).toBe(0);
    expect((await send("{" )).status).toBe(400);
    expect((await send(JSON.stringify({ email: "user@example.test", password: "password", role: "ADMINISTRATOR" }))).status).toBe(422);
});

test("origin and preflight enforce exact allowlist", async () =>
{
    const app = createApplication(undefined, identityHttpFixture().dependencies);
    const forbidden = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin: "null" } }));
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get("set-cookie")).toBeNull();
    const allowed = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "OPTIONS", headers: { origin: "http://localhost:3000", "access-control-request-method": "POST", "access-control-request-headers": "authorization, content-type" } }));
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");
});

test("session rotation, bearer access, cookie logout and clearing", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const origin = "http://localhost:3000";
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email: "user@example.test", password: "password" }) }));
    const result = await login.json() as { accessToken: string; user: unknown };
    expect(Object.keys(result).sort()).toEqual(["accessToken", "user"]);
    const initialCookie = login.headers.get("set-cookie")!;
    expect(initialCookie).toContain("Path=/api/v1/auth");
    expect(initialCookie).toContain("HttpOnly");
    expect(initialCookie).toContain("SameSite=Strict");
    expect(initialCookie).toContain("Max-Age=604800");
    const cookie = initialCookie.split(";")[0]!;
    const auth = { authorization: `Bearer ${result.accessToken}` };
    expect((await app.handle(new Request("http://localhost/api/v1/auth/me", { headers: auth }))).status).toBe(200);
    const rotation = await app.handle(new Request("http://localhost/api/v1/auth/refresh", { method: "POST", headers: { origin, cookie } }));
    expect(rotation.status).toBe(200);
    expect(Object.keys(await rotation.json())).toEqual(["accessToken"]);
    const nextCookie = rotation.headers.get("set-cookie")!.split(";")[0]!;
    const logout = await app.handle(new Request("http://localhost/api/v1/auth/logout", { method: "POST", headers: { origin, cookie: nextCookie } }));
    expect(logout.status).toBe(200);
    expect(logout.headers.get("set-cookie")).toContain("Max-Age=0");
    expect((await app.handle(new Request("http://localhost/api/v1/auth/me", { headers: auth }))).status).toBe(401);
    const invalid = await app.handle(new Request("http://localhost/api/v1/auth/refresh", { method: "POST", headers: { origin, cookie } }));
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get("set-cookie")).toContain("Max-Age=0");
});

test("empty body boundary distinguishes malformed and valid JSON", async () =>
{
    const app = createApplication(undefined, identityHttpFixture().dependencies);
    for (const path of ["refresh", "logout", "logout-all"])
    {
        const send = (body: string) => app.handle(new Request(`http://localhost/api/v1/auth/${path}`, { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body }));
        expect((await send("{" )).status).toBe(400);
        for (const value of ["null", "{}", "[]", "1"]) expect((await send(value)).status).toBe(422);
        expect((await send("  ")).status).toBe(401);
    }
});

test("supplied invalid bearer cannot fall back to logout cookie", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const origin = "http://localhost:3000";
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email: "user@example.test", password: "password" }) }));
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const response = await app.handle(new Request("http://localhost/api/v1/auth/logout", { method: "POST", headers: { origin, cookie, authorization: "Basic invalid" } }));
    expect(response.status).toBe(401);
    expect([...fixture.families.values()][0]?.revokedAt).toBeNull();
});

test("login normalizes email, preserves password, and returns strict DTO", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const response = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ email: "  USER@EXAMPLE.TEST  ", password: "password" }) }));
    expect(response.status).toBe(200);
    const result = loginResponseSchema.parse(await response.json());
    expect(Object.keys(result).sort()).toEqual(["accessToken", "user"]);
    expect(result.user).toEqual({ id: fixture.account.id, email: fixture.account.email, displayName: "User", isActive: true, roles: ["REQUESTER"], department: null });
    expect(fixture.passwordCalls).toEqual([["password", "hash"]]);
    expect(fixture.families.size).toBe(1);
    expect(fixture.history.size).toBe(1);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
});

test.each(["wrong", "unknown", "disabled", "roleless"])("credential failure %s has safe envelope and preserves supplied cookie", async (scenario) =>
{
    const fixture = identityHttpFixture();
    if (scenario === "disabled") fixture.account.isActive = false;
    if (scenario === "roleless") fixture.identities.get(fixture.account.id)!.roles = [];
    const app = createApplication(undefined, fixture.dependencies);
    const response = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", cookie: "refreshToken=existing" }, body: JSON.stringify({ email: scenario === "unknown" ? "unknown@example.test" : fixture.account.email, password: scenario === "wrong" ? "wrong" : "password" }) }));
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(fixture.families.size).toBe(0);
    expect(fixture.history.size).toBe(0);
    const { requestId, ...envelope } = errorResponseSchema.parse(await response.json());
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(envelope).toEqual({ statusCode: 401, code: "UNAUTHENTICATED", message: "Authentication required", error: "Unauthorized" });
});

test("fixture transaction restores references on rejection and commits fulfilled writes", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
    expect(login.status).toBe(200);
    const family = [...fixture.families.values()][0]!;
    const token = [...fixture.history.values()][0]!;
    const before = structuredClone({ accounts: fixture.accounts, families: fixture.families, history: fixture.history });
    const sentinel = new Error("sentinel");
    await expect(fixture.unit.Run(async (repository) =>
    {
        await repository.IncrementAuthVersion(fixture.account.id);
        await repository.RevokeFamily(family.id, new Date());
        await repository.ConsumeRefreshToken(token.id, new Date());
        await repository.InsertFamily({ ...family, id: "inserted-family" });
        await repository.InsertRefreshToken({ ...token, id: "inserted-token" });
        throw sentinel;
    })).rejects.toBe(sentinel);
    expect(fixture.accounts).toEqual(before.accounts);
    expect(fixture.families).toEqual(before.families);
    expect(fixture.history).toEqual(before.history);
    expect(fixture.accounts.get(fixture.account.id)).toBe(fixture.account);
    expect(fixture.families.get(family.id)).toBe(family);
    expect(fixture.history.get(token.id)).toBe(token);
    expect(fixture.families.has("inserted-family")).toBe(false);
    expect(fixture.history.has("inserted-token")).toBe(false);
    expect(fixture.account.authVersion).toBe(0);
    expect(family.revokedAt).toBeNull();
    expect(token.consumedAt).toBeNull();
    await expect(fixture.unit.Run(async (repository) =>
    {
        await repository.IncrementAuthVersion(fixture.account.id);
        return "committed";
    })).resolves.toBe("committed");
    expect(fixture.account.authVersion).toBe(1);
});

test("login rejects invalid fields and empty-body routes reject all JSON values", async () =>
{
    const app = createApplication(undefined, identityHttpFixture().dependencies);
    for (const value of [{}, { email: "invalid", password: "password" }, { email: "user@example.test" }, { email: "user@example.test", password: "" }, { email: "user@example.test", password: "password", userId: "x" }])
    {
        const response = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify(value) }));
        expect(response.status).toBe(422);
    }
    for (const path of ["refresh", "logout", "logout-all"])
    {
        for (const body of [undefined, "  "])
        {
            const response = await app.handle(new Request(`http://localhost/api/v1/auth/${path}`, { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body }));
            expect(response.status).toBe(401);
        }
        for (const body of ["null", "{}", "[]", '"text"', "1", "true", "false"])
        {
            const response = await app.handle(new Request(`http://localhost/api/v1/auth/${path}`, { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body }));
            expect(response.status).toBe(422);
        }
    }
});



test("refresh replay commits revocation and rejects successor", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const origin = "http://localhost:3000";
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const refresh = (value: string) => app.handle(new Request("http://localhost/api/v1/auth/refresh", { method: "POST", headers: { origin, cookie: value } }));
    const rotated = await refresh(cookie);
    expect(rotated.status).toBe(200);
    expect(Object.keys(await rotated.json())).toEqual(["accessToken"]);
    const successor = rotated.headers.get("set-cookie")!.split(";")[0]!;
    const replay = await refresh(cookie);
    expect(replay.status).toBe(401);
    expect(replay.headers.get("set-cookie")).toContain("Max-Age=0");
    expect([...fixture.families.values()][0]!.revokedAt).not.toBeNull();
    expect((await refresh(successor)).status).toBe(401);
});


test.each(["missing", "malformed", "tampered", "expired", "issuer", "audience", "algorithm", "unknown sid", "version", "disabled", "revoked", "roleless"])("me rejects %s identity", async (scenario) =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
    const result = loginResponseSchema.parse(await login.json());
    const family = [...fixture.families.values()][0]!;
    const now = Math.floor(fixture.clock.Now().getTime() / 1000);
    const issued = scenario === "expired" ? now - 1800 : now;
    const signed = await new SignJWT({ sid: scenario === "unknown sid" ? "00000000-0000-4000-8000-000000000099" : family.id, ver: scenario === "version" ? 1 : 0 })
        .setProtectedHeader({ alg: scenario === "algorithm" ? "HS384" : "HS256" }).setSubject(fixture.account.id)
        .setIssuer(scenario === "issuer" ? "wrong" : testIssuer).setAudience(scenario === "audience" ? "wrong" : testAudience)
        .setIssuedAt(issued).setExpirationTime(issued + 900).sign(new TextEncoder().encode(testSecret));
    if (scenario === "disabled") fixture.account.isActive = false;
    if (scenario === "revoked") family.revokedAt = fixture.clock.Now();
    if (scenario === "roleless") fixture.identities.get(fixture.account.id)!.roles = [];
    const header = scenario === "missing" ? undefined : scenario === "malformed" ? "Basic invalid" : scenario === "tampered" ? "Bearer " + result.accessToken + "x" : "Bearer " + signed;
    const response = await app.handle(new Request("http://localhost/api/v1/auth/me", { headers: header ? { authorization: header } : {} }));
    expect(response.status).toBe(401);
    errorResponseSchema.parse(await response.json());
});


test("CT-04 production routes match shared OpenAPI schemas and security", () =>
{
    const routes = createApplication(undefined, identityHttpFixture().dependencies).routes.map(({ method, path }) => method + " " + path).sort();
    const expected = ["GET /api/v1/auth/me", "POST /api/v1/auth/login", "POST /api/v1/auth/logout", "POST /api/v1/auth/logout-all", "POST /api/v1/auth/refresh"];
    expect(routes.filter((route) => route !== "GET /health")).toEqual(expected);
    const api = createAuthOpenApi();
    expect(api.components.securitySchemes).toEqual({ bearerAuth: { type: "http", scheme: "bearer" }, cookieAuth: { type: "apiKey", in: "cookie", name: "refreshToken" } });
    const descriptors = [
        ["login", "post", loginResponseSchema, []],
        ["refresh", "post", refreshResponseSchema, [{ cookieAuth: [] }]],
        ["me", "get", userSummarySchema, [{ bearerAuth: [] }]],
        ["logout", "post", messageResponseSchema, [{ bearerAuth: [] }, { cookieAuth: [] }]],
        ["logout-all", "post", messageResponseSchema, [{ bearerAuth: [] }]],
    ] as const;
    for (const [name, method, schema, security] of descriptors)
    {
        const path = api.paths["/api/v1/auth/" + name]!;
        const operation = path[method] as { security: unknown; requestBody?: { content: { "application/json": { schema: unknown } } }; responses: Record<string, { content: { "application/json": { schema: unknown } } }> };
        expect(operation.security).toEqual(security);
        expect(operation.responses["200"]!.content["application/json"].schema).toEqual(z.toJSONSchema(schema));
        expect(operation.responses.default!.content["application/json"].schema).toEqual(z.toJSONSchema(errorResponseSchema));
        if (name === "login") expect(operation.requestBody!.content["application/json"].schema).toEqual(z.toJSONSchema(loginRequestSchema, { io: "input" }));
        else expect(operation.requestBody).toBeUndefined();
    }
    const user = z.toJSONSchema(userSummarySchema);
    expect(user.additionalProperties).toBe(false);
    expect(user.required).toEqual(expect.arrayContaining(["id", "email", "displayName", "isActive", "roles", "department"]));
    expect(JSON.stringify(user)).not.toMatch(/passwordHash|tokenHash|authVersion/);
    expect(user.properties!.department).toEqual(expect.objectContaining({ anyOf: expect.arrayContaining([{ type: "null" }]) }));
});

test("logout gives valid Bearer precedence over another user's cookie", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const origin = "http://localhost:3000";
    const login = async (email: string) =>
    {
        const response = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email, password: "password" }) }));
        expect(response.status).toBe(200);
        return { result: loginResponseSchema.parse(await response.json()), cookie: response.headers.get("set-cookie")!.split(";")[0]! };
    };
    const first = await login(fixture.account.email);
    const other = await login(fixture.other.email);
    const response = await app.handle(new Request("http://localhost/api/v1/auth/logout", { method: "POST", headers: { origin, authorization: `Bearer ${first.result.accessToken}`, cookie: other.cookie } }));
    expect(response.status).toBe(200);
    expect(messageResponseSchema.parse(await response.json())).toEqual({ message: "Logged out" });
    expect([...fixture.families.values()].find((family) => family.userId === fixture.account.id)!.revokedAt).not.toBeNull();
    expect([...fixture.families.values()].find((family) => family.userId === fixture.other.id)!.revokedAt).toBeNull();
    expect((await app.handle(new Request("http://localhost/api/v1/auth/me", { headers: { authorization: `Bearer ${other.result.accessToken}` } }))).status).toBe(200);
});

test.each(["Basic invalid", "Bearer invalid.token.value"])("logout never falls back for %s", async (authorization) =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const origin = "http://localhost:3000";
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
    expect(login.status).toBe(200);
    loginResponseSchema.parse(await login.json());
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const response = await app.handle(new Request("http://localhost/api/v1/auth/logout", { method: "POST", headers: { origin, cookie, authorization } }));
    expect(response.status).toBe(401);
    expect([...fixture.families.values()][0]!.revokedAt).toBeNull();
});

test("consumed refresh cookie can revoke its active family", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const origin = "http://localhost:3000";
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
    expect(login.status).toBe(200);
    loginResponseSchema.parse(await login.json());
    const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const rotated = await app.handle(new Request("http://localhost/api/v1/auth/refresh", { method: "POST", headers: { origin, cookie } }));
    expect(rotated.status).toBe(200);
    refreshResponseSchema.parse(await rotated.json());
    const successor = rotated.headers.get("set-cookie")!.split(";")[0]!;
    const logout = await app.handle(new Request("http://localhost/api/v1/auth/logout", { method: "POST", headers: { origin, cookie } }));
    expect(logout.status).toBe(200);
    expect(messageResponseSchema.parse(await logout.json())).toEqual({ message: "Logged out" });
    expect([...fixture.families.values()][0]!.revokedAt).not.toBeNull();
    expect((await app.handle(new Request("http://localhost/api/v1/auth/refresh", { method: "POST", headers: { origin, cookie: successor } }))).status).toBe(401);
});


test.each([undefined, "refreshToken=", "refreshToken=unknown"])("logout clears absent or invalid cookie %s", async (cookie) =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const headers: Record<string, string> = { origin: "http://localhost:3000" };
    if (cookie !== undefined) headers.cookie = cookie;
    const response = await app.handle(new Request("http://localhost/api/v1/auth/logout", { method: "POST", headers }));
    expect(response.status).toBe(401);
    errorResponseSchema.parse(await response.json());
    const clear = response.headers.get("set-cookie")!;
    expect(clear).toMatch(/^refreshToken=;/);
    expect(clear).toContain("Path=/api/v1/auth");
    expect(clear).toContain("HttpOnly");
    expect(clear).toContain("SameSite=Strict");
    expect(clear).toContain("Max-Age=0");
    expect(clear).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);
    expect(clear).not.toMatch(/(?:^|;)\s*Domain=/i);
});

test("logout-all revokes only the authenticated account and its sessions", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const origin = "http://localhost:3000";
    const login = async (email: string) =>
    {
        const response = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email, password: "password" }) }));
        expect(response.status).toBe(200);
        return { token: loginResponseSchema.parse(await response.json()).accessToken, cookie: response.headers.get("set-cookie")!.split(";")[0]! };
    };
    const first = await login(fixture.account.email);
    const second = await login(fixture.account.email);
    const other = await login(fixture.other.email);
    for (const authorization of [undefined, "Bearer invalid.token.value"])
    {
        const headers: Record<string, string> = {};
        if (authorization) headers.authorization = authorization;
        const denied = await app.handle(new Request("http://localhost/api/v1/auth/logout-all", { method: "POST", headers }));
        expect(denied.status).toBe(401);
    }
    const result = await app.handle(new Request("http://localhost/api/v1/auth/logout-all", { method: "POST", headers: { authorization: "Bearer " + first.token } }));
    expect(result.status).toBe(200);
    expect(messageResponseSchema.parse(await result.json())).toEqual({ message: "Logged out" });
    expect(result.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(fixture.account.authVersion).toBe(1);
    expect(fixture.other.authVersion).toBe(0);
    for (const session of [first, second])
    {
        expect((await app.handle(new Request("http://localhost/api/v1/auth/me", { headers: { authorization: "Bearer " + session.token } }))).status).toBe(401);
        expect((await app.handle(new Request("http://localhost/api/v1/auth/refresh", { method: "POST", headers: { origin, cookie: session.cookie } }))).status).toBe(401);
    }
    expect([...fixture.families.values()].filter((family) => family.userId === fixture.account.id).every((family) => family.revokedAt !== null)).toBe(true);
    expect([...fixture.families.values()].find((family) => family.userId === fixture.other.id)!.revokedAt).toBeNull();
    expect((await app.handle(new Request("http://localhost/api/v1/auth/me", { headers: { authorization: "Bearer " + other.token } }))).status).toBe(200);
    expect((await app.handle(new Request("http://localhost/api/v1/auth/refresh", { method: "POST", headers: { origin, cookie: other.cookie } }))).status).toBe(200);
});

test("R2 CORS rejects foreign origins on requests and unsafe preflight details", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
    expect(login.status).toBe(403);
    await expectHttpError(login, 403);
    expect(login.headers.get("access-control-allow-origin")).toBeNull();
    expect(login.headers.get("set-cookie")).toBeNull();
    expect(fixture.families.size).toBe(0);
    const foreignPreflight = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "OPTIONS", headers: { origin: "https://evil.example", "access-control-request-method": "POST" } }));
    expect(foreignPreflight.status).toBe(403);
    expect(foreignPreflight.headers.get("access-control-allow-origin")).toBeNull();
    const badMethod = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "OPTIONS", headers: { origin: "http://localhost:3000", "access-control-request-method": "DELETE" } }));
    expect(badMethod.status).toBe(403);
    expect(badMethod.headers.get("access-control-allow-methods")).toBeNull();
    const badHeader = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "OPTIONS", headers: { origin: "http://localhost:3000", "access-control-request-method": "POST", "access-control-request-headers": "x-custom-header" } }));
    expect(badHeader.status).toBe(403);
    expect(badHeader.headers.get("access-control-allow-headers")).toBeNull();
});

test("R2 CORS grants exact headers to the allowed origin on preflight and responses", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const origin = "http://localhost:3000";
    const preflight = await app.handle(new Request("http://localhost/api/v1/auth/me", { method: "OPTIONS", headers: { origin, "access-control-request-method": "GET", "access-control-request-headers": "authorization, x-request-id" } }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe("GET, POST");
    expect(preflight.headers.get("access-control-allow-headers")).toBe("Authorization, Content-Type, X-Request-Id");
    expect(preflight.headers.get("access-control-allow-origin")).toBe(origin);
    expect(preflight.headers.get("access-control-allow-credentials")).toBe("true");
    expect(preflight.headers.get("set-cookie")).toBeNull();
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
    expect(login.status).toBe(200);
    const token = loginResponseSchema.parse(await login.json()).accessToken;
    const me = await app.handle(new Request("http://localhost/api/v1/auth/me", { headers: { origin, authorization: "Bearer " + token } }));
    expect(me.status).toBe(200);
    expect(me.headers.get("access-control-allow-origin")).toBe(origin);
    expect(me.headers.get("access-control-allow-credentials")).toBe("true");
    expect(me.headers.get("access-control-expose-headers")).toBe("X-Pagination, X-Request-Id, Location");
    expect((me.headers.get("vary") ?? "").toLowerCase()).toContain("origin");
    const anonymous = await app.handle(new Request("http://localhost/api/v1/auth/me", { headers: {} }));
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("access-control-allow-origin")).toBeNull();
});

test("R3 login and refresh cookies carry HttpOnly SameSite Path Max-Age and no Domain", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const origin = "http://localhost:3000";
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
    expect(login.status).toBe(200);
    const issued = login.headers.get("set-cookie")!;
    expect(issued).toContain("Path=/api/v1/auth");
    expect(issued).toContain("HttpOnly");
    expect(issued).toContain("SameSite=Strict");
    expect(issued).toContain("Max-Age=604800");
    expect(issued).not.toContain("Secure");
    expect(issued).not.toMatch(/(?:^|;)\s*Domain=/i);
    const cookie = issued.split(";")[0]!;
    const refresh = await app.handle(new Request("http://localhost/api/v1/auth/refresh", { method: "POST", headers: { origin, cookie } }));
    expect(refresh.status).toBe(200);
    const rotated = refresh.headers.get("set-cookie")!;
    expect(rotated).toContain("HttpOnly");
    expect(rotated).toContain("SameSite=Strict");
    expect(rotated).toContain("Path=/api/v1/auth");
    expect(rotated).toContain("Max-Age=604800");
    expect(rotated).not.toContain("Secure");
    const me = await app.handle(new Request("http://localhost/api/v1/auth/me", { headers: { authorization: "Bearer " + loginResponseSchema.parse(await login.json()).accessToken } }));
    expect(me.status).toBe(200);
    expect(me.headers.get("set-cookie")).toBeNull();
});

test("R3 Secure cookie attribute is emitted when cookieSecure is configured", async () =>
{
    const fixture = identityHttpFixture();
    fixture.dependencies.cookieSecure = true;
    const app = createApplication(undefined, fixture.dependencies);
    const origin = "http://localhost:3000";
    const login = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email: fixture.account.email, password: "password" }) }));
    expect(login.status).toBe(200);
    const issued = login.headers.get("set-cookie")!;
    expect(issued).toContain("Secure");
    expect(issued).toContain("HttpOnly");
    expect(issued).toContain("SameSite=Strict");
    const logout = await app.handle(new Request("http://localhost/api/v1/auth/logout", { method: "POST", headers: { origin, cookie: issued.split(";")[0]! } }));
    expect(logout.status).toBe(200);
    const clearing = logout.headers.get("set-cookie")!;
    expect(clearing).toContain("Secure");
    expect(clearing).toContain("HttpOnly");
    expect(clearing).toContain("Max-Age=0");
});

test("R4 login throttling answers 429 with Retry-After after repeated credential failures", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const send = (email: string, password: string) => app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ email, password }) }));
    for (let attempt = 0; attempt < 5; attempt++)
    {
        const response = await send(fixture.account.email, "wrong");
        expect(response.status).toBe(401);
        expect(response.headers.get("retry-after")).toBeNull();
    }
    const limited = await send(fixture.account.email, "wrong");
    expect(limited.status).toBe(429);
    const body = await expectHttpError(limited, 429);
    expect(body.code).toBe("RATE_LIMITED");
    expect(limited.headers.get("retry-after")).toBe("900");
    expect(limited.headers.get("set-cookie")).toBeNull();
    expect(fixture.families.size).toBe(0);
    expect(fixture.history.size).toBe(0);
    const other = await send(fixture.other.email, "password");
    expect(other.status).toBe(200);
    fixture.advance(15 * 60 * 1000 + 1000);
    expect((await send(fixture.account.email, "wrong")).status).toBe(401);
});

test("login throttles socket peers and ignores forged forwarding headers", async () =>
{
    const app = createApplication(undefined, identityHttpFixture().dependencies);
    const send = (email: string, peer: string | null, forwarded: string) =>
    {
        const request = new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", "x-forwarded-for": forwarded }, body: JSON.stringify({ email, password: "wrong" }) });
        if (peer) Object.assign(request, { runtime: { node: { req: { socket: { remoteAddress: peer } } } } });
        return app.handle(request);
    };
    for (let i = 0; i < 5; i++) expect((await send("pair@example.test", "127.0.0.1", `${i}.0.0.1`)).status).toBe(401);
    expect((await send("pair@example.test", "127.0.0.1", "198.51.100.1")).status).toBe(429);
    expect((await send("pair@example.test", "127.0.0.2", "198.51.100.1")).status).toBe(401);
    for (let i = 0; i < 25; i++) expect((await send(`source${i}@example.test`, "127.0.0.1", `${i}.0.0.2`)).status).toBe(401);
    expect((await send("new@example.test", "127.0.0.1", "198.51.100.2")).status).toBe(429);
    for (let i = 0; i < 31; i++) expect((await send(`anonymous${i}@example.test`, null, "127.0.0.1")).status).toBe(401);
});
