import { refreshResponseSchema } from "@workflow/contracts";
import { ApiFailure } from "./errors";
import { currentGeneration, endSession, readAccessToken, writeAccessToken } from "./tokenStore";
import { parseErrorEnvelope } from "./errors";

export interface IHttpOptions extends Omit<RequestInit, "body">
{
    body?: unknown;
    generation?: number;
}

function baseUrl(): string
{
 return import.meta.env.VITE_API_BASE_URL || "/api";
}
export function abortFailure(): ApiFailure
{
    return new ApiFailure({ kind: "network", message: "Request cancelled", cause: new DOMException("Aborted", "AbortError") });
}
async function readBody(response: Response): Promise<unknown>
{
    if (response.status === 204) return undefined;
    const text = await response.text();
    if (!text) return undefined;
    try
{
 return JSON.parse(text);
}
 catch
{
 return undefined;
}
}
function failureFor(response: Response, body: unknown): ApiFailure
{
    const envelope = parseErrorEnvelope(response, body);
    return new ApiFailure({ kind: "http", status: response.status, code: envelope.code, message: envelope.message, requestId: envelope.requestId, details: envelope.details });
}

let cookieQueue: Promise<void> = Promise.resolve();
function enqueue<T>(work: () => Promise<T>): Promise<T>
{
    const result = cookieQueue.then(work);
    cookieQueue = result.then(() => undefined, () => undefined);
    return result;
}
const authPaths = new Set(["/v1/auth/login", "/v1/auth/refresh", "/v1/auth/logout", "/v1/auth/logout-all"]);
let refreshInFlight: { generation: number; promise: Promise<boolean> } | null = null;

export function refreshAccessToken(generation = currentGeneration()): Promise<boolean>
{
    if (generation !== currentGeneration()) return Promise.resolve(false);
    if (refreshInFlight?.generation === generation) return refreshInFlight.promise;
    const promise = enqueue(async () =>
    {
        if (generation !== currentGeneration()) return false;
        try
        {
            const response = await fetch(`${baseUrl()}/v1/auth/refresh`, { method: "POST", credentials: "include", headers: { Accept: "application/json" } });
            const payload = await readBody(response);
            if (generation !== currentGeneration()) return false;
            const parsed = refreshResponseSchema.safeParse(payload);
            if (!response.ok || !parsed.success)
            {
                endSession(generation);
                return false;
            }
            return writeAccessToken(parsed.data.accessToken, generation);
        }
        catch
        {
            endSession(generation);
            return false;
        }
    });
    refreshInFlight = { generation, promise };
    void promise.finally(() =>
{
 if (refreshInFlight?.promise === promise) refreshInFlight = null;
});
    return promise;
}

async function send(path: string, options: IHttpOptions, generation: number, allowRefresh: boolean, capturedRevocation = false): Promise<unknown>
{
    if (!capturedRevocation && generation !== currentGeneration()) throw abortFailure();
    const { body, generation: ignoredGeneration, headers, ...init } = options;
    void ignoredGeneration;
    const requestHeaders = new Headers(headers);
    requestHeaders.set("Accept", "application/json");
    if (body !== undefined) requestHeaders.set("Content-Type", "application/json");
    const token = readAccessToken();
    if (!requestHeaders.has("Authorization") && token?.generation === generation) requestHeaders.set("Authorization", `Bearer ${token.token}`);
    const eligible = allowRefresh && !authPaths.has(path) && requestHeaders.has("Authorization");
    let response: Response;
    let payload: unknown;
    try
    {
        response = await fetch(`${baseUrl()}${path}`, { ...init, headers: requestHeaders, credentials: "include", body: body === undefined ? undefined : JSON.stringify(body) });
        payload = await readBody(response);
    }
    catch (cause)
    {
        if (!capturedRevocation && generation !== currentGeneration()) throw abortFailure();
        throw new ApiFailure({ kind: "network", message: "Network request failed", cause });
    }
    if (!capturedRevocation && generation !== currentGeneration()) throw abortFailure();
    if (response.ok) return payload;
    if (response.status === 401 && eligible)
    {
        if (await refreshAccessToken(generation)) return send(path, options, generation, false);
        if (generation !== currentGeneration()) throw failureFor(response, payload);
    }
    else if (response.status === 401 && !allowRefresh && !authPaths.has(path) && requestHeaders.has("Authorization")) endSession(generation);
    throw failureFor(response, payload);
}

export function http(path: string, options: IHttpOptions = {}): Promise<unknown>
{
    const generation = options.generation ?? currentGeneration();
    if (authPaths.has(path)) return enqueue(() => send(path, options, generation, false));
    return send(path, options, generation, true);
}
export function revokeSession(token: string | null, retryGeneration?: number): Promise<unknown>
{
    const generation = currentGeneration();
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
    return enqueue(() =>
    {
        if (retryGeneration !== undefined && retryGeneration !== currentGeneration()) throw abortFailure();
        return send("/v1/auth/logout", { method: "POST", headers }, generation, false, true);
    });
}
export async function httpFor<T>(path: string, schema: { parse(value: unknown): T }, options: IHttpOptions = {}): Promise<T>
{
    return schema.parse(await http(path, options));
}
