import { http as mockHttp, HttpResponse } from "msw";
import { expect, test, vi } from "vitest";
import { login, logout, retryLogout } from "../../app/services/authService";
import { beginSession, currentGeneration, endSession, readAccessToken } from "../../app/api/tokenStore";
import { refreshAccessToken } from "../../app/api/http";
import { server } from "../helpers/server";

test("malformed login identity never publishes bearer", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    endSession();
    server.use(mockHttp.post("http://localhost/api/v1/auth/login", () => HttpResponse.json({ accessToken: "secret", user: {} })));
    await expect(login({ email: "person@example.com", password: "password" })).rejects.toBeDefined();
    expect(readAccessToken()).toBeNull();
    endSession();
});


test("cookie mutations settle in refresh, logout, then replacement login order", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    beginSession("a");
    let releaseRefresh!: () => void;
    let releaseLogout!: () => void;
    let refreshStarted!: () => void;
    let logoutStarted!: () => void;
    const refreshGate = new Promise<void>((resolve) =>
{
 releaseRefresh = resolve;
});
    const logoutGate = new Promise<void>((resolve) =>
{
 releaseLogout = resolve;
});
    const refreshEntered = new Promise<void>((resolve) =>
{
 refreshStarted = resolve;
});
    const logoutEntered = new Promise<void>((resolve) =>
{
 logoutStarted = resolve;
});
    const starts: string[] = [];
    let cookie = "a";
    const user = { id: "7bb91ef4-5982-405f-8bd5-61b5c3cf410b", displayName: "B", email: "b@example.test", roles: ["REQUESTER"], isActive: true, department: null };
    server.use(
        mockHttp.post("http://localhost/api/v1/auth/refresh", async () =>
{
 starts.push("refresh"); refreshStarted(); await refreshGate; cookie = "rotated-a"; return HttpResponse.json({ accessToken: "rotated-a" });
}),
        mockHttp.post("http://localhost/api/v1/auth/logout", async ({ request }) =>
{
 starts.push("logout"); expect(request.headers.get("authorization")).toBe("Bearer a"); logoutStarted(); await logoutGate; cookie = ""; return new HttpResponse(null, { status: 204 });
}),
        mockHttp.post("http://localhost/api/v1/auth/login", () =>
{
 starts.push("login"); cookie = "b"; return HttpResponse.json({ accessToken: "b", user });
}),
    );
    const refreshing = refreshAccessToken();
    await refreshEntered;
    const signingOut = logout();
    const signingIn = login({ email: "b@example.test", password: "password" });
    releaseRefresh();
    await logoutEntered;
    expect(starts).toEqual(["refresh", "logout"]);
    releaseLogout();
    await signingOut;
    expect(await refreshing).toBe(false);
    expect((await signingIn).displayName).toBe("B");
    expect(starts).toEqual(["refresh", "logout", "login"]);
    expect(cookie).toBe("b");
    expect(readAccessToken()?.token).toBe("b");
    endSession();
});


test("superseded queued login and refresh never dispatch", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    beginSession("a");
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) =>
{
 release = resolve;
});
    const started = new Promise<void>((resolve) =>
{
 entered = resolve;
});
    const calls: string[] = [];
    const user = { id: "7bb91ef4-5982-405f-8bd5-61b5c3cf410b", displayName: "C", email: "c@example.test", roles: ["REQUESTER"], isActive: true, department: null };
    server.use(
        mockHttp.post("http://localhost/api/v1/auth/refresh", async () =>
{
 calls.push("refresh-a"); entered(); await gate; return HttpResponse.json({ accessToken: "refreshed-a" });
}),
        mockHttp.post("http://localhost/api/v1/auth/login", async ({ request }) =>
{
 const body = await request.json() as { email: string }; calls.push(body.email); return HttpResponse.json({ accessToken: "c", user });
}),
    );
    const a = refreshAccessToken();
    await started;
    const b = login({ email: "b@example.test", password: "password" }).catch((error: unknown) => error);
    const bRefresh = refreshAccessToken(currentGeneration());
    const c = login({ email: "c@example.test", password: "password" });
    release();
    expect(await a).toBe(false);
    expect(await b).toBeInstanceOf(Error);
    expect(await bRefresh).toBe(false);
    expect((await c).displayName).toBe("C");
    expect(calls).toEqual(["refresh-a", "c@example.test"]);
    expect(readAccessToken()?.token).toBe("c");
    endSession();
});

test.each(["503", "network"])("service logout %s clears identity before rejecting", async (kind) =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    beginSession("a");
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) =>
{
 release = resolve;
});
    const started = new Promise<void>((resolve) =>
{
 entered = resolve;
});
    server.use(mockHttp.post("http://localhost/api/v1/auth/logout", async () =>
    {
        entered(); await gate;
        return kind === "network" ? HttpResponse.error() : new HttpResponse(null, { status: 503 });
    }));
    const pending = logout().catch((error: unknown) => error);
    await started;
    expect(readAccessToken()).toBeNull();
    release();
    expect(await pending).toBeInstanceOf(Error);
    expect(readAccessToken()).toBeNull();
    endSession();
});

test("queued logout retry cancels after a newer login reservation", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    beginSession("a");
    const generation = currentGeneration();
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) =>
{
 release = resolve;
});
    const started = new Promise<void>((resolve) =>
{
 entered = resolve;
});
    let logoutCalls = 0;
    const user = { id: "7bb91ef4-5982-405f-8bd5-61b5c3cf410b", displayName: "B", email: "b@example.test", roles: ["REQUESTER"], isActive: true, department: null };
    server.use(
        mockHttp.post("http://localhost/api/v1/auth/refresh", async () =>
{
 entered(); await gate; return HttpResponse.json({ accessToken: "old" });
}),
        mockHttp.post("http://localhost/api/v1/auth/logout", () =>
{
 logoutCalls += 1; return new HttpResponse(null, { status: 204 });
}),
        mockHttp.post("http://localhost/api/v1/auth/login", () => HttpResponse.json({ accessToken: "b", user })),
    );
    const refreshing = refreshAccessToken();
    await started;
    const retry = retryLogout("a", generation).catch((error: unknown) => error);
    const replacement = login({ email: "b@example.test", password: "password" });
    release();
    expect(await refreshing).toBe(false);
    expect(await retry).toBeInstanceOf(Error);
    expect((await replacement).displayName).toBe("B");
    expect(logoutCalls).toBe(0);
    expect(readAccessToken()?.token).toBe("b");
    endSession();
});
