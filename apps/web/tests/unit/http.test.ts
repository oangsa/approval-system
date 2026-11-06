import { http as mockHttp, HttpResponse, delay } from "msw";
import { expect, test, vi } from "vitest";
import { healthResponseSchema } from "@workflow/contracts";
import { http, refreshAccessToken } from "../../app/api/http";
import { isApiFailure } from "../../app/api/errors";
import { beginSession, currentGeneration, endSession, readAccessToken, subscribeInvalidation } from "../../app/api/tokenStore";
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
    const generation = currentGeneration();
    let invalidations = 0;
    const unsubscribe = subscribeInvalidation(() =>
{
 invalidations += 1;
});
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

    try
    {
        const failure = await http("/health").catch((error: unknown) => error);
        expect(isApiFailure(failure)).toBe(true);
        if (!isApiFailure(failure)) throw new Error("expected ApiFailure");
        expect(failure.status).toBe(401);
        expect(protectedCalls).toBe(2);
        expect(refreshCalls).toBe(1);
        expect(readAccessToken()).toBeNull();
        expect(currentGeneration()).toBe(generation + 1);
        expect(invalidations).toBe(1);
    }
    finally
{
 unsubscribe(); endSession();
}
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
    expect(readAccessToken()).toBeNull();
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

test("public login 401 never refreshes or retries", async () =>
{
    stubBase();
    endSession();
    let loginCalls = 0;
    let refreshCalls = 0;
    server.use(
        mockHttp.post("http://localhost/api/v1/auth/login", () =>
{
 loginCalls += 1; return new HttpResponse(null, { status: 401 });
}),
        mockHttp.post(refreshEndpoint, () =>
{
 refreshCalls += 1; return HttpResponse.json({ accessToken: "old" });
}),
    );
    await expect(http("/v1/auth/login", { method: "POST", body: {} })).rejects.toBeDefined();
    expect(loginCalls).toBe(1);
    expect(refreshCalls).toBe(0);
    expect(readAccessToken()).toBeNull();
});

test("response body arriving after identity replacement is rejected", async () =>
{
    stubBase();
    beginSession("token-a");
    let release!: (value: string) => void;
    let started!: () => void;
    const bodyStarted = new Promise<void>((resolve) =>
{
 started = resolve;
});
    const body = new Promise<string>((resolve) =>
{
 release = resolve;
});
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ ok: true, status: 200, text: () =>
{
 started(); return body;
} } as Response);
    const pending = http("/health");
    await bodyStarted;
    endSession();
    beginSession("token-b");
    release('{"status":"ok"}');
    await expect(pending).rejects.toBeDefined();
    expect(readAccessToken()?.token).toBe("token-b");
    vi.restoreAllMocks();
    endSession();
});


test.each(["401", "503", "network", "malformed200"])("terminal refresh %s clears identity without retry", async (kind) =>
{
    stubBase();
    beginSession("stale");
    let protectedCalls = 0;
    let refreshCalls = 0;
    server.use(
        mockHttp.get(endpoint, () =>
{
 protectedCalls += 1; return new HttpResponse(null, { status: 401 });
}),
        mockHttp.post(refreshEndpoint, () =>
        {
            refreshCalls += 1;
            if (kind === "network") return HttpResponse.error();
            if (kind === "malformed200") return HttpResponse.json({ accessToken: 42 });
            return new HttpResponse(null, { status: Number(kind) });
        }),
    );
    await expect(http("/health")).rejects.toBeDefined();
    expect(protectedCalls).toBe(1);
    expect(refreshCalls).toBe(1);
    expect(readAccessToken()).toBeNull();
    endSession();
});

test.each(["403", "503", "network"])("ordinary protected %s preserves identity", async (kind) =>
{
    stubBase();
    beginSession("current");
    const generation = currentGeneration();
    let calls = 0;
    let refreshCalls = 0;
    server.use(
        mockHttp.get(endpoint, () =>
{
 calls += 1; return kind === "network" ? HttpResponse.error() : new HttpResponse(null, { status: Number(kind) });
}),
        mockHttp.post(refreshEndpoint, () =>
{
 refreshCalls += 1; return HttpResponse.json({ accessToken: "wrong" });
}),
    );
    await expect(http("/health")).rejects.toBeDefined();
    expect(calls).toBe(1);
    expect(refreshCalls).toBe(0);
    expect(readAccessToken()).toEqual({ token: "current", generation });
    expect(currentGeneration()).toBe(generation);
    endSession();
});

test("public 401 without bearer and authenticated auth endpoint 401 do not refresh", async () =>
{
    stubBase();
    endSession();
    let publicCalls = 0;
    let authCalls = 0;
    let refreshCalls = 0;
    server.use(
        mockHttp.get(endpoint, () =>
{
 publicCalls += 1; return new HttpResponse(null, { status: 401 });
}),
        mockHttp.post("http://localhost/api/v1/auth/logout", () =>
{
 authCalls += 1; return new HttpResponse(null, { status: 401 });
}),
        mockHttp.post(refreshEndpoint, () =>
{
 refreshCalls += 1; return HttpResponse.json({ accessToken: "wrong" });
}),
    );
    await expect(http("/health")).rejects.toBeDefined();
    beginSession("current");
    await expect(http("/v1/auth/logout", { method: "POST" })).rejects.toBeDefined();
    expect([publicCalls, authCalls, refreshCalls]).toEqual([1, 1, 0]);
    expect(readAccessToken()?.token).toBe("current");
    endSession();
});

test("late error body cancels after identity replacement", async () =>
{
    stubBase();
    beginSession("a");
    let release!: (value: string) => void;
    let entered!: () => void;
    const body = new Promise<string>((resolve) =>
{
 release = resolve;
});
    const started = new Promise<void>((resolve) =>
{
 entered = resolve;
});
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({ ok: false, status: 503, text: () =>
{
 entered(); return body;
} } as Response);
    try
    {
        const pending = http("/health").catch((error: unknown) => error);
        await started;
        beginSession("b");
        release("{}");
        const failure = await pending;
        expect(isApiFailure(failure)).toBe(true);
        if (!isApiFailure(failure)) throw new Error("expected ApiFailure");
        expect(failure.message).toBe("Request cancelled");
        expect(readAccessToken()?.token).toBe("b");
    }
    finally
{
 spy.mockRestore(); endSession();
}
});

test("refresh ownership remains single-flight for the replacement generation", async () =>
{
    stubBase();
    beginSession("a");
    const generationA = currentGeneration();
    let releaseA!: () => void;
    let releaseB!: () => void;
    let enterA!: () => void;
    let enterB!: () => void;
    const gateA = new Promise<void>((resolve) =>
{
 releaseA = resolve;
});
    const gateB = new Promise<void>((resolve) =>
{
 releaseB = resolve;
});
    const startedA = new Promise<void>((resolve) =>
{
 enterA = resolve;
});
    const startedB = new Promise<void>((resolve) =>
{
 enterB = resolve;
});
    let calls = 0;
    server.use(mockHttp.post(refreshEndpoint, async () =>
    {
        calls += 1;
        if (calls === 1)
{
 enterA(); await gateA; return HttpResponse.json({ accessToken: "refreshed-a" });
}
        enterB(); await gateB; return HttpResponse.json({ accessToken: "refreshed-b" });
    }));
    const a = refreshAccessToken(generationA);
    await startedA;
    beginSession("b");
    const generationB = currentGeneration();
    const b1 = refreshAccessToken(generationB);
    const b2 = refreshAccessToken(generationB);
    releaseA();
    expect(await a).toBe(false);
    await startedB;
    expect(readAccessToken()).toEqual({ token: "b", generation: generationB });
    const b3 = refreshAccessToken(generationB);
    expect(b1).toBe(b2);
    expect(b1).toBe(b3);
    releaseB();
    expect(await Promise.all([b1, b2, b3])).toEqual([true, true, true]);
    expect(calls).toBe(2);
    expect(readAccessToken()).toEqual({ token: "refreshed-b", generation: generationB });
    endSession();
});
