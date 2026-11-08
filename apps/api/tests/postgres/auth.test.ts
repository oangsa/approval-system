import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { createTestDatabase } from "../helpers/testDatabase";
import { Login } from "../../src/Applications/Identity/Login";
import { LoginThrottle } from "../../src/Infrastructures/Security/LoginThrottle";
import { PasswordHasher } from "../../src/Infrastructures/Security/PasswordHasher";
import { Authenticate } from "../../src/Applications/Identity/Authenticate";
import { RefreshSession } from "../../src/Applications/Identity/RefreshSession";
import { IdentityRepository, IdentityUnitOfWork } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import { refreshTokens, sessionFamilies, userRoles, users } from "../../src/Infrastructures/Database/schema";
import { RefreshTokenProvider } from "../../src/Infrastructures/Security/RefreshTokenProvider";
import { TokenProvider } from "../../src/Infrastructures/Security/TokenProvider";

const database = createTestDatabase();
const observer = createTestDatabase();
const db = database.connection;
const read = observer.connection;
const clock = { Now: () => new Date("2026-01-01T00:00:00Z") };
const now = clock.Now();
const expiry = new Date("2026-01-02T00:00:00Z");
const tokens = new TokenProvider("test-only-secret-32-bytes-long!!", clock, "workflow-api", "workflow-web");
const secrets = new RefreshTokenProvider();
const repository = new IdentityRepository(db);
const unit = new IdentityUnitOfWork(db);
const service = new RefreshSession(repository, unit, tokens, secrets, clock);
const authenticate = new Authenticate(tokens, new IdentityRepository(read), clock);
const owned: string[] = [];

afterAll(async () =>
{
    try
    {
        if (owned.length)
        {
            const families = await db.select({ id: sessionFamilies.id }).from(sessionFamilies).where(inArray(sessionFamilies.userId, owned));
            if (families.length) await db.delete(refreshTokens).where(inArray(refreshTokens.familyId, families.map((row) => row.id)));
            await db.delete(sessionFamilies).where(inArray(sessionFamilies.userId, owned));
            await db.delete(userRoles).where(inArray(userRoles.userId, owned));
            await db.delete(users).where(inArray(users.id, owned));
            expect(await read.select().from(users).where(inArray(users.id, owned))).toEqual([]);
        }
    }
    finally
    {
        await database.Close();
        await observer.Close();
    }
});

async function fixture()
{
    const id = randomUUID();
    owned.push(id);
    const target = randomUUID();
    const control = randomUUID();
    const original = secrets.Generate();
    const controlSecret = secrets.Generate();
    await db.insert(users).values({ id, email: `${id}@example.test`, displayName: "Test", passwordHash: "test-only" });
    await db.insert(userRoles).values({ userId: id, roleCode: "REQUESTER" });
    await db.insert(sessionFamilies).values([target, control].map((familyId) => ({ id: familyId, userId: id, authVersion: 0, createdAt: now, expiresAt: expiry, revokedAt: null })));
    await db.insert(refreshTokens).values([{ familyId: target, secret: original }, { familyId: control, secret: controlSecret }].map((item) => ({ id: randomUUID(), familyId: item.familyId, tokenHash: secrets.Hash(item.secret), createdAt: now, expiresAt: expiry, consumedAt: null })));
    return { id, target, control, original, controlSecret };
}

test.each(["active", "disabled", "roleless", "version"] as const)("replay commits family revocation for %s account", async (condition) =>
{
    const item = await fixture();
    const rotated = await service.Execute(item.original);
    let history = await read.select().from(refreshTokens).where(eq(refreshTokens.familyId, item.target));
    expect(history).toHaveLength(2);
    expect(history.find((row) => row.tokenHash === secrets.Hash(item.original))?.consumedAt).toEqual(now);
    if (condition === "disabled") await db.update(users).set({ isActive: false }).where(eq(users.id, item.id));
    if (condition === "roleless") await db.delete(userRoles).where(eq(userRoles.userId, item.id));
    if (condition === "version") await db.update(users).set({ authVersion: 1 }).where(eq(users.id, item.id));
    await expect(service.Execute(item.original)).rejects.toMatchObject({ code: "INVALID_SESSION" });
    expect((await read.select().from(sessionFamilies).where(eq(sessionFamilies.id, item.target)))[0]?.revokedAt).toEqual(now);
    expect((await read.select().from(sessionFamilies).where(eq(sessionFamilies.id, item.control)))[0]?.revokedAt).toBeNull();
    history = await read.select().from(refreshTokens).where(eq(refreshTokens.familyId, item.target));
    expect(history).toHaveLength(2);
    if (condition === "disabled") await db.update(users).set({ isActive: true }).where(eq(users.id, item.id));
    if (condition === "roleless") await db.insert(userRoles).values({ userId: item.id, roleCode: "REQUESTER" });
    if (condition === "version") await db.update(users).set({ authVersion: 0 }).where(eq(users.id, item.id));
    await expect(service.Execute(rotated.secret)).rejects.toMatchObject({ code: "INVALID_SESSION" });
    await expect(authenticate.Execute(rotated.accessToken)).rejects.toMatchObject({ code: "INVALID_SESSION" });
    await expect(service.Execute(item.controlSecret)).resolves.toHaveProperty("accessToken");
});

test("signing fault rolls back consumption and successor insertion", async () =>
{
    const item = await fixture();
    const sentinel = new Error("precommit sentinel");
    const faulty = new RefreshSession(repository, unit, { Sign: async () =>
{
 throw sentinel;
}, Verify: tokens.Verify.bind(tokens) }, secrets, clock);
    await expect(faulty.Execute(item.original)).rejects.toBe(sentinel);
    const controlFamily = await read.select().from(sessionFamilies).where(eq(sessionFamilies.id, item.control));
    const controlHistory = await read.select().from(refreshTokens).where(eq(refreshTokens.familyId, item.control));
    const history = await read.select().from(refreshTokens).where(eq(refreshTokens.familyId, item.target));
    expect(history).toHaveLength(1);
    expect(history[0]?.consumedAt).toBeNull();
    expect((await read.select().from(sessionFamilies).where(eq(sessionFamilies.id, item.target)))[0]?.revokedAt).toBeNull();
    await expect(service.Execute(item.original)).resolves.toHaveProperty("accessToken");
    const retried = await read.select().from(refreshTokens).where(eq(refreshTokens.familyId, item.target));
    expect(retried).toHaveLength(2);
    expect(retried.find((row) => row.tokenHash === secrets.Hash(item.original))?.consumedAt).toEqual(now);
    expect(retried.filter((row) => row.consumedAt === null)).toHaveLength(1);
    expect(await read.select().from(sessionFamilies).where(eq(sessionFamilies.id, item.control))).toEqual(controlFamily);
    expect(await read.select().from(refreshTokens).where(eq(refreshTokens.familyId, item.control))).toEqual(controlHistory);
});

 test("roleless login reaches throttle and rolls back family and credentials", async () =>
{
    const id = randomUUID();
    owned.push(id);
    const password = "synthetic password";
    const passwords = new PasswordHasher();
    await db.insert(users).values({ id, email: `${id}@example.test`, displayName: "Test", passwordHash: await passwords.Hash(password) });
    const login = new Login(repository, unit, passwords, tokens, secrets, new LoginThrottle(clock), clock, "dummy");
    for (let index = 0; index < 5; index++) await expect(login.Execute(`${id}@example.test`, password, "source")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(login.Execute(`${id}@example.test`, password, "source")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    const families = await read.select().from(sessionFamilies).where(eq(sessionFamilies.userId, id));
    expect(families).toEqual([]);
    expect(await read.select().from(refreshTokens).innerJoin(sessionFamilies, eq(refreshTokens.familyId, sessionFamilies.id)).where(eq(sessionFamilies.userId, id))).toEqual([]);
});

 test("reconstructed HTTP composition preserves and revokes durable sessions", async () =>
{
    const id = randomUUID();
    owned.push(id);
    const password = "synthetic password";
    await db.insert(users).values({ id, email: `${id}@example.test`, displayName: "Test", passwordHash: await new PasswordHasher().Hash(password) });
    await db.insert(userRoles).values({ userId: id, roleCode: "REQUESTER" });
    const { readEnvironment } = await import("../../src/Infrastructures/Configuration/environment");
    const { assertTestDatabaseTarget } = await import("../../src/Infrastructures/Database/testDatabaseTargetGuard");
    const { createIdentityComposition } = await import("../../src/Presentations/composition");
    const { createApplication } = await import("../../src/Presentations/createApplication");
    const environment = readEnvironment({ DATABASE_URL: assertTestDatabaseTarget(), NODE_ENV: "test", AUTH_JWT_SECRET: "test-only-secret-32-bytes-long!!", AUTH_JWT_ISSUER: "workflow-api", AUTH_JWT_AUDIENCE: "workflow-web", AUTH_ALLOWED_ORIGINS: "http://localhost:3000", AUTH_COOKIE_SECURE: "false" });
    const url = "http://localhost/api/v1/auth/";
    const origin = "http://localhost:3000";
    const first = createTestDatabase();
    let access = "";
    let cookie = "";
    try
    {
        const initialApp = createApplication(undefined, await createIdentityComposition(environment, first));
        const login = await initialApp.handle(new Request(`${url}login`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email: `${id}@example.test`, password }) }));
        expect(login.status).toBe(200);
        access = (await login.json() as { accessToken: string }).accessToken;
        cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    }
    finally
    {
        await first.Close();
    }
    const second = createTestDatabase();
    let successorAccess = "";
    let successorCookie = "";
    try
    {
        const app = createApplication(undefined, await createIdentityComposition(environment, second));
        expect((await app.handle(new Request(`${url}me`, { headers: { authorization: `Bearer ${access}` } }))).status).toBe(200);
        const rotation = await app.handle(new Request(`${url}refresh`, { method: "POST", headers: { origin, cookie } }));
        expect(rotation.status).toBe(200);
        successorAccess = (await rotation.json() as { accessToken: string }).accessToken;
        successorCookie = rotation.headers.get("set-cookie")!.split(";")[0]!;
        const family = (await read.select().from(sessionFamilies).where(eq(sessionFamilies.userId, id)))[0]!;
        const history = await read.select().from(refreshTokens).where(eq(refreshTokens.familyId, family.id));
        expect(history).toHaveLength(2);
        expect(history.find((row) => row.tokenHash === secrets.Hash(cookie.slice("refreshToken=".length)))?.consumedAt).not.toBeNull();
        expect(history.find((row) => row.tokenHash === secrets.Hash(successorCookie.slice("refreshToken=".length)))?.consumedAt).toBeNull();
        expect((await app.handle(new Request(`${url}me`, { headers: { authorization: `Bearer ${successorAccess}` } }))).status).toBe(200);
        expect((await app.handle(new Request(`${url}logout`, { method: "POST", headers: { origin, cookie: successorCookie } }))).status).toBe(200);
    }
    finally
    {
        await second.Close();
    }
    const third = createTestDatabase();
    try
    {
        const app = createApplication(undefined, await createIdentityComposition(environment, third));
        for (const token of [access, successorAccess])
        {
            expect((await app.handle(new Request(`${url}me`, { headers: { authorization: `Bearer ${token}` } }))).status).toBe(401);
        }
        for (const credential of [cookie, successorCookie])
        {
            expect((await app.handle(new Request(`${url}refresh`, { method: "POST", headers: { origin, cookie: credential } }))).status).toBe(401);
        }
        expect((await read.select().from(sessionFamilies).where(eq(sessionFamilies.userId, id)))[0]?.revokedAt).toBeInstanceOf(Date);
    }
    finally
    {
        await third.Close();
    }
});

test.skipIf(process.env.RUN_BUILT_HTTP_SMOKE !== "1")("built listener completes HTTP session lifecycle", async () =>
{
    const { existsSync } = await import("node:fs");
    const { createServer } = await import("node:net");
    const { spawn } = await import("node:child_process");
    const { EventEmitter } = await import("node:events");
    const { resolve } = await import("node:path");
    const { assertTestDatabaseTarget } = await import("../../src/Infrastructures/Database/testDatabaseTargetGuard");
    const target = assertTestDatabaseTarget();
    const artifact = resolve("dist/index.js");
    expect(existsSync(artifact)).toBe(true);
    const id = randomUUID();
    owned.push(id);
    const password = "synthetic password";
    await db.insert(users).values({ id, email: `${id}@example.test`, displayName: "Test", passwordHash: await new PasswordHasher().Hash(password) });
    await db.insert(userRoles).values({ userId: id, roleCode: "REQUESTER" });
    const server = createServer();
    let port = 0;
    try
    {
        const listening = EventEmitter.once(server, "listening", { signal: AbortSignal.timeout(5000) });
        server.listen(0, "127.0.0.1");
        await listening;
        const address = server.address();
        if (!address || typeof address === "string") throw new Error("Unable to allocate loopback port");
        port = address.port;
    }
    finally
    {
        if (server.listening)
        {
            const closed = EventEmitter.once(server, "close", { signal: AbortSignal.timeout(5000) });
            server.close();
            await closed;
        }
    }
    const child = spawn(process.execPath, [artifact], { shell: false, stdio: "ignore", env: { ...process.env, DATABASE_URL: target, NODE_ENV: "test", HOST: "127.0.0.1", PORT: String(port), AUTH_JWT_SECRET: "test-only-secret-32-bytes-long!!", AUTH_JWT_ISSUER: "workflow-api", AUTH_JWT_AUDIENCE: "workflow-web", AUTH_ALLOWED_ORIGINS: "http://localhost:3000", AUTH_COOKIE_SECURE: "false" } });
    const childError = new Promise<never>((_, reject) => child.once("error", reject));
    const earlyExit = new Promise<never>((_, reject) => child.once("exit", () => reject(new Error("Owned listener exited before lifecycle completed"))));
    // Handle early failures even between requests; each network wait still races them.
    void childError.catch(() => undefined);
    void earlyExit.catch(() => undefined);
    const request = (url: string, options: RequestInit = {}) => Promise.race([
        fetch(url, { ...options, signal: AbortSignal.timeout(5000) }), childError, earlyExit,
    ]);
    try
    {
        const base = `http://127.0.0.1:${port}`;
        let ready = false;
        for (let attempt = 0; attempt < 100; attempt++)
        {
            if (child.exitCode !== null) throw new Error("Owned listener exited before health check");
            try
{
 if ((await request(`${base}/health`)).status === 200)
{
 ready = true; break;
}
}
 catch
{ /* Listener is starting. */ }
            await new Promise((resolveWait) => setTimeout(resolveWait, 100));
        }
        expect(ready).toBe(true);
        const origin = "http://localhost:3000";
        const login = await request(`${base}/api/v1/auth/login`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ email: `${id}@example.test`, password }) });
        expect(login.status).toBe(200);
        const access = (await login.json() as { accessToken: string }).accessToken;
        const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
        expect((await request(`${base}/api/v1/auth/me`, { headers: { authorization: `Bearer ${access}` } })).status).toBe(200);
        const rotation = await request(`${base}/api/v1/auth/refresh`, { method: "POST", headers: { origin, cookie } });
        expect(rotation.status).toBe(200);
        const rotatedCookie = rotation.headers.get("set-cookie")!.split(";")[0]!;
        const rotatedAccess = (await rotation.json() as { accessToken: string }).accessToken;
        expect((await request(`${base}/api/v1/auth/me`, { headers: { authorization: `Bearer ${rotatedAccess}` } })).status).toBe(200);
        expect((await request(`${base}/api/v1/auth/logout`, { method: "POST", headers: { origin, cookie: rotatedCookie } })).status).toBe(200);
        expect((await request(`${base}/api/v1/auth/me`, { headers: { authorization: `Bearer ${access}` } })).status).toBe(401);
        expect((await request(`${base}/api/v1/auth/refresh`, { method: "POST", headers: { origin, cookie } })).status).toBe(401);
        expect((await read.select().from(sessionFamilies).where(eq(sessionFamilies.userId, id)))[0]?.revokedAt).not.toBeNull();
        const { request: httpRequest } = await import("node:http");
        const peerLogin = (localAddress: string, email: string, suppliedPassword: string, forwarded: string) => new Promise<number>((resolveStatus, reject) =>
        {
            const body = JSON.stringify({ email, password: suppliedPassword });
            const outgoing = httpRequest({ host: "127.0.0.1", port, localAddress, path: "/api/v1/auth/login", method: "POST", headers: { origin, "content-type": "application/json", "content-length": Buffer.byteLength(body), "x-forwarded-for": forwarded }, agent: false, timeout: 5000 }, (response) =>
            {
                response.resume();
                response.on("end", () => resolveStatus(response.statusCode!));
            });
            outgoing.on("timeout", () => outgoing.destroy(new Error("Peer login timed out")));
            outgoing.on("error", reject);
            outgoing.end(body);
        });
        for (let i = 0; i < 5; i++) expect(await peerLogin("127.0.0.1", "pair@example.test", "wrong", `198.51.100.${i + 1}`)).toBe(401);
        expect(await peerLogin("127.0.0.1", "pair@example.test", "wrong", "203.0.113.1")).toBe(429);
        for (let i = 0; i < 25; i++) expect(await peerLogin("127.0.0.1", `source${i}@example.test`, "wrong", `198.51.100.${i + 1}`)).toBe(401);
        expect(await peerLogin("127.0.0.1", `${id}@example.test`, password, "203.0.113.2")).toBe(429);
        expect(await peerLogin("127.0.0.2", `${id}@example.test`, password, "203.0.113.2")).toBe(200);
    }
    finally
    {
        if (child.exitCode === null && child.signalCode === null && child.pid !== undefined)
        {
            const exited = EventEmitter.once(child, "exit", { signal: AbortSignal.timeout(5000) });
            child.kill("SIGTERM");
            try
            {
                await exited;
            }
            catch
            {
                // Exit wait timed out; only SIGKILL if the child is still alive.
                if (child.exitCode === null && child.signalCode === null)
                {
                    const killed = EventEmitter.once(child, "exit", { signal: AbortSignal.timeout(5000) });
                    child.kill("SIGKILL");
                    await killed;
                }
            }
        }
    }
});
