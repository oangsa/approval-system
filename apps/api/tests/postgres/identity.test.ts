import { afterAll, beforeAll, expect, test } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { createTestDatabase } from "../helpers/testDatabase";
import { fixtureDepartments, fixtureUsers } from "../helpers/identityFixtures";
import { seedTest } from "../../scripts/seed-test";
import { departmentMemberships, departments, refreshTokens, roles, sessionFamilies, userRoles, users } from "../../src/Infrastructures/Database/schema";
import { IdentityRepository, IdentityUnitOfWork } from "../../src/Infrastructures/Database/Repositories/IdentityRepository";
import { PasswordHasher } from "../../src/Infrastructures/Security/PasswordHasher";
import { RefreshTokenProvider } from "../../src/Infrastructures/Security/RefreshTokenProvider";

const database = createTestDatabase();
const db = database.connection;
const fixtureIds = fixtureUsers.map((user) => user.id);
const departmentIds = fixtureDepartments.map((department) => department.id);
const ids = (prefix: string) => Array.from({ length: 10 }, (_, i) => `${prefix}0000000-0000-4000-8000-000000000${101 + i}`);
const familyIds = ids("3");
const tokenIds = ids("4");
const userIds = ids("1");
const now = new Date("2026-01-01T00:00:00Z");
const expiry = new Date("2026-01-02T00:00:00Z");
const requester = fixtureUsers[1]!;
const family = (id: string) => ({ id, userId: requester.id, authVersion: 0, createdAt: now, expiresAt: expiry, revokedAt: null });
const token = (id: string, familyId: string, tokenHash: string) => ({ id, familyId, tokenHash, createdAt: now, expiresAt: expiry, consumedAt: null });

async function snapshot()
{
    return {
        users: await db.select().from(users).where(inArray(users.id, fixtureIds)).orderBy(users.id),
        roles: await db.select().from(roles).orderBy(roles.code),
        departments: await db.select().from(departments).where(inArray(departments.id, departmentIds)).orderBy(departments.id),
        memberships: await db.select().from(departmentMemberships).where(inArray(departmentMemberships.userId, fixtureIds)).orderBy(departmentMemberships.userId, departmentMemberships.departmentId),
        userRoles: await db.select().from(userRoles).where(inArray(userRoles.userId, fixtureIds)).orderBy(userRoles.userId, userRoles.roleCode),
        families: await db.select().from(sessionFamilies).where(inArray(sessionFamilies.userId, fixtureIds)).orderBy(sessionFamilies.id),
    };
}

beforeAll(async () =>
{
    expect(await db.select().from(users).where(inArray(users.id, userIds))).toEqual([]);
    expect(await db.select().from(sessionFamilies).where(inArray(sessionFamilies.id, familyIds))).toEqual([]);
    expect(await db.select().from(refreshTokens).where(inArray(refreshTokens.id, tokenIds))).toEqual([]);
});
afterAll(async () => database.Close());

test("seed is idempotent and preserves modified fixture state", async () =>
{
    const before = await snapshot();
    expect(before.users).toHaveLength(6);
    expect(before.departments).toHaveLength(2);
    expect(before.memberships).toHaveLength(6);
    expect(before.memberships.every((row) => row.isPrimary)).toBe(true);
    expect(before.userRoles).toHaveLength(7);
    expect(before.roles.map((row) => row.code).sort()).toEqual(["ADMINISTRATOR", "REQUESTER", "REVIEWER"]);
    for (const account of before.users)
    {
        expect(account.passwordHash).toMatch(/^argon2id\$v=1\$/);
        expect(account.passwordHash).not.toBe("Test-password-42!");
        expect(await new PasswordHasher().Verify("Test-password-42!", account.passwordHash)).toBe(true);
    }
    await seedTest();
    await seedTest();
    expect(await snapshot()).toEqual(before);
    const account = before.users.find((row) => row.id === requester.id)!;
    const originalRoles = before.userRoles.filter((row) => row.userId === requester.id);
    try
    {
        await db.update(users).set({ passwordHash: "modified", authVersion: 9, isActive: false }).where(eq(users.id, requester.id));
        await db.delete(userRoles).where(eq(userRoles.userId, requester.id));
        await db.insert(userRoles).values({ userId: requester.id, roleCode: "REVIEWER" });
        await db.insert(sessionFamilies).values({ ...family(familyIds[0]!), revokedAt: now });
        const changed = await snapshot();
        await seedTest();
        expect(await snapshot()).toEqual(changed);
    }
    finally
    {
        await db.delete(sessionFamilies).where(eq(sessionFamilies.id, familyIds[0]!));
        await db.delete(userRoles).where(eq(userRoles.userId, requester.id));
        await db.insert(userRoles).values(originalRoles);
        await db.update(users).set(account).where(eq(users.id, requester.id));
    }
    expect(await snapshot()).toEqual(before);
});

test("database constraints reject invalid identity state", async () =>
{
    const candidate = { id: userIds[0]!, email: "new@example.test", displayName: "Test", passwordHash: "hash" };
    const reject = async (operation: Parameters<typeof db.transaction>[0]) => expect(db.transaction(operation)).rejects.toThrow();
    await reject(async (tx) =>
{
 await tx.insert(users).values({ ...candidate, email: " Upper@example.test " });
});
    await reject(async (tx) =>
{
 await tx.insert(users).values({ ...candidate, email: requester.email });
});
    await reject(async (tx) =>
{
 await tx.insert(users).values({ ...candidate, authVersion: -1 });
});
    await reject(async (tx) =>
{
 await tx.insert(userRoles).values({ userId: userIds[0]!, roleCode: "REQUESTER" });
});
    await reject(async (tx) =>
{
 await tx.insert(userRoles).values({ userId: requester.id, roleCode: "REQUESTER" });
});
    await reject(async (tx) =>
{
 await tx.execute(`insert into user_roles (user_id, role_code) values ('${requester.id}', 'INVALID')`);
});
    await reject(async (tx) =>
{
 await tx.insert(departmentMemberships).values({ userId: requester.id, departmentId: userIds[0]!, isPrimary: false });
});
    await reject(async (tx) =>
{
 await tx.insert(departmentMemberships).values({ userId: userIds[0]!, departmentId: departmentIds[0]!, isPrimary: false });
});
    await reject(async (tx) =>
{
 await tx.insert(departmentMemberships).values({ userId: requester.id, departmentId: departmentIds[0]!, isPrimary: true });
});
    await reject(async (tx) =>
{
 await tx.insert(sessionFamilies).values({ ...family(familyIds[1]!), userId: userIds[0]! });
});
    await reject(async (tx) =>
{
 await tx.insert(sessionFamilies).values({ ...family(familyIds[1]!), authVersion: -1 });
});
    await reject(async (tx) =>
{
 await tx.insert(sessionFamilies).values({ ...family(familyIds[1]!), expiresAt: now });
});
    await reject(async (tx) =>
{
 await tx.insert(refreshTokens).values(token(tokenIds[1]!, familyIds[1]!, "missing-family"));
});
    try
    {
        await db.insert(sessionFamilies).values(family(familyIds[1]!));
        await db.insert(refreshTokens).values(token(tokenIds[1]!, familyIds[1]!, "duplicate-hash"));
        await reject(async (tx) =>
{
 await tx.insert(refreshTokens).values({ ...token(tokenIds[2]!, familyIds[1]!, "other-hash"), expiresAt: now });
});
        await reject(async (tx) =>
{
 await tx.insert(refreshTokens).values(token(tokenIds[2]!, familyIds[1]!, "duplicate-hash"));
});
    }
    finally
    {
        await db.delete(refreshTokens).where(inArray(refreshTokens.id, tokenIds));
        await db.delete(sessionFamilies).where(inArray(sessionFamilies.id, familyIds));
    }
});

test("repository persists, locks, consumes, revokes and rolls back", async () =>
{
    const repository = new IdentityRepository(db);
    const unit = new IdentityUnitOfWork(db);
    const secret = new RefreshTokenProvider().Generate();
    const hash = new RefreshTokenProvider().Hash(secret);
    const sentinel = new Error("rollback sentinel");
    const account = (await repository.FindUserById(requester.id))!;
    try
    {
        expect(await unit.Run(async (tx) =>
{
 await tx.InsertFamily(family(familyIds[2]!)); await tx.InsertRefreshToken(token(tokenIds[2]!, familyIds[2]!, hash)); return "saved";
})).toBe("saved");
        const stored = await repository.FindRefreshTokenByHash(hash);
        expect(stored?.token.tokenHash).toBe(hash);
        expect(stored?.token.tokenHash).not.toBe(secret);
        expect(await repository.FindUserByEmail(requester.email)).toEqual(account);
        expect(await repository.FindUserById(requester.id)).toEqual(account);
        await expect(unit.Run(async (tx) =>
{
 await tx.InsertFamily(family(familyIds[3]!)); await tx.InsertRefreshToken(token(tokenIds[3]!, familyIds[3]!, "rollback-hash")); throw sentinel;
})).rejects.toBe(sentinel);
        expect(await repository.FindRefreshTokenByHash("rollback-hash")).toBeUndefined();
        expect(await db.select().from(sessionFamilies).where(eq(sessionFamilies.id, familyIds[3]!))).toEqual([]);
        await unit.Run(async (tx) =>
        {
            expect(await tx.LockUser(requester.id)).toEqual(account);
            expect((await tx.LockFamily(familyIds[2]!))?.id).toBe(familyIds[2]);
            expect(await tx.ConsumeRefreshToken(tokenIds[2]!, now)).toBe(true);
            expect(await tx.ConsumeRefreshToken(tokenIds[2]!, now)).toBe(false);
            await tx.RevokeFamily(familyIds[2]!, now);
            await tx.RevokeFamily(familyIds[2]!, expiry);
            await tx.IncrementAuthVersion(requester.id);
        });
        await expect(unit.Run(async (tx) =>
{
 await tx.RevokeAllFamilies(requester.id, now); await tx.RevokeAllFamilies(requester.id, expiry); throw sentinel;
})).rejects.toBe(sentinel);
        expect((await repository.FindRefreshTokenByHash(hash))?.family.revokedAt).toEqual(now);
        expect((await repository.FindUserById(requester.id))?.authVersion).toBe(account.authVersion + 1);
    }
    finally
    {
        await db.delete(refreshTokens).where(inArray(refreshTokens.id, tokenIds));
        await db.delete(sessionFamilies).where(inArray(sessionFamilies.id, familyIds));
        await db.update(users).set(account).where(eq(users.id, requester.id));
    }
});

test("current identity reads live roles and active primary department", async () =>
{
    const sentinel = new Error("rollback changes");
    try
    {
        await db.insert(sessionFamilies).values(family(familyIds[4]!));
        await expect(db.transaction(async (tx) =>
        {
            const repository = new IdentityRepository(tx);
            expect((await repository.ReadCurrentIdentity(requester.id, familyIds[4]!))?.roles).toEqual(["REQUESTER"]);
            expect((await repository.ReadCurrentIdentity(requester.id, familyIds[4]!))?.department?.id).toBe(departmentIds[1]);
            await tx.insert(userRoles).values({ userId: requester.id, roleCode: "REVIEWER" });
            expect((await repository.ReadCurrentIdentity(requester.id, familyIds[4]!))?.roles).toEqual(["REQUESTER", "REVIEWER"]);
            await tx.update(departmentMemberships).set({ isActive: false }).where(eq(departmentMemberships.userId, requester.id));
            expect((await repository.ReadCurrentIdentity(requester.id, familyIds[4]!))?.department).toBeNull();
            await tx.update(departmentMemberships).set({ isActive: true, isPrimary: false }).where(eq(departmentMemberships.userId, requester.id));
            expect((await repository.ReadCurrentIdentity(requester.id, familyIds[4]!))?.department).toBeNull();
            await tx.insert(departmentMemberships).values({ userId: requester.id, departmentId: departmentIds[0]!, isPrimary: true });
            expect((await repository.ReadCurrentIdentity(requester.id, familyIds[4]!))?.department?.id).toBe(departmentIds[0]);
            await tx.update(departments).set({ isActive: false }).where(eq(departments.id, departmentIds[0]!));
            expect((await repository.ReadCurrentIdentity(requester.id, familyIds[4]!))?.department).toBeNull();
            throw sentinel;
        })).rejects.toBe(sentinel);
    }
    finally
{
 await db.delete(sessionFamilies).where(eq(sessionFamilies.id, familyIds[4]!));
}
    expect(await db.select().from(refreshTokens).where(inArray(refreshTokens.id, tokenIds))).toEqual([]);
    expect(await db.select().from(sessionFamilies).where(inArray(sessionFamilies.id, familyIds))).toEqual([]);
    expect(await db.select().from(users).where(inArray(users.id, userIds))).toEqual([]);
});
