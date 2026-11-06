import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { decodeJwt, jwtVerify, SignJWT } from "jose";
import { readEnvironment } from "../../src/Infrastructures/Configuration/environment";
import { PasswordHasher } from "../../src/Infrastructures/Security/PasswordHasher";
import { TokenProvider } from "../../src/Infrastructures/Security/TokenProvider";
import { RefreshTokenProvider } from "../../src/Infrastructures/Security/RefreshTokenProvider";
import { LoginThrottle } from "../../src/Infrastructures/Security/LoginThrottle";
const id = "10000000-0000-4000-8000-000000000001";
const family = "30000000-0000-4000-8000-000000000001";
let time = new Date("2026-01-01T00:00:00Z");
const clock = { Now: () => time };
test("password records are salted, bounded and verified", async () =>
{
    const hasher = new PasswordHasher();
    const first = await hasher.Hash("test password");
    expect(await hasher.Hash("test password")).not.toBe(first);
    expect(await hasher.Verify("test password", first)).toBe(true);
    expect(await hasher.Verify("wrong", first)).toBe(false);
    for (const password of ["", "x".repeat(1025)])
    {
        await expect(hasher.Hash(password)).rejects.toThrow();
        expect(await hasher.Verify(password, first)).toBe(false);
    }
    const parts = first.split("$");
    for (const record of ["", "x".repeat(257), first.replace("m=19456", "m=1"), first + "!", first.replace("argon2id", "argon2i"), parts.slice(0, 4).join("$"), [...parts.slice(0, 3), "YQ==", parts[4]].join("$"), [...parts.slice(0, 4), "YQ=="].join("$")])
        expect(await hasher.Verify("test password", record)).toBe(false);
});
test("JWT uses configured issuer and audience", async () =>
{
    const now = new Date("2026-01-01T00:00:00Z");
    const fixedClock = { Now: () => now };
    const environment = readEnvironment({ DATABASE_URL: "postgresql://127.0.0.1/workflow_test", NODE_ENV: "test", AUTH_JWT_SECRET: "x".repeat(32), AUTH_JWT_ISSUER: "custom-api", AUTH_JWT_AUDIENCE: "custom-web", AUTH_ALLOWED_ORIGINS: "http://localhost:3000", AUTH_COOKIE_SECURE: "false" });
    const { AUTH_JWT_SECRET: secret, AUTH_JWT_ISSUER: issuer, AUTH_JWT_AUDIENCE: audience } = environment;
    const key = new TextEncoder().encode(secret);
    const provider = new TokenProvider(secret, fixedClock, issuer, audience);
    const token = await provider.Sign(id, family, 0);
    expect(decodeJwt(token)).toMatchObject({ iss: "custom-api", aud: "custom-web" });
    await expect(jwtVerify(token, key, { algorithms: ["HS256"], issuer, audience, currentDate: now })).resolves.toBeDefined();
    const iat = Math.floor(now.getTime() / 1000);
    const sign = (iss: string, aud: string) => new SignJWT({ sub: id, sid: family, ver: 0, iat, exp: iat + 900, iss, aud }).setProtectedHeader({ alg: "HS256" }).sign(key);
    await expect(provider.Verify(await sign(issuer, audience))).resolves.toMatchObject({ sub: id, sid: family, ver: 0 });
    for (const [iss, aud] of [["workflow-approval-api", audience], [issuer, "workflow-approval-web"], ["workflow-approval-api", "workflow-approval-web"]] as const)
        await expect(provider.Verify(await sign(iss, aud))).rejects.toThrow();
    expect(() => new TokenProvider(secret, fixedClock, "", audience)).toThrow();
    expect(() => new TokenProvider(secret, fixedClock, issuer, "")).toThrow();
});
test("JWT validates signature, algorithm, issuer, audience, claims and exact expiry", async () =>
{
    time = new Date("2026-01-01T00:00:00Z");
    const secret = "x".repeat(32); const key = new TextEncoder().encode(secret); const provider = new TokenProvider(secret, clock, "workflow-approval-api", "workflow-approval-web");
    expect(() => new TokenProvider("é".repeat(15), clock, "workflow-approval-api", "workflow-approval-web")).toThrow();
    const token = await provider.Sign(id, family, 0);
    expect(await provider.Verify(token)).toMatchObject({ sub: id, sid: family, ver: 0 });
    await expect(new TokenProvider("y".repeat(32), clock, "workflow-approval-api", "workflow-approval-web").Verify(token)).rejects.toThrow();
    const iat = Math.floor(time.getTime() / 1000);
    for (const change of [{ alg: "HS384" }, { iss: "wrong" }, { aud: "wrong" }, { sub: "bad" }, { sid: "bad" }, { sub: undefined }, { sid: undefined }, { ver: undefined }, { iat: undefined }, { exp: undefined }, { ver: -1 }, { ver: 0.5 }, { iat: iat + 0.5 }, { exp: iat + 900.5 }, { iat: iat + 1 }, { exp: iat + 899 }])
    {
        const payload = { sub: id, sid: family, ver: 0, iat, exp: iat + 900, iss: "workflow-approval-api", aud: "workflow-approval-web", ...change };
        const signed = await new SignJWT(payload).setProtectedHeader({ alg: change.alg ?? "HS256" }).sign(key);
        await expect(provider.Verify(signed)).rejects.toThrow();
    }
    time = new Date(time.getTime() + 899999);
    await expect(provider.Verify(token)).resolves.toBeDefined();
    time = new Date(time.getTime() + 1);
    await expect(provider.Verify(token)).rejects.toThrow();
});
test("refresh secrets are random and stored as deterministic SHA256 hashes", () =>
{
    const provider = new RefreshTokenProvider(); const secret = provider.Generate();
    expect(Buffer.from(secret, "base64url")).toHaveLength(32);
    expect(provider.Generate()).not.toBe(secret);
    expect(provider.Hash(secret)).toBe(createHash("sha256").update(secret).digest("hex"));
    expect(provider.Hash(secret)).toBe(provider.Hash(secret));
    expect(provider.Hash(secret)).not.toBe(secret);
});
test("throttle enforces pair, source, window, success and capacity", () =>
{
    time = new Date("2026-01-01T00:00:00Z");
    const throttle = new LoginThrottle(clock);
    for (let i = 0; i < 5; i++) throttle.RecordFailure(null, " USER@example.test ");
    expect(throttle.Check("", "user@example.test")).toBe(false);
    expect(throttle.Check("b", "user@example.test")).toBe(true);
    throttle.RecordSuccess(null, "user@example.test");
    expect(throttle.Check("", "user@example.test")).toBe(true);
    for (let i = 0; i < 25; i++) throttle.RecordFailure(null, `user${i}@example.test`);
    expect(throttle.Check(null, "other@example.test")).toBe(false);
    expect(throttle.Check("b", "other@example.test")).toBe(true);
    time = new Date(time.getTime() + 899999);
    expect(throttle.Check(null, "other@example.test")).toBe(false);
    time = new Date(time.getTime() + 1);
    expect(throttle.Check(null, "other@example.test")).toBe(true);
    expect(new LoginThrottle(clock, 1).Check(null, "a@example.test")).toBe(false);
});
