import { ApiFailure, isAuthenticationFailure, parseErrorEnvelope } from "./errors";
import { currentGeneration, readAccessToken, writeAccessToken } from "./tokenStore";

export interface IHttpOptions extends Omit<RequestInit, "body">
{
    body?: unknown;
    /** Identity generation that scopes this request; stale generations never install tokens or resolve. */
    generation?: number;
}

interface IRefreshResponse
{
    accessToken: string;
}

function baseUrl(): string
{
    return import.meta.env.VITE_API_BASE_URL || "/api";
}

function abortFailure(): ApiFailure
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
    return new ApiFailure({
        kind: "http",
        status: response.status,
        code: envelope.code,
        message: envelope.message,
        requestId: envelope.requestId,
        details: envelope.details,
    });
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Exchanges the HttpOnly refresh cookie for a new access token.
 * Single-flight: concurrent 401s share one network round trip per browser runtime.
 */
export function refreshAccessToken(generation?: number): Promise<boolean>
{
    if (generation !== undefined && generation !== currentGeneration()) return Promise.resolve(false);
    refreshInFlight ??= (async () =>
    {
        try
        {
            const response = await fetch(`${baseUrl()}/v1/auth/refresh`, { method: "POST", credentials: "include", headers: { Accept: "application/json" } });
            if (!response.ok) return false;
            const payload = await readBody(response);
            if (!payload || typeof payload !== "object" || typeof (payload as IRefreshResponse).accessToken !== "string") return false;
            return writeAccessToken((payload as IRefreshResponse).accessToken, generation ?? currentGeneration());
        }
        catch
        {
            return false;
        }
        finally
        {
            refreshInFlight = null;
        }
    })();
    return refreshInFlight;
}

async function send(path: string, options: IHttpOptions, allowRefresh: boolean): Promise<unknown>
{
    const { body, generation, headers, ...init } = options;
    const requestedGeneration = generation ?? currentGeneration();
    const requestHeaders = new Headers(headers);
    requestHeaders.set("Accept", "application/json");
    if (body !== undefined) requestHeaders.set("Content-Type", "application/json");
    const token = readAccessToken();
    if (token && token.generation === requestedGeneration) requestHeaders.set("Authorization", `Bearer ${token.token}`);

    let response: Response;
    try
    {
        response = await fetch(`${baseUrl()}${path}`, {
            ...init,
            headers: requestHeaders,
            credentials: "include",
            body: body === undefined ? undefined : JSON.stringify(body),
        });
    }
    catch (cause)
    {
        throw new ApiFailure({ kind: "network", message: "Network request failed", cause });
    }

    if (response.ok)
    {
        if (requestedGeneration !== currentGeneration()) throw abortFailure();
        return readBody(response);
    }

    if (response.status === 401 && allowRefresh)
    {
        const refreshed = await refreshAccessToken(requestedGeneration);
        const active = readAccessToken();
        if (!refreshed || !active || active.generation !== requestedGeneration) throw failureFor(response, await readBody(response));
        return send(path, { ...options, generation: requestedGeneration }, false);
    }

    throw failureFor(response, await readBody(response));
}

/**
 * Typed API transport: injects the in-memory Bearer token, parses the frozen error
 * envelope, refreshes once on 401 (single-flight, at most one retry per request),
 * and discards responses from superseded identity generations.
 */
export async function http(path: string, options: IHttpOptions = {}): Promise<unknown>
{
    const requestedGeneration = options.generation ?? currentGeneration();
    try
    {
        return await send(path, options, true);
    }
    catch (error)
    {
        if (isAuthenticationFailure(error) && currentGeneration() !== requestedGeneration) throw abortFailure();
        throw error;
    }
}

/** Typed variant that validates the response body with a shared Zod schema. */
export async function httpFor<T>(path: string, schema: { parse(value: unknown): T }, options: IHttpOptions = {}): Promise<T>
{
    return schema.parse(await http(path, options));
}