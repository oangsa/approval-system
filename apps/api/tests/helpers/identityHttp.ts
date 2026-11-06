import { expect } from "vitest";
import { errorResponseSchema } from "@workflow/contracts";
import type { DepartmentSummary, UserRole } from "@workflow/contracts";
import { Login } from "../../src/Applications/Identity/Login";
import { RefreshSession } from "../../src/Applications/Identity/RefreshSession";
import { Authenticate } from "../../src/Applications/Identity/Authenticate";
import { GetCurrentUser } from "../../src/Applications/Identity/GetCurrentUser";
import { Logout } from "../../src/Applications/Identity/Logout";
import { LogoutAll } from "../../src/Applications/Identity/LogoutAll";
import type { IAccount, IRefreshHistory, ISessionFamily } from "../../src/Domains/Identity/Identity";
import type { IIdentityRepository, IIdentityUnitOfWork } from "../../src/Domains/Identity/Ports";
import { LoginThrottle } from "../../src/Infrastructures/Security/LoginThrottle";
import { RefreshTokenProvider } from "../../src/Infrastructures/Security/RefreshTokenProvider";
import { TokenProvider } from "../../src/Infrastructures/Security/TokenProvider";
import type { IIdentityHttpDependencies } from "../../src/Presentations/composition";

export const testSecret = "test-secret-at-least-32-bytes-long";
export const testIssuer = "test-issuer";
export const testAudience = "test-audience";
type ControlledMethod = "FindUserByEmail" | "FindRefreshTokenByHash" | "ReadCurrentIdentity";

export function identityHttpFixture()
{
    let now = new Date();
    const clock = { Now: () => new Date(now) };
    const advance = (milliseconds: number) =>
{
 now = new Date(now.getTime() + milliseconds);
};
    const account: IAccount = { id: "00000000-0000-4000-8000-000000000001", email: "user@example.test", displayName: "User", passwordHash: "hash", isActive: true, authVersion: 0, createdAt: now, updatedAt: now };
    const other: IAccount = { ...account, id: "00000000-0000-4000-8000-000000000002", email: "other@example.test", displayName: "Other" };
    const accounts = new Map([account, other].map((item) => [item.id, item]));
    const identities = new Map<string, { roles: UserRole[]; department: DepartmentSummary | null }>([...accounts.keys()].map((id) => [id, { roles: ["REQUESTER"], department: null }]));
    const families = new Map<string, ISessionFamily>();
    const history = new Map<string, IRefreshHistory>();
    const calls: Record<ControlledMethod, number> = { FindUserByEmail: 0, FindRefreshTokenByHash: 0, ReadCurrentIdentity: 0 };
    const failures = new Map<ControlledMethod, unknown>();
    const check = (method: ControlledMethod) =>
    {
        calls[method]++;
        if (failures.has(method)) throw failures.get(method);
    };
    const resetControls = () =>
    {
        failures.clear();
        for (const method of Object.keys(calls) as ControlledMethod[]) calls[method] = 0;
    };
    const repository: IIdentityRepository = {
        FindUserByEmail: async (email) =>
{
 check("FindUserByEmail"); return [...accounts.values()].find((item) => item.email === email);
},
        FindUserById: async (id) => accounts.get(id),
        FindRefreshTokenByHash: async (hash) =>
        {
            check("FindRefreshTokenByHash");
            const token = [...history.values()].find((item) => item.tokenHash === hash);
            const family = token && families.get(token.familyId);
            return token && family ? { token, family } : undefined;
        },
        LockUser: async (id) => accounts.get(id),
        LockFamily: async (id) => families.get(id),
        ReadCurrentIdentity: async (userId, familyId) =>
        {
            check("ReadCurrentIdentity");
            const current = accounts.get(userId);
            const identity = identities.get(userId);
            const family = families.get(familyId);
            return current && identity && family ? { account: current, family, ...identity } : undefined;
        },
        InsertFamily: async (family) =>
{
 families.set(family.id, family);
},
        InsertRefreshToken: async (token) =>
{
 history.set(token.id, token);
},
        ConsumeRefreshToken: async (id, at) =>
        {
            const token = history.get(id);
            if (!token || token.consumedAt) return false;
            token.consumedAt = at;
            return true;
        },
        RevokeFamily: async (id, at) =>
{
 const family = families.get(id); if (family) family.revokedAt = at;
},
        RevokeAllFamilies: async (id, at) =>
{
 for (const family of families.values()) if (family.userId === id) family.revokedAt = at;
},
        IncrementAuthVersion: async (id) =>
{
 const current = accounts.get(id); if (current) current.authVersion++;
},
    };
    const unit: IIdentityUnitOfWork = { Run: async (operation) =>
    {
        const snapshot = <T extends object>(map: Map<string, T>) => [...map].map(([key, original]) => ({ key, original, copy: structuredClone(original) }));
        const accountSnapshot = snapshot(accounts);
        const familySnapshot = snapshot(families);
        const historySnapshot = snapshot(history);
        const restore = <T extends object>(map: Map<string, T>, entries: ReturnType<typeof snapshot<T>>) =>
        {
            map.clear();
            for (const { key, original, copy } of entries)
            {
                Object.assign(original, copy);
                map.set(key, original);
            }
        };
        try
        {
            return await operation(repository);
        }
        catch (error)
        {
            restore(accounts, accountSnapshot);
            restore(families, familySnapshot);
            restore(history, historySnapshot);
            throw error;
        }
    } };
    const tokens = new TokenProvider(testSecret, clock, testIssuer, testAudience);
    const refreshTokens = new RefreshTokenProvider();
    const passwordCalls: Array<[string, string]> = [];
    const passwords = { Hash: async () => "hash", Verify: async (password: string, hash: string) =>
{
 passwordCalls.push([password, hash]); return hash === "hash" && password === "password";
} };
    const dependencies: IIdentityHttpDependencies = {
        login: new Login(repository, unit, passwords, tokens, refreshTokens, new LoginThrottle(clock), clock, "dummy"),
        refresh: new RefreshSession(repository, unit, tokens, refreshTokens, clock),
        authenticate: new Authenticate(tokens, repository, clock),
        getCurrentUser: new GetCurrentUser(),
        logout: new Logout(repository, unit, refreshTokens, clock),
        logoutAll: new LogoutAll(unit, clock),
        allowedOrigins: ["http://localhost:3000"], cookieSecure: false, clock,
    };
    return { dependencies, account, other, accounts, identities, families, history, repository, unit, tokens, refreshTokens, clock, advance, calls, failures, resetControls, passwordCalls };
}

export async function expectHttpError(response: Response, status: 400 | 401 | 403 | 404 | 422 | 429 | 500 | 503)
{
    const tuples = {
        400: ["BAD_REQUEST", "Bad request", "Bad Request"],
        401: ["UNAUTHENTICATED", "Authentication required", "Unauthorized"],
        403: ["FORBIDDEN", "Forbidden", "Forbidden"],
        404: ["NOT_FOUND", "Not found", "Not Found"],
        422: ["VALIDATION_ERROR", "Validation failed", "Unprocessable Entity"],
        429: ["RATE_LIMITED", "Too many requests", "Too Many Requests"],
        500: ["INTERNAL_ERROR", "Internal server error", "Internal Server Error"],
        503: ["SERVICE_UNAVAILABLE", "Service unavailable", "Service Unavailable"],
    } as const;
    const [code, message, error] = tuples[status];
    const body = errorResponseSchema.parse(await response.clone().json());
    expect(response.status).toBe(status);
    expect(body).toEqual({ statusCode: status, code, message, error, requestId: expect.any(String) });
    expect(response.headers.get("x-request-id")).toBe(body.requestId);
    expect(new Set((response.headers.get("cache-control") ?? "").split(",").map((value) => value.trim().toLowerCase()))).toEqual(new Set(["no-store"]));
    expect(JSON.stringify(body)).not.toMatch(/password|hash|Bearer|refreshToken|stack|SQL|sentinel|account|department|family|session/i);
    return body;
}
