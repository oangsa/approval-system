import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterAll, expect, test } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { createTestDatabase } from "../helpers/testDatabase";
import { Authenticate } from "../../src/Applications/Identity/Authenticate";
import { Logout } from "../../src/Applications/Identity/Logout";
import { LogoutAll } from "../../src/Applications/Identity/LogoutAll";
import { RefreshSession } from "../../src/Applications/Identity/RefreshSession";
import type { IIdentityRepository, IIdentityUnitOfWork } from "../../src/Domains/Identity/Ports";
import { IdentityRepository, IdentityUnitOfWork } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import { refreshTokens, sessionFamilies, userRoles, users } from "../../src/Infrastructures/Database/schema";
import { RefreshTokenProvider } from "../../src/Infrastructures/Security/RefreshTokenProvider";
import { TokenProvider } from "../../src/Infrastructures/Security/TokenProvider";

const database = createTestDatabase();
const opponent = createTestDatabase();
const observer = createTestDatabase();
const db = database.connection;
const read = observer.connection;
const now = new Date("2026-01-01T00:00:00Z");
const createdAt = new Date(now.getTime() - 1000);
const expiry = new Date("2026-01-02T00:00:00Z");
const clock = { Now: () => now };
const secrets = new RefreshTokenProvider();
const tokens = new TokenProvider("test-only-secret-32-bytes-long!!", clock, "workflow-api", "workflow-web");
const repo = new IdentityRepository(db);
const unit = new IdentityUnitOfWork(db);
const refresh = new RefreshSession(repo, unit, tokens, secrets, clock);
const authenticate = new Authenticate(tokens, new IdentityRepository(read), clock);
const logout = new Logout(repo, unit, secrets, clock);
const logoutAll = new LogoutAll(unit, clock);
const owned: string[] = [];

function wrap(base: IIdentityUnitOfWork, adapt: (repository: IIdentityRepository) => IIdentityRepository): IIdentityUnitOfWork
{
    return { Run: (operation) => base.Run((repository) => operation(adapt(repository))) };
}
function barrier()
{
    let release!: () => void;
    const promise = new Promise<void>((resolve) =>
{
 release = resolve;
});
    return { promise, release };
}
async function fixture()
{
    const id = randomUUID();
    const target = randomUUID();
    const control = randomUUID();
    const original = secrets.Generate();
    const controlSecret = secrets.Generate();
    owned.push(id);
    await db.insert(users).values({ id, email: `${id}@example.test`, displayName: "Test", passwordHash: "test-only" });
    await db.insert(userRoles).values({ userId: id, roleCode: "REQUESTER" });
    await db.insert(sessionFamilies).values([target, control].map((familyId) => ({ id: familyId, userId: id, authVersion: 0, createdAt, expiresAt: expiry, revokedAt: null })));
    await db.insert(refreshTokens).values([{ familyId: target, secret: original }, { familyId: control, secret: controlSecret }].map((item) => ({ id: randomUUID(), familyId: item.familyId, tokenHash: secrets.Hash(item.secret), createdAt, expiresAt: expiry, consumedAt: null })));
    const access = await tokens.Sign(id, target, 0);
    const controlAccess = await tokens.Sign(id, control, 0);
    const actor = await authenticate.Execute(access);
    return { id, target, control, original, controlSecret, access, controlAccess, actor };
}
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
        await opponent.Close();
        await observer.Close();
    }
});

test("cookie logout revokes only target and does not increment version", async () =>
{
    const f = await fixture();
    await logout.Execute(undefined, f.original);
    expect((await read.select().from(sessionFamilies).where(eq(sessionFamilies.id, f.target)))[0]?.revokedAt).toEqual(now);
    expect((await read.select().from(users).where(eq(users.id, f.id)))[0]?.authVersion).toBe(0);
    await expect(authenticate.Execute(f.access)).rejects.toMatchObject({ code: "INVALID_SESSION" });
    await expect(refresh.Execute(f.original)).rejects.toMatchObject({ code: "INVALID_SESSION" });
    await expect(authenticate.Execute(f.controlAccess)).resolves.toBeDefined();
    await expect(refresh.Execute(f.controlSecret)).resolves.toHaveProperty("accessToken");
});

test.each(["refresh", "logout"])("%s wins lock and committed logout invalidates credentials", async (winner) =>
{
    const f = await fixture();
    const locked = barrier();
    const release = barrier();
    const attempted = barrier();
    const winnerUnit = wrap(unit, (repository) =>
{
        const wrapped = Object.create(repository) as IIdentityRepository;
        wrapped.LockUser = async (id) =>
{
 const user = await repository.LockUser(id); locked.release(); await release.promise; return user;
};
        return wrapped;
    });
    const loserUnit = wrap(new IdentityUnitOfWork(opponent.connection), (repository) =>
{
        const wrapped = Object.create(repository) as IIdentityRepository;
        wrapped.LockUser = async (id) =>
{
 attempted.release(); return repository.LockUser(id);
};
        return wrapped;
    });
    const winnerRefresh = new RefreshSession(repo, winnerUnit, tokens, secrets, clock);
    const winnerLogout = new Logout(repo, winnerUnit, secrets, clock);
    const otherRepo = new IdentityRepository(opponent.connection);
    const loserRefresh = new RefreshSession(otherRepo, loserUnit, tokens, secrets, clock);
    const loserLogout = new Logout(otherRepo, loserUnit, secrets, clock);
    const first = winner === "refresh" ? winnerRefresh.Execute(f.original) : winnerLogout.Execute(undefined, f.original);
    try
    {
        await locked.promise;
        const second = winner === "refresh" ? loserLogout.Execute(undefined, f.original) : loserRefresh.Execute(f.original);
        const secondResult = second.then((value) => ({ value }), (error: unknown) => ({ error }));
        await attempted.promise;
        release.release();
        const firstResult = await first;
        const result = await secondResult;
        if (winner === "refresh")
        {
            expect(result).toHaveProperty("value");
            const rotated = firstResult as { secret: string; accessToken: string };
            await expect(refresh.Execute(rotated.secret)).rejects.toMatchObject({ code: "INVALID_SESSION" });
            await expect(authenticate.Execute(rotated.accessToken)).rejects.toMatchObject({ code: "INVALID_SESSION" });
        }
        else expect(result).toMatchObject({ error: { code: "INVALID_SESSION" } });
        const history = await read.select().from(refreshTokens).where(eq(refreshTokens.familyId, f.target));
        expect(history).toHaveLength(winner === "refresh" ? 2 : 1);
        expect(history.find((row) => row.tokenHash === secrets.Hash(f.original))?.consumedAt).toEqual(winner === "refresh" ? now : null);
        expect((await read.select().from(sessionFamilies).where(eq(sessionFamilies.id, f.target)))[0]?.revokedAt).toEqual(now);
        await expect(authenticate.Execute(f.access)).rejects.toMatchObject({ code: "INVALID_SESSION" });
        await expect(authenticate.Execute(f.controlAccess)).resolves.toBeDefined();
    }
    finally
{
 release.release();
}
});

test.each(["missing", "unknown", "expired token", "expired family", "revoked", "inactive", "version", "roleless"])("cookie rejects %s without target mutation", async (condition) =>
{
    const f = await fixture();
    if (condition === "expired token")
    {
        await db.update(refreshTokens).set({ expiresAt: now }).where(eq(refreshTokens.tokenHash, secrets.Hash(f.original)));
        const expired = (await read.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, secrets.Hash(f.original))))[0];
        assert(expired !== undefined);
        expect(expired.createdAt.getTime()).toBeLessThan(expired.expiresAt.getTime());
        expect(expired.expiresAt.getTime()).toBe(now.getTime());
    }
    if (condition === "expired family")
    {
        await db.update(sessionFamilies).set({ expiresAt: now }).where(eq(sessionFamilies.id, f.target));
        const expired = (await read.select().from(sessionFamilies).where(eq(sessionFamilies.id, f.target)))[0];
        assert(expired !== undefined);
        expect(expired.createdAt.getTime()).toBeLessThan(expired.expiresAt.getTime());
        expect(expired.expiresAt.getTime()).toBe(now.getTime());
    }
    if (condition === "revoked") await db.update(sessionFamilies).set({ revokedAt: now }).where(eq(sessionFamilies.id, f.target));
    if (condition === "inactive") await db.update(users).set({ isActive: false }).where(eq(users.id, f.id));
    if (condition === "version") await db.update(users).set({ authVersion: 1 }).where(eq(users.id, f.id));
    if (condition === "roleless") await db.delete(userRoles).where(eq(userRoles.userId, f.id));
    await expect(logout.Execute(undefined, condition === "missing" ? undefined : condition === "unknown" ? "unknown" : f.original)).rejects.toMatchObject({ code: "INVALID_SESSION" });
    expect((await read.select().from(sessionFamilies).where(eq(sessionFamilies.id, f.target)))[0]?.revokedAt).toEqual(condition === "revoked" ? now : null);
    expect((await read.select().from(sessionFamilies).where(eq(sessionFamilies.id, f.control)))[0]?.revokedAt).toBeNull();
});

test("logout all revokes both families once and rejects stale actor", async () =>
{
    const f = await fixture();
    const unrelated = await fixture();
    await logoutAll.Execute(f.actor);
    expect((await read.select().from(users).where(eq(users.id, f.id)))[0]?.authVersion).toBe(1);
    for (const family of [f.target, f.control]) expect((await read.select().from(sessionFamilies).where(eq(sessionFamilies.id, family)))[0]?.revokedAt).toEqual(now);
    for (const access of [f.access, f.controlAccess]) await expect(authenticate.Execute(access)).rejects.toMatchObject({ code: "INVALID_SESSION" });
    for (const secret of [f.original, f.controlSecret]) await expect(refresh.Execute(secret)).rejects.toMatchObject({ code: "INVALID_SESSION" });
    await expect(logoutAll.Execute(f.actor)).rejects.toMatchObject({ code: "INVALID_SESSION" });
    expect((await read.select().from(users).where(eq(users.id, f.id)))[0]?.authVersion).toBe(1);
    await expect(authenticate.Execute(unrelated.access)).resolves.toBeDefined();
    await expect(refresh.Execute(unrelated.original)).resolves.toHaveProperty("accessToken");
});

test("logout all uses current roles", async () =>
{
    const f = await fixture();
    await db.delete(userRoles).where(eq(userRoles.userId, f.id));
    await expect(logoutAll.Execute(f.actor)).rejects.toMatchObject({ code: "INVALID_SESSION" });
    expect((await read.select().from(users).where(eq(users.id, f.id)))[0]?.authVersion).toBe(0);
    expect((await read.select().from(sessionFamilies).where(eq(sessionFamilies.id, f.target)))[0]?.revokedAt).toBeNull();
    await db.insert(userRoles).values({ userId: f.id, roleCode: "REQUESTER" });
    await logoutAll.Execute({ ...f.actor, roles: [] });
    expect((await read.select().from(users).where(eq(users.id, f.id)))[0]?.authVersion).toBe(1);
});

test.each(["single", "all"])("%s precommit fault rolls back", async (operation) =>
{
    const f = await fixture();
    const sentinel = new Error("precommit sentinel");
    const faulty = wrap(unit, (repository) =>
{
        const wrapped = Object.create(repository) as IIdentityRepository;
        if (operation === "single") wrapped.RevokeFamily = async (id, at) =>
{
 await repository.RevokeFamily(id, at); throw sentinel;
};
        else wrapped.IncrementAuthVersion = async (id) =>
{
 await repository.IncrementAuthVersion(id); throw sentinel;
};
        return wrapped;
    });
    if (operation === "single") await expect(new Logout(repo, faulty, secrets, clock).Execute(f.actor, undefined)).rejects.toBe(sentinel);
    else await expect(new LogoutAll(faulty, clock).Execute(f.actor)).rejects.toBe(sentinel);
    expect((await read.select().from(users).where(eq(users.id, f.id)))[0]?.authVersion).toBe(0);
    expect((await read.select().from(sessionFamilies).where(eq(sessionFamilies.id, f.target)))[0]?.revokedAt).toBeNull();
    await expect(authenticate.Execute(f.access)).resolves.toBeDefined();
    await expect(refresh.Execute(f.original)).resolves.toHaveProperty("accessToken");
});

test("simultaneous refresh revokes family after one rotation", async () =>
{
    const f = await fixture();
    const both = barrier();
    let arrived = 0;
    const synchronized = (base: IIdentityRepository): IIdentityRepository =>
    {
        const wrapped = Object.create(base) as IIdentityRepository;
        wrapped.FindRefreshTokenByHash = async (hash) =>
        {
            const found = await base.FindRefreshTokenByHash(hash);
            arrived++;
            if (arrived === 2) both.release();
            await both.promise;
            return found;
        };
        return wrapped;
    };
    const otherRepo = new IdentityRepository(opponent.connection);
    const first = new RefreshSession(synchronized(repo), unit, tokens, secrets, clock);
    const second = new RefreshSession(synchronized(otherRepo), new IdentityUnitOfWork(opponent.connection), tokens, secrets, clock);
    const results = await Promise.allSettled([first.Execute(f.original), second.Execute(f.original)]);
    const winner = results.find((result) => result.status === "fulfilled");
    const loser = results.find((result) => result.status === "rejected");
    expect(winner?.status).toBe("fulfilled");
    expect(loser?.status).toBe("rejected");
    if (winner?.status !== "fulfilled" || loser?.status !== "rejected") throw new Error("Unexpected refresh results");
    expect(loser.reason).toMatchObject({ code: "INVALID_SESSION" });
    const history = await read.select().from(refreshTokens).where(eq(refreshTokens.familyId, f.target));
    expect(history).toHaveLength(2);
    expect(history.find((row) => row.tokenHash === secrets.Hash(f.original))?.consumedAt).toEqual(now);
    expect((await read.select().from(sessionFamilies).where(eq(sessionFamilies.id, f.target)))[0]?.revokedAt).toEqual(now);
    await expect(refresh.Execute(winner.value.secret)).rejects.toMatchObject({ code: "INVALID_SESSION" });
    await expect(authenticate.Execute(winner.value.accessToken)).rejects.toMatchObject({ code: "INVALID_SESSION" });
});
