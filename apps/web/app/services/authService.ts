import { loginRequestSchema, loginResponseSchema, userSummarySchema, type LoginRequest, type UserSummary } from "@workflow/contracts";
import { abortFailure, http, httpFor, refreshAccessToken, revokeSession } from "~/api/http";
import { currentGeneration, endSession, readAccessToken, writeAccessToken } from "~/api/tokenStore";

export async function login(credentials: LoginRequest, generation?: number): Promise<UserSummary>
{
    const request = loginRequestSchema.parse(credentials);
    if (generation === undefined)
    {
        endSession();
        generation = currentGeneration();
    }
    const payload = loginResponseSchema.parse(await http("/v1/auth/login", { method: "POST", body: request, generation }));
    if (!writeAccessToken(payload.accessToken, generation)) throw abortFailure();
    return payload.user;
}
export async function bootstrapSession(generation = currentGeneration()): Promise<UserSummary | null>
{
    if (!await refreshAccessToken(generation)) return null;
    try
{
 return await currentUser(generation);
}
    catch
{
 endSession(generation); return null;
}
}
export function currentUser(generation = currentGeneration()): Promise<UserSummary>
{
    return httpFor("/v1/auth/me", userSummarySchema, { generation });
}
export async function logout(): Promise<void>
{
    const token = readAccessToken()?.token ?? null;
    endSession();
    await revokeSession(token);
}
export async function retryLogout(token: string | null, generation: number): Promise<void>
{
    await revokeSession(token, generation);
}
