import { loginRequestSchema, refreshResponseSchema, userSummarySchema, type LoginRequest, type UserSummary } from "@workflow/contracts";
import { http, httpFor } from "~/api/http";
import { isApiFailure } from "~/api/errors";
import { beginSession, endSession } from "~/api/tokenStore";

/** Exchanges credentials for an access token (memory only) and the current identity. */
export async function login(credentials: LoginRequest, generation?: number): Promise<UserSummary>
{
    const request = loginRequestSchema.parse(credentials);
    const payload = await http("/v1/auth/login", { method: "POST", body: request, generation }) as { accessToken?: unknown; user?: unknown };
    if (typeof payload.accessToken !== "string") throw new Error("Unexpected login response");
    beginSession(payload.accessToken);
    return userSummarySchema.parse(payload.user);
}

/** Bootstraps identity for a protected page using the refresh cookie; returns null when signed out. */
export async function bootstrapSession(generation?: number): Promise<UserSummary | null>
{
    try
    {
        const refreshed = await http("/v1/auth/refresh", { method: "POST", generation });
        const token = refreshResponseSchema.safeParse(refreshed);
        if (!token.success) return null;
        beginSession(token.data.accessToken);
        return await currentUser(generation);
    }
    catch (error)
    {
        // An aborted bootstrap (page unloading) must not tear down a still-valid session.
        if (!(isApiFailure(error) && error.kind === "network" && error.cause instanceof DOMException && error.cause.name === "AbortError")) endSession();
        return null;
    }
}

/** Authoritative identity lookup for the current access token. */
export function currentUser(generation?: number): Promise<UserSummary>
{
    return httpFor("/v1/auth/me", userSummarySchema, { generation });
}

/** Revokes the server session and always clears local identity state. */
export async function logout(generation?: number): Promise<void>
{
    try
    {
        await http("/v1/auth/logout", { method: "POST", generation });
    }
    finally
    {
        endSession();
    }
}