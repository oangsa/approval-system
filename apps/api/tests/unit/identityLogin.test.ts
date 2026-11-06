import { expect, test, vi } from "vitest";
import { Login } from "../../src/Applications/Identity/Login";
import type { IAccount, IActor } from "../../src/Domains/Identity/Identity";
import type { IIdentityRepository, IIdentityUnitOfWork } from "../../src/Domains/Identity/Ports";
import { LoginThrottle } from "../../src/Infrastructures/Security/LoginThrottle";

const now = new Date("2026-01-01T00:00:00Z");
const clock = { Now: () => now };
function setup(options: { roleless?: boolean; wrong?: boolean; stale?: boolean; fault?: Error } = {})
{
    const account: IAccount = { id: "00000000-0000-4000-8000-000000000001", email: "user@example.test", displayName: "User", passwordHash: "hash", isActive: true, authVersion: 0, createdAt: now, updatedAt: now };
    const actor: IActor = { account, family: { id: "00000000-0000-4000-8000-000000000002", userId: account.id, authVersion: 0, createdAt: now, expiresAt: new Date("2026-01-08T00:00:00Z"), revokedAt: null }, roles: options.roleless ? [] : ["REQUESTER"], department: null };
    const unexpected = () =>
{
 throw new Error("unexpected repository operation");
};
    const repository: IIdentityRepository = {
        FindUserByEmail: vi.fn(async () => account), FindUserById: unexpected, FindRefreshTokenByHash: unexpected,
        LockUser: vi.fn(async () => options.stale ? { ...account, passwordHash: "changed" } : account),
        LockFamily: unexpected, ReadCurrentIdentity: vi.fn(async (_userId, familyId) => ({ ...actor, family: { ...actor.family, id: familyId } })), InsertFamily: vi.fn(async () =>
{}),
        InsertRefreshToken: vi.fn(async () =>
{}), ConsumeRefreshToken: unexpected, RevokeFamily: unexpected,
        RevokeAllFamilies: unexpected, IncrementAuthVersion: unexpected,
    };
    const run = vi.fn(async (operation: (repository: IIdentityRepository) => Promise<unknown>) => operation(repository));
    const unit: IIdentityUnitOfWork = { Run: async <T>(operation: (repository: IIdentityRepository) => Promise<T>) => await run(operation) as T };
    const verify = vi.fn(async () => !options.wrong);
    const generate = vi.fn(() => "secret");
    const sign = vi.fn(async () =>
{
 if (options.fault) throw options.fault; return "access";
});
    const throttle = new LoginThrottle(clock);
    const failure = vi.spyOn(throttle, "RecordFailure");
    const success = vi.spyOn(throttle, "RecordSuccess");
    const service = new Login(repository, unit, { Hash: unexpected, Verify: verify }, { Sign: sign, Verify: unexpected }, { Generate: generate, Hash: () => "hash" }, throttle, clock, "dummy");
    return { service, repository, run, verify, generate, sign, failure, success };
}

test.each([["roleless", { roleless: true }], ["wrong password", { wrong: true }], ["stale password", { stale: true }]] as const)("%s rejection records exactly one normalized failure", async (_name, options) =>
{
    const item = setup(options);
    await expect(item.service.Execute(" User@Example.Test ", "password", "source")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    expect(item.failure).toHaveBeenCalledExactlyOnceWith("source", "user@example.test");
    expect(item.success).not.toHaveBeenCalled();
    expect(item.repository.InsertRefreshToken).not.toHaveBeenCalled();
    expect(item.generate).not.toHaveBeenCalled();
    expect(item.sign).not.toHaveBeenCalled();
});

test("roleless attempts reach throttle before password verification or transaction", async () =>
{
    const item = setup({ roleless: true });
    for (let index = 0; index < 5; index++) await expect(item.service.Execute(" User@Example.Test ", "password", "source")).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(item.service.Execute("user@example.test", "password", "source")).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(item.failure).toHaveBeenCalledTimes(5);
    expect(item.verify).toHaveBeenCalledTimes(5);
    expect(item.run).toHaveBeenCalledTimes(5);
});

test("success records success", async () =>
{
    const item = setup();
    await expect(item.service.Execute("user@example.test", "password", "source")).resolves.toHaveProperty("accessToken", "access");
    expect(item.failure).not.toHaveBeenCalled();
    expect(item.success).toHaveBeenCalledOnce();
});

test("signing failure propagates without credential failure", async () =>
{
    const sentinel = new Error("signing failure");
    const item = setup({ fault: sentinel });
    await expect(item.service.Execute("user@example.test", "password", "source")).rejects.toBe(sentinel);
    expect(item.failure).not.toHaveBeenCalled();
    expect(item.success).not.toHaveBeenCalled();
});
