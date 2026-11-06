import { http as mockHttp, HttpResponse, delay } from "msw";
import { expect, test, vi } from "vitest";
import { healthResponseSchema } from "@workflow/contracts";
import { http, refreshAccessToken } from "../../app/api/http";
import { isApiFailure } from "../../app/api/errors";
import { beginSession, currentGeneration, endSession, readAccessToken } from "../../app/api/tokenStore";
import { server } from "../helpers/server";

const endpoint = "http://localhost/api/health";
const refreshEndpoint = "http://localhost/api/v1/auth/refresh";
const unauthorized = { statusCode: 401, code: "UNAUTHENTICATED", message: "Authentication required", error: "Unauthorized", requestId: "3f1a2b3c-4d5e-4f70-8192-a3b4c5d6e7f8" };

function stubBase(): void
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
}

test("transport resolves the configured base URL and sends cookies", async () =>
{
    stubBase();
    server.use(mockHttp.get(endpoint, ({ request }) =>
    {
        expect(request.credentials).toBe("include");
        return HttpResponse.json({ status: "ok" });
    }));
    expect(healthResponseSchema.parse(await http("/health"))).toEqual({ status: "ok" });
});

test("transport rejects HTTP errors with the frozen envelope fields", async () =>
{
    stubBase();
    server.use(mockHttp.get(endpoint, () => HttpResponse.json(
        { statusCode: 503, code: "SERVICE_UNAVAILABLE", message: "Service unavailable", error: "Service Unavailable", requestId: "3f1a2b3c-4d5e-4f70-8192-a3b4c5d6e7f8" },
        { status: 503 },
    )));
    const failure = await http("/health").catch((error: unknown) => error);
    expect(isApiFailure(failure)).toBe(true);
    if (!isApiFailure(failure)) throw new Error("expected ApiFailure");
    expect(failure.status).toBe(503);
    expect(failure.code).toBe("SERVICE_UNAVAILABLE");
    expect(failure.requestId).toBe("3f1a2b3c-4d5e-4f70-8192-a3b4c5d6e7f8");
});

test("transport accepts an empty successful response", async () =>
{
    stubBase();
    server.use(mockHttp.get(endpoint, () => new HttpResponse(null, { status: 204 })));
    await expect(http("/health")).resolves.toBeUndefined();
});

test("transport injects the in-memory access token and never touches web storage", async () =>
{
    stubBase();
    beginSession("memory-token");
    server.use(mockHttp.get(endpoint, ({ request }) =>
    {
        expect(request.headers.get("authorization")).toBe("Bearer memory-token");
        return HttpResponse.json({ status: "ok" });
    }));
    await http("/health");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(readAccessToken()?.token).toBe("memory-token");
    endSession();
});

test("concurrent 401 responses share a single in-flight refresh", async () =>
{
    stubBase();
    beginSession("stale");
    const generation = currentGeneration();
    let refreshCalls = 0;
    server.use(
            mockHttp.get(endpoint, ({ request }) =>
                request.headers.get("authorization") === "Bearer fresh"
                    ? HttpResponse.json({ status: "ok" })
                    : HttpResponse.json(unauthorized, { status: 401 })),
            mockHttp.post(refreshEndpoint, async () =>
            {
                refreshCalls += 1;
                await delay(20);
                return HttpResponse.json({ accessToken: "fresh" });
            }),
        );

    const results = await Promise.all([http("/health"), http("/health"), http("/health")]);
    expect(refreshCalls).toBe(1);
    expect(results).toEqual([{ status: "ok" }, { status: "ok" }, { status: "ok" }]);
    expect(readAccessToken()).toEqual({ token: "fresh", generation });
    endSession();
});

test("a request is retried at most once and a second 401 surfaces as an authentication failure", async () =>
{
    stubBase();
    beginSession("stale");
    let protectedCalls = 0;
    let refreshCalls = 0;
    server.use(
        mockHttp.get(endpoint, () =>
        {
            protectedCalls += 1;
            return HttpResponse.json(unauthorized, { status: 401 });
        }),
        mockHttp.post(refreshEndpoint, () =>
        {
            refreshCalls += 1;
            return HttpResponse.json({ accessToken: "still-stale" });
        }),
    );

    const failure = await http("/health").catch((error: unknown) => error);
    expect(isApiFailure(failure)).toBe(true);
    if (!isApiFailure(failure)) throw new Error("expected ApiFailure");
    expect(failure.status).toBe(401);
    expect(protectedCalls).toBe(2);
    expect(refreshCalls).toBe(1);
    endSession();
});

test("a failed refresh leaves the original 401 and installs no token", async () =>
{
    stubBase();
    beginSession("stale");
    server.use(
        mockHttp.get(endpoint, () => new HttpResponse(null, { status: 401 })),
        mockHttp.post(refreshEndpoint, () => new HttpResponse(null, { status: 401 })),
    );
    const failure = await http("/health").catch((error: unknown) => error);
    expect(isApiFailure(failure)).toBe(true);
    expect(readAccessToken()?.token).toBe("stale");
    endSession();
});

test("ending the session discards a response from the previous identity generation", async () =>
{
    stubBase();
    beginSession("stale");
    server.use(mockHttp.get(endpoint, async () =>
    {
        await delay(30);
        return HttpResponse.json({ status: "ok" });
    }));

    const pending = http("/health").catch((error: unknown) => error);
    endSession();
    expect(readAccessToken()).toBeNull();

    const failure = await pending;
    expect(isApiFailure(failure)).toBe(true);
    if (!isApiFailure(failure)) throw new Error("expected ApiFailure");
    expect(failure.kind).toBe("network");
    expect(readAccessToken()).toBeNull();
});

test("a stale generation never installs a refreshed token over a newer session", async () =>
{
    stubBase();
    beginSession("token-a");
    const staleGeneration = currentGeneration();
    server.use(mockHttp.post(refreshEndpoint, () => HttpResponse.json({ accessToken: "token-b" })));
    const staleRefresh = refreshAccessToken(staleGeneration);
    endSession();
    beginSession("token-c");
    await expect(staleRefresh).resolves.toBe(false);
    expect(readAccessToken()?.token).toBe("token-c");
    endSession();
});

test("network failures are reported as transport failures, not HTTP failures", async () =>
{
    stubBase();
    server.use(mockHttp.get(endpoint, () => HttpResponse.error()));
    const failure = await http("/health").catch((error: unknown) => error);
    expect(isApiFailure(failure)).toBe(true);
    if (!isApiFailure(failure)) throw new Error("expected ApiFailure");
    expect(failure.kind).toBe("network");
});