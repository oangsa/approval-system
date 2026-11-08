import { expect, test } from "vitest";
import { errorResponseSchema, loginResponseSchema, userSummarySchema } from "@workflow/contracts";
import { SignJWT } from "jose";
import { requireAuthentication } from "../../src/Presentations/Guards/authentication";
import { HttpError } from "../../src/Presentations/errors";
import { createApplication } from "../../src/Presentations/createApplication";
import { canReadPrivate, requireAnyRole, requirePrivateAccess } from "../../src/Presentations/Guards/authorization";
import { identityHttpFixture, testSecret, testIssuer, testAudience } from "../helpers/identityHttp";

test("HTTP-CONTINUE red: private denial is masked", async () =>
{
    const fixture = identityHttpFixture();
    const app = createApplication().get("/private", () =>
    {
        requirePrivateAccess({ account: fixture.account, roles: ["ADMINISTRATOR"] }, "foreign", false);
        return { value: "private" };
    });
    const response = await app.handle(new Request("http://localhost/private"));
    expect(response.status).toBe(404);
});


async function authenticatedFixture()
{
    const fixture = identityHttpFixture();
    const app = createApplication(undefined, fixture.dependencies);
    const owner = fixture.account.id;
    const authenticate = (request: Request) => requireAuthentication(request.headers.get("authorization"), fixture.dependencies.authenticate);
    app.get("/fixture/role/:role", async ({ request, params }) =>
    {
        const actor = await authenticate(request);
        requireAnyRole(actor.roles, [params.role === "requester" ? "REQUESTER" : "REVIEWER"]);
        return Response.json({ allowed: true }, { headers: { "Cache-Control": "no-store" } });
    });
    app.get("/fixture/private/:kind", async ({ request, params }) =>
    {
        const actor = await authenticate(request);
        requirePrivateAccess(actor, params.kind === "absent" ? undefined : owner, params.kind === "assigned");
        return Response.json({ value: "private" }, { headers: { "Cache-Control": "no-store" } });
    });
    app.post("/fixture/mutate", async ({ request }) =>
    {
        const actor = await authenticate(request);
        requirePrivateAccess(actor, owner, false);
        requireAnyRole(actor.roles, ["REQUESTER"]);
        return Response.json({ allowed: true }, { headers: { "Cache-Control": "no-store" } });
    });
    app.post("/fixture/review/:kind", async ({ request, params }) =>
    {
        const actor = await authenticate(request);
        requireAnyRole(actor.roles, ["REVIEWER"]);
        if (actor.account.id === owner) throw new HttpError("FORBIDDEN");
        requirePrivateAccess(actor, owner, params.kind === "assigned");
        return Response.json({ allowed: true }, { headers: { "Cache-Control": "no-store" } });
    });
    const login = async (email: string) =>
    {
        const response = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ email, password: "password" }) }));
        expect(response.status).toBe(200);
        return loginResponseSchema.parse(await response.json()).accessToken;
    };
    return { ...fixture, app, login };
}

test("same bearer observes current role union and department without trusting signed roles", async () =>
{
    const fixture = await authenticatedFixture();
    const current = fixture.identities.get(fixture.account.id)!;
    const token = await fixture.login(fixture.account.email);
    const headers = { authorization: "Bearer " + token };
    const role = (name: string) => fixture.app.handle(new Request("http://localhost/fixture/role/" + name, { headers }));
    const me = async () =>
    {
        const response = await fixture.app.handle(new Request("http://localhost/api/v1/auth/me", { headers }));
        expect(response.status).toBe(200);
        expect(new Set((response.headers.get("cache-control") ?? "").split(",").map((value) => value.trim().toLowerCase()))).toEqual(new Set(["no-store"]));
        return userSummarySchema.parse(await response.json());
    };
    current.roles = ["REQUESTER", "REVIEWER"];
    current.department = { id: fixture.other.id, code: "ENG", name: "Engineering", isActive: true };
    expect(await me()).toEqual({ id: fixture.account.id, displayName: "User", email: fixture.account.email, isActive: true, roles: ["REQUESTER", "REVIEWER"], department: current.department });
    expect((await role("requester")).status).toBe(200);
    expect((await role("reviewer")).status).toBe(200);
    current.roles = ["REVIEWER"];
    current.department = null;
    expect((await me()).department).toBeNull();
    expect((await role("requester")).status).toBe(403);
    expect((await role("reviewer")).status).toBe(200);
    current.roles = ["REQUESTER"];
    expect((await role("requester")).status).toBe(200);
    expect((await role("reviewer")).status).toBe(403);
    const family = [...fixture.families.values()][0]!;
    const now = Math.floor(fixture.clock.Now().getTime() / 1000);
    const misleading = await new SignJWT({ sid: family.id, ver: 0, roles: ["REVIEWER", "ADMINISTRATOR"] })
        .setProtectedHeader({ alg: "HS256" }).setSubject(fixture.account.id).setIssuer(testIssuer).setAudience(testAudience)
        .setIssuedAt(now).setExpirationTime(now + 900).sign(new TextEncoder().encode(testSecret));
    expect((await fixture.app.handle(new Request("http://localhost/fixture/role/reviewer", { headers: { authorization: "Bearer " + misleading } }))).status).toBe(403);
    const identity = await fixture.app.handle(new Request("http://localhost/api/v1/auth/me", { headers: { authorization: "Bearer " + misleading } }));
    expect(userSummarySchema.parse(await identity.json()).roles).toEqual(["REQUESTER"]);
});

test("authenticated private access enforces owner, assignment, mutation roles and self-review denial", async () =>
{
    const fixture = await authenticatedFixture();
    const owner = await fixture.login(fixture.account.email);
    const other = await fixture.login(fixture.other.email);
    const request = (token: string, path: string, method = "GET") => fixture.app.handle(new Request("http://localhost/fixture/" + path, { method, headers: { authorization: "Bearer " + token } }));
    expect((await request(owner, "private/owner")).status).toBe(200);
    expect((await request(owner, "mutate", "POST")).status).toBe(200);
    fixture.identities.get(fixture.account.id)!.roles = ["REVIEWER"];
    expect((await request(owner, "private/owner")).status).toBe(200);
    expect((await request(owner, "mutate", "POST")).status).toBe(403);
    expect((await request(owner, "review/assigned", "POST")).status).toBe(403);
    fixture.identities.get(fixture.other.id)!.roles = ["REVIEWER"];
    const assigned = await request(other, "private/assigned");
    expect(assigned.status).toBe(200);
    expect(assigned.headers.get("cache-control")).toBe("no-store");
    expect(await assigned.json()).toEqual({ value: "private" });
    expect((await request(other, "review/assigned", "POST")).status).toBe(200);
    expect((await request(other, "review/unassigned", "POST")).status).toBe(404);
    const denial = async (path: string) =>
    {
        const response = await request(other, path);
        expect(response.status).toBe(404);
        expect(response.headers.get("cache-control")).toBe("no-store");
        const { requestId, ...body } = errorResponseSchema.parse(await response.json());
        expect(response.headers.get("x-request-id")).toBe(requestId);
        expect(body).toEqual({ statusCode: 404, code: "NOT_FOUND", message: "Not found", error: "Not Found" });
        expect(JSON.stringify(body)).not.toMatch(/account|actor|password|hash|session|family|token/i);
        return body;
    };
    expect(await denial("private/unassigned")).toEqual(await denial("private/absent"));
    expect(canReadPrivate(fixture.other.id, fixture.account.id, ["REVIEWER"])).toBe(false);
    fixture.identities.get(fixture.other.id)!.roles = ["ADMINISTRATOR"];
    expect(await denial("private/assigned")).toEqual(await denial("private/absent"));
    expect((await request(other, "mutate", "POST")).status).toBe(404);
    expect((await request(other, "review/assigned", "POST")).status).toBe(403);
    const production = createApplication(undefined, fixture.dependencies).routes.map(({ path }) => path);
    expect(production.some((path) => path.startsWith("/fixture/") || path === "/private")).toBe(false);
});

test("authentication guard freezes copied scalar authority and roles", async () =>
{
    const fixture = await authenticatedFixture();
    const current = fixture.identities.get(fixture.account.id)!;
    current.roles = ["REQUESTER", "REVIEWER"];
    current.department = { id: fixture.other.id, code: "ENG", name: "Engineering", isActive: true };
    fixture.app.get("/fixture/snapshot", async ({ request }) =>
    {
        const actor = await requireAuthentication(request.headers.get("authorization"), fixture.dependencies.authenticate);
        const family = fixture.families.get(actor.family.id)!;
        for (const value of [actor, actor.account, actor.family, actor.roles, actor.department]) expect(Object.isFrozen(value)).toBe(true);
        expect(actor.account).not.toBe(fixture.account);
        expect(actor.family).not.toBe(family);
        expect(actor.roles).not.toBe(current.roles);
        expect(actor.department).not.toBe(current.department);
        const expiry = actor.family.expiresAt.getTime();
        expect(actor.family.expiresAt).toBeInstanceOf(Date);
        fixture.account.displayName = "Changed";
        fixture.account.isActive = false;
        family.revokedAt = fixture.clock.Now();
        family.expiresAt = new Date(0);
        current.roles.push("ADMINISTRATOR");
        current.department!.name = "Changed";
        expect(actor.account.displayName).toBe("User");
        expect(actor.account.isActive).toBe(true);
        expect(actor.family.revokedAt).toBeNull();
        expect(actor.family.expiresAt.getTime()).toBe(expiry);
        expect(actor.roles).toEqual(["REQUESTER", "REVIEWER"]);
        expect(actor.department!.name).toBe("Engineering");
        return Response.json({ allowed: true }, { headers: { "Cache-Control": "no-store" } });
    });
    const token = await fixture.login(fixture.account.email);
    const response = await fixture.app.handle(new Request("http://localhost/fixture/snapshot", { headers: { authorization: "Bearer " + token } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ allowed: true });
});

test("role denial returns the contract-shaped forbidden envelope with mirrored requestId", async () =>
{
    const fixture = await authenticatedFixture();
    fixture.identities.get(fixture.account.id)!.roles = ["REQUESTER"];
    const token = await fixture.login(fixture.account.email);
    const response = await fixture.app.handle(new Request("http://localhost/fixture/role/reviewer", { headers: { authorization: "Bearer " + token } }));
    expect(response.status).toBe(403);
    const { requestId, ...envelope } = errorResponseSchema.parse(await response.json());
    expect(envelope).toEqual({ statusCode: 403, code: "FORBIDDEN", message: "Forbidden", error: "Forbidden" });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(new Set((response.headers.get("cache-control") ?? "").split(",").map((value) => value.trim().toLowerCase()))).toEqual(new Set(["no-store"]));
    expect(response.headers.get("retry-after")).toBeNull();
    expect(JSON.stringify(envelope)).not.toMatch(/password|hash|Bearer|token|stack/i);
});
