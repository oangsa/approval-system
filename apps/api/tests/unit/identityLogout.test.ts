import assert from "node:assert/strict";
import { expect, test, vi } from "vitest";
import { Logout } from "../../src/Applications/Identity/Logout";
import { LogoutAll } from "../../src/Applications/Identity/LogoutAll";
import type { IAccount, IActor, IRefreshHistory, ISessionFamily } from "../../src/Domains/Identity/Identity";
import type { IIdentityRepository, IIdentityUnitOfWork } from "../../src/Domains/Identity/Ports";

const now = new Date("2026-01-01T00:00:00Z");
const expiry = new Date("2026-01-02T00:00:00Z");

function setup()
{
    const account: IAccount = { id: "user", email: "user@example.test", displayName: "User", passwordHash: "hash", isActive: true, authVersion: 0, createdAt: now, updatedAt: now };
    const family: ISessionFamily = { id: "family", userId: "user", authVersion: 0, createdAt: now, expiresAt: expiry, revokedAt: null };
    const token: IRefreshHistory = { id: "token", familyId: "family", tokenHash: "hash", createdAt: now, expiresAt: expiry, consumedAt: null };
    const actor: IActor = { account, family, roles: ["REQUESTER"], department: null };
    const unexpected = () =>
{
 throw new Error("unexpected operation");
};
    const repository: IIdentityRepository = {
        FindUserByEmail: unexpected, FindUserById: unexpected, InsertFamily: unexpected, InsertRefreshToken: unexpected, ConsumeRefreshToken: unexpected,
        FindRefreshTokenByHash: vi.fn(async () => ({ token, family })),
        LockUser: vi.fn(async () => account), LockFamily: vi.fn(async () => family), ReadCurrentIdentity: vi.fn(async () => actor),
        RevokeFamily: vi.fn(async () =>
{}), RevokeAllFamilies: vi.fn(async () =>
{}), IncrementAuthVersion: vi.fn(async () =>
{}),
    };
    const unit: IIdentityUnitOfWork = { Run: async (operation) => operation(repository) };
    return { account, family, token, actor, repository, logout: new Logout(repository, unit, { Generate: unexpected, Hash: () => "hash" }, { Now: () => now }), all: new LogoutAll(unit, { Now: () => now }) };
}

test("missing authority is rejected", async () =>
{
    const f = setup();
    await expect(f.logout.Execute(undefined, undefined)).rejects.toMatchObject({ code: "INVALID_SESSION" });
    expect(f.repository.RevokeFamily).not.toHaveBeenCalled();
});

test("revoked family is rejected for cookie", async () =>
{
    const f = setup();
    f.family.revokedAt = now;
    await expect(f.logout.Execute(undefined, "secret")).rejects.toMatchObject({ code: "INVALID_SESSION" });
    expect(f.repository.RevokeFamily).not.toHaveBeenCalled();
});

test("current roles are required for both operations", async () =>
{
    const f = setup();
    const stale = { ...f.actor, roles: [...f.actor.roles] };
    f.actor.roles = [];
    await expect(f.logout.Execute(stale, undefined)).rejects.toMatchObject({ code: "INVALID_SESSION" });
    await expect(f.all.Execute(stale)).rejects.toMatchObject({ code: "INVALID_SESSION" });
    expect(f.repository.RevokeFamily).not.toHaveBeenCalled();
    expect(f.repository.IncrementAuthVersion).not.toHaveBeenCalled();
});

test.each([false, true])("valid cookie, consumed=%s, revokes family", async (consumed) =>
{
    const f = setup();
    f.token.consumedAt = consumed ? now : null;
    await f.logout.Execute(undefined, "secret");
    expect(f.repository.RevokeFamily).toHaveBeenCalledOnce();
});

test.each(["empty", "unknown", "missing user", "missing family", "missing identity", "wrong owner", "wrong binding", "expired token", "expired family", "token beyond family", "inactive", "wrong version", "roleless", "changed reread"])("cookie rejects %s without mutation", async (scenario) =>
{
    const f = setup();
    let secret = "secret";
    switch (scenario)
    {
        case "empty": secret = ""; break;
        case "unknown": vi.mocked(f.repository.FindRefreshTokenByHash).mockResolvedValue(undefined); break;
        case "missing user": vi.mocked(f.repository.LockUser).mockResolvedValue(undefined); break;
        case "missing family": vi.mocked(f.repository.LockFamily).mockResolvedValue(undefined); break;
        case "missing identity": vi.mocked(f.repository.ReadCurrentIdentity).mockResolvedValue(undefined); break;
        case "wrong owner": f.family.userId = "other"; break;
        case "wrong binding": f.token.familyId = "other"; break;
        case "expired token": f.token.expiresAt = now; break;
        case "expired family": f.family.expiresAt = now; break;
        case "token beyond family": f.token.expiresAt = new Date(expiry.getTime() + 1); break;
        case "inactive": f.account.isActive = false; break;
        case "wrong version": f.account.authVersion = 1; break;
        case "roleless": f.actor.roles = []; break;
        case "changed reread": vi.mocked(f.repository.FindRefreshTokenByHash).mockResolvedValueOnce({ token: f.token, family: f.family }).mockResolvedValueOnce(undefined); break;
    }
    await expect(f.logout.Execute(undefined, secret)).rejects.toMatchObject({ code: "INVALID_SESSION" });
    expect(f.repository.RevokeFamily).not.toHaveBeenCalled();
});

test("bearer ignores foreign cookie and current retained role remains authoritative", async () =>
{
    const f = setup();
    const stale = { ...f.actor, roles: [] };
    await f.logout.Execute(stale, "foreign");
    expect(f.repository.FindRefreshTokenByHash).not.toHaveBeenCalled();
    expect(f.repository.RevokeFamily).toHaveBeenCalledWith("family", now);
    await f.all.Execute(stale);
    expect(f.repository.IncrementAuthVersion).toHaveBeenCalledWith("user");
});

test("cookie reread follows user and family locks", async () =>
{
    const f = setup();
    await f.logout.Execute(undefined, "secret");
    const lookup = vi.mocked(f.repository.FindRefreshTokenByHash).mock.invocationCallOrder;
    const initialLookup = lookup[0];
    const userLock = vi.mocked(f.repository.LockUser).mock.invocationCallOrder[0];
    const familyLock = vi.mocked(f.repository.LockFamily).mock.invocationCallOrder[0];
    const reread = lookup[1];
    assert(initialLookup !== undefined);
    assert(userLock !== undefined);
    assert(familyLock !== undefined);
    assert(reread !== undefined);
    expect(initialLookup).toBeLessThan(userLock);
    expect(userLock).toBeLessThan(familyLock);
    expect(familyLock).toBeLessThan(reread);
});

test.each(["lookup", "read", "revoke", "unit"])("%s failure propagates", async (operation) =>
{
    const f = setup();
    const failure = new Error(operation);
    if (operation === "lookup") vi.mocked(f.repository.FindRefreshTokenByHash).mockRejectedValue(failure);
    if (operation === "read") vi.mocked(f.repository.ReadCurrentIdentity).mockRejectedValue(failure);
    if (operation === "revoke") vi.mocked(f.repository.RevokeFamily).mockRejectedValue(failure);
    if (operation === "unit")
    {
        const service = new Logout(f.repository, { Run: async () =>
{
 throw failure;
} }, { Generate: () => "", Hash: () => "hash" }, { Now: () => now });
        await expect(service.Execute(f.actor, undefined)).rejects.toBe(failure);
        return;
    }
    await expect(f.logout.Execute(operation === "lookup" ? undefined : f.actor, "secret")).rejects.toBe(failure);
});
