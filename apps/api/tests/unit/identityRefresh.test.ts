import { expect, test, vi } from "vitest";
import { RefreshSession } from "../../src/Applications/Identity/RefreshSession";
import type { IAccount, IActor, IRefreshHistory, ISessionFamily } from "../../src/Domains/Identity/Identity";
import type { IIdentityRepository, IIdentityUnitOfWork } from "../../src/Domains/Identity/Ports";

const now = new Date("2026-01-01T00:00:00Z");
const expiry = new Date("2026-01-02T00:00:00Z");

function setup(options: { consumed?: boolean; active?: boolean; roles?: boolean; version?: number; expired?: boolean; revoked?: boolean; unknown?: boolean } = {})
{
    const events: string[] = [];
    const account: IAccount = { id: "user", email: "user@example.test", displayName: "User", passwordHash: "hash", isActive: options.active ?? true, authVersion: options.version ?? 0, createdAt: now, updatedAt: now };
    const family: ISessionFamily = { id: "family", userId: account.id, authVersion: 0, createdAt: now, expiresAt: options.expired ? now : expiry, revokedAt: options.revoked ? now : null };
    const token: IRefreshHistory = { id: "token", familyId: family.id, tokenHash: "hash", createdAt: now, expiresAt: options.expired ? now : expiry, consumedAt: options.consumed ? now : null };
    const actor: IActor = { account, family, roles: options.roles === false ? [] : ["REQUESTER"], department: null };
    const unexpected = () =>
{
 throw new Error("unexpected repository operation");
};
    const repository: IIdentityRepository = {
        FindUserByEmail: unexpected, FindUserById: unexpected, InsertFamily: unexpected, RevokeAllFamilies: unexpected, IncrementAuthVersion: unexpected,
        FindRefreshTokenByHash: vi.fn(async () =>
{
 events.push("lookup"); return options.unknown ? undefined : { token, family };
}),
        LockUser: vi.fn(async () =>
{
 events.push("user"); return account;
}),
        LockFamily: vi.fn(async () =>
{
 events.push("family"); return family;
}),
        ReadCurrentIdentity: vi.fn(async () => actor),
        RevokeFamily: vi.fn(async () =>
{
 events.push("revoke");
}),
        ConsumeRefreshToken: vi.fn(async () =>
{
 events.push("consume"); return true;
}),
        InsertRefreshToken: vi.fn(async () =>
{
 events.push("insert");
}),
    };
    let release!: () => void;
    let callbackDone!: () => void;
    const barrier = new Promise<void>((resolve) =>
{
 release = resolve;
});
    const callbackFinished = new Promise<void>((resolve) =>
{
 callbackDone = resolve;
});
    const unit: IIdentityUnitOfWork = { Run: async (operation) =>
{
 events.push("transaction"); const result = await operation(repository); events.push("callback resolved"); callbackDone(); await barrier; events.push("commit"); return result;
} };
    const generate = vi.fn(() => "successor");
    const sign = vi.fn(async () => "access");
    const service = new RefreshSession(repository, unit, { Sign: sign, Verify: unexpected }, { Generate: generate, Hash: () => "hash" }, { Now: () => now });
    return { service, repository, events, release, callbackFinished, generate, sign };
}

const replayCases = [
    ["active", {}], ["inactive", { active: false }], ["roleless", { roles: false }], ["version mismatch", { version: 1 }],
    ["expired family", { expired: true }], ["already revoked", { revoked: true }],
] as const;
test.each(replayCases)("replay revokes before denial: %s", async (_name, options) =>
{
    const fixture = setup({ ...options, consumed: true });
    let settled = false;
    const result = fixture.service.Execute("secret").finally(() =>
{
 settled = true;
});
    const denial = expect(result).rejects.toMatchObject({ code: "INVALID_SESSION" });
    await fixture.callbackFinished;
    expect(settled).toBe(false);
    expect(fixture.events.slice(0, 5)).toEqual(["lookup", "transaction", "user", "family", "lookup"]);
    expect(fixture.repository.RevokeFamily).toHaveBeenCalledOnce();
    expect(fixture.events).toContain("callback resolved");
    expect(fixture.repository.ConsumeRefreshToken).not.toHaveBeenCalled();
    expect(fixture.repository.InsertRefreshToken).not.toHaveBeenCalled();
    expect(fixture.generate).not.toHaveBeenCalled();
    expect(fixture.sign).not.toHaveBeenCalled();
    fixture.release();
    await denial;
    expect(fixture.events.at(-1)).toBe("commit");
});

test.each([["inactive", { active: false }], ["roleless", { roles: false }], ["version mismatch", { version: 1 }], ["expired", { expired: true }], ["revoked", { revoked: true }]] as const)("unused %s is denied", async (_name, options) =>
{
    const fixture = setup(options);
    const denial = expect(fixture.service.Execute("secret")).rejects.toMatchObject({ code: "INVALID_SESSION" });
    await fixture.callbackFinished;
    fixture.release();
    await denial;
    expect(fixture.repository.RevokeFamily).not.toHaveBeenCalled();
    expect(fixture.repository.ConsumeRefreshToken).not.toHaveBeenCalled();
    expect(fixture.repository.InsertRefreshToken).not.toHaveBeenCalled();
    expect(fixture.generate).not.toHaveBeenCalled();
    expect(fixture.sign).not.toHaveBeenCalled();
});

test("unknown hash is denied without transaction", async () =>
{
    const fixture = setup({ unknown: true });
    await expect(fixture.service.Execute("secret")).rejects.toMatchObject({ code: "INVALID_SESSION" });
    expect(fixture.events).toEqual(["lookup"]);
    expect(fixture.repository.RevokeFamily).not.toHaveBeenCalled();
});
