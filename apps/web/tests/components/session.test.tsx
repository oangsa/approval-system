import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http as mockHttp, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router";
import { useState } from "react";
import { expect, test, vi } from "vitest";
import { SessionProvider, useSession, type ISessionContext } from "../../app/modules/auth/sessionContext";
import { beginSession, currentGeneration, endSession, readAccessToken } from "../../app/api/tokenStore";
import { http, refreshAccessToken } from "../../app/api/http";
import { ProtectedLayout } from "../../app/modules/shell/ProtectedLayout";
import { LoginForm } from "../../app/modules/auth/LoginForm";
import { server } from "../helpers/server";

const identity = { id: "7bb91ef4-5982-405f-8bd5-61b5c3cf410b", displayName: "Test User", email: "test@example.test", roles: ["REQUESTER"], isActive: true, department: null };
function Probe()
{
    const session = useSession();
    return <><span>{session.status}:{session.user?.displayName}</span><button onClick={() => void session.signIn({ email: "test@example.test", password: "password" })}>login</button><button onClick={() => void session.signOut()}>logout</button></>;
}

test("logout immediately removes local identity while server response is pending", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    endSession();
    let release!: () => void;
    const pending = new Promise<void>((resolve) =>
{
 release = resolve;
});
    server.use(
        mockHttp.post("http://localhost/api/v1/auth/login", () => HttpResponse.json({ accessToken: "a", user: identity })),
        mockHttp.post("http://localhost/api/v1/auth/logout", async () =>
{
 await pending; return new HttpResponse(null, { status: 503 });
}),
    );
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/auth/login"]}><SessionProvider><Probe /></SessionProvider></MemoryRouter>);
    await user.click(screen.getByText("login"));
    await screen.findByText("authenticated:Test User");
    await user.click(screen.getByText("logout"));
    expect(screen.getByText("anonymous:")).toBeInTheDocument();
    expect(readAccessToken()).toBeNull();
    await act(async () =>
{
 release();
});
    await waitFor(() => expect(screen.getByText("anonymous:")).toBeInTheDocument());
    endSession();
});


let captured: ISessionContext;
let navigate: NavigateFunction;
function Capture()
{
    captured = useSession();
    navigate = useNavigate();
    return <span data-testid="session">{captured.status}:{captured.user?.displayName}:{String(captured.logoutWarning)}:{String(captured.retryPending)}</span>;
}
function StatefulChild()
{
    const [count, setCount] = useState(0);
    return <button onClick={() => setCount(count + 1)}>private:{count}</button>;
}
function renderSession(path = "/auth/login")
{
    return render(<MemoryRouter initialEntries={[path]}><SessionProvider><Capture /><Routes><Route path="/auth/login" element={<p>login page</p>} /><Route element={<ProtectedLayout />}><Route path="/dashboard" element={<StatefulChild />} /></Route></Routes></SessionProvider></MemoryRouter>);
}
const credentials = { email: "test@example.test", password: "password" };
const identityB = { ...identity, displayName: "B", email: "b@example.test" };

test.each(["401", "503", "network", "malformed200", "retry401"])("provider becomes anonymous after terminal %s", async (kind) =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    endSession();
    let refreshCalls = 0;
    let meCalls = 0;
    let protectedCalls = 0;
    server.use(
        mockHttp.post("http://localhost/api/v1/auth/login", () => HttpResponse.json({ accessToken: "a", user: identity })),
        mockHttp.get("http://localhost/api/v1/auth/me", () =>
{
 meCalls += 1; return HttpResponse.json(identity);
}),
        mockHttp.get("http://localhost/api/private", () =>
{
 protectedCalls += 1; return new HttpResponse(null, { status: 401 });
}),
        mockHttp.post("http://localhost/api/v1/auth/refresh", () =>
        {
            refreshCalls += 1;
            if (kind === "network") return HttpResponse.error();
            if (kind === "malformed200") return HttpResponse.json({ accessToken: 42 });
            if (kind === "retry401") return HttpResponse.json({ accessToken: "fresh" });
            return new HttpResponse(null, { status: Number(kind) });
        }),
    );
    renderSession();
    await act(async () =>
{
 await captured.signIn(credentials);
});
    await act(async () =>
{
 await navigate("/dashboard");
});
    expect(await screen.findByText("private:0")).toBeInTheDocument();
    await act(async () =>
{
 await http("/private").catch(() => undefined);
});
    expect(readAccessToken()).toBeNull();
    expect(captured.status).toBe("anonymous");
    expect(screen.queryByText("private:0")).not.toBeInTheDocument();
    expect(screen.getByText("login page")).toBeInTheDocument();
    expect(refreshCalls).toBe(1);
    expect(meCalls).toBe(0);
    expect(protectedCalls).toBe(kind === "retry401" ? 2 : 1);
    endSession();
});

test.each(["503", "401", "network"])("provider logout %s preserves warning until successful retry", async (kind) =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    endSession();
    let release!: () => void;
    let entered!: () => void;
    let releaseRetry!: () => void;
    let enteredRetry!: () => void;
    const gate = new Promise<void>((resolve) =>
{
 release = resolve;
});
    const started = new Promise<void>((resolve) =>
{
 entered = resolve;
});
    const retryGate = new Promise<void>((resolve) =>
{
 releaseRetry = resolve;
});
    const retryStarted = new Promise<void>((resolve) =>
{
 enteredRetry = resolve;
});
    let calls = 0;
    let refreshCalls = 0;
    let meCalls = 0;
    server.use(
        mockHttp.post("http://localhost/api/v1/auth/login", () => HttpResponse.json({ accessToken: "a", user: identity })),
        mockHttp.post("http://localhost/api/v1/auth/logout", async () =>
        {
            calls += 1;
            if (calls === 1)
{
 entered(); await gate;
}
            if (calls === 2)
{
 enteredRetry(); await retryGate;
}
            if (calls < 3) return kind === "network" ? HttpResponse.error() : new HttpResponse(null, { status: Number(kind) });
            return new HttpResponse(null, { status: 204 });
        }),
    );
    renderSession();
    await act(async () =>
{
 await captured.signIn(credentials);
});
    await act(async () =>
{
 await navigate("/dashboard");
});
    expect(await screen.findByText("private:0")).toBeInTheDocument();
    server.use(
        mockHttp.post("http://localhost/api/v1/auth/refresh", () =>
{
 refreshCalls += 1; return HttpResponse.json({ accessToken: "fresh" });
}),
        mockHttp.get("http://localhost/api/v1/auth/me", () =>
{
 meCalls += 1; return HttpResponse.json(identity);
}),
    );
    let signingOut!: Promise<void>;
    act(() =>
{
 signingOut = captured.signOut();
});
    await started;
    expect(captured.status).toBe("anonymous");
    expect(readAccessToken()).toBeNull();
    expect(screen.queryByText("private:0")).not.toBeInTheDocument();
    expect(screen.getByText("login page")).toBeInTheDocument();
    expect(refreshCalls).toBe(0);
    expect(meCalls).toBe(0);
    await act(async () =>
{
 release(); await signingOut;
});
    expect(captured.logoutWarning).toBe(true);
    let retry!: Promise<void>;
    act(() =>
{
 retry = captured.retrySignOut();
});
    await retryStarted;
    expect(captured.retryPending).toBe(true);
    expect(captured.logoutWarning).toBe(true);
    expect(captured.status).toBe("anonymous");
    expect(readAccessToken()).toBeNull();
    await act(async () =>
{
 releaseRetry(); await retry;
});
    expect(refreshCalls).toBe(0);
    expect(meCalls).toBe(0);
    expect(captured.logoutWarning).toBe(true);
    expect(captured.retryPending).toBe(false);
    await act(async () =>
{
 await captured.retrySignOut();
});
    expect(refreshCalls).toBe(0);
    expect(meCalls).toBe(0);
    expect(captured.logoutWarning).toBe(false);
    expect(captured.retryPending).toBe(false);
    expect(captured.status).toBe("anonymous");
    expect(readAccessToken()).toBeNull();
    expect(calls).toBe(3);
    endSession();
});

test("queued provider retry is superseded by a new signIn", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    endSession();
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
    let loginCalls = 0;
    let logoutCalls = 0;
    server.use(
        mockHttp.post("http://localhost/api/v1/auth/login", () =>
{
 loginCalls += 1; return HttpResponse.json({ accessToken: loginCalls === 1 ? "a" : "b", user: loginCalls === 1 ? identity : identityB });
}),
        mockHttp.post("http://localhost/api/v1/auth/logout", () =>
{
 logoutCalls += 1; return new HttpResponse(null, { status: 503 });
}),
        mockHttp.post("http://localhost/api/v1/auth/refresh", async () =>
{
 entered(); await gate; return HttpResponse.json({ accessToken: "old" });
}),
    );
    renderSession();
    await act(async () =>
{
 await captured.signIn(credentials); await captured.signOut();
});
    expect(captured.logoutWarning).toBe(true);
    const refresh = refreshAccessToken(currentGeneration()).catch((error: unknown) => error);
    await started;
    let retry!: Promise<unknown>;
    act(() =>
{
 retry = captured.retrySignOut().catch((error: unknown) => error);
});
    expect(captured.retryPending).toBe(true);
    let signIn!: Promise<unknown>;
    act(() =>
{
 signIn = captured.signIn({ ...credentials, email: "b@example.test" }).catch((error: unknown) => error);
});
    await act(async () =>
{
 release(); expect(await refresh).toBe(false); await retry; await signIn;
});
    expect(logoutCalls).toBe(1);
    expect(captured.user?.displayName).toBe("B");
    expect(readAccessToken()?.token).toBe("b");
    expect(captured.logoutWarning).toBe(false);
    expect(captured.retryPending).toBe(false);
    await act(async () =>
{
 await captured.retrySignOut();
});
    expect(logoutCalls).toBe(1);
    endSession();
});

test("latest provider signIn wins and clears failed logout retry", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    endSession();
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
    let loginCalls = 0;
    let logoutCalls = 0;
    server.use(
        mockHttp.post("http://localhost/api/v1/auth/login", async () =>
        {
            loginCalls += 1;
            if (loginCalls === 2)
{
 entered(); await gate; return HttpResponse.json({ accessToken: "old", user: identity });
}
            return HttpResponse.json({ accessToken: loginCalls === 1 ? "a" : "b", user: loginCalls === 1 ? identity : identityB });
        }),
        mockHttp.post("http://localhost/api/v1/auth/logout", () =>
{
 logoutCalls += 1; return new HttpResponse(null, { status: 503 });
}),
    );
    renderSession();
    await act(async () =>
{
 await captured.signIn(credentials); await captured.signOut();
});
    expect(captured.logoutWarning).toBe(true);
    let first!: Promise<unknown>;
    act(() =>
{
 first = captured.signIn(credentials).catch((error: unknown) => error);
});
    await started;
    let second!: Promise<void>;
    act(() =>
{
 second = captured.signIn({ ...credentials, email: "b@example.test" });
});
    await act(async () =>
{
 release(); expect(await first).toBeInstanceOf(Error); await second;
});
    expect(captured.user?.displayName).toBe("B");
    expect(readAccessToken()?.token).toBe("b");
    expect(captured.logoutWarning).toBe(false);
    await act(async () =>
{
 await captured.retrySignOut();
});
    expect(logoutCalls).toBe(1);
    endSession();
});


test("bootstrap and protected 401 share refresh and accept identity", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    beginSession("stale");
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
    let refreshCalls = 0;
    let privateCalls = 0;
    server.use(
        mockHttp.post("http://localhost/api/v1/auth/refresh", async () =>
{
 refreshCalls += 1; entered(); await gate; return HttpResponse.json({ accessToken: "fresh" });
}),
        mockHttp.get("http://localhost/api/v1/auth/me", () => HttpResponse.json(identity)),
        mockHttp.get("http://localhost/api/private", ({ request }) =>
{
 privateCalls += 1; return request.headers.get("authorization") === "Bearer fresh" ? HttpResponse.json({ ok: true }) : new HttpResponse(null, { status: 401 });
}),
    );
    let handled!: () => void;
    const handled401 = new Promise<void>((resolve) =>
{
 handled = resolve;
});
    const originalFetch = globalThis.fetch;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) =>
    {
        const response = await originalFetch(input, init);
        if (String(input).endsWith("/private") && response.status === 401)
        {
            Object.defineProperty(response, "ok", { get: () =>
{
 handled(); return false;
} });
        }
        return response;
    });
    try
    {
        renderSession("/dashboard");
        await started;
        const pending = http("/private");
        await handled401;
        expect(refreshCalls).toBe(1);
        expect(readAccessToken()?.token).toBe("stale");
        await act(async () =>
{
 release(); await pending;
});
        await waitFor(() => expect(captured.user?.displayName).toBe("Test User"));
        expect(refreshCalls).toBe(1);
        expect(privateCalls).toBe(2);
        expect(screen.getByText("private:0")).toBeInTheDocument();
    }
    finally
{
 spy.mockRestore(); endSession();
}
});

test.each(["success", "failure"])("obsolete bootstrap /me %s cannot replace B", async (result) =>
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
    server.use(
        mockHttp.post("http://localhost/api/v1/auth/refresh", () => HttpResponse.json({ accessToken: "refreshed-a" })),
        mockHttp.get("http://localhost/api/v1/auth/me", async () =>
{
 entered(); await gate; return result === "success" ? HttpResponse.json(identity) : new HttpResponse(null, { status: 503 });
}),
        mockHttp.post("http://localhost/api/v1/auth/login", () => HttpResponse.json({ accessToken: "b", user: identityB })),
    );
    renderSession("/dashboard");
    await started;
    await act(async () =>
{
 await captured.signIn({ ...credentials, email: "b@example.test" });
});
    const generation = currentGeneration();
    await act(async () =>
{
 release();
});
    expect(captured.user?.displayName).toBe("B");
    expect(readAccessToken()).toEqual({ token: "b", generation });
    expect(currentGeneration()).toBe(generation);
    endSession();
});

test("role removal remounts private state and cancels old response; reordering preserves both", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    endSession();
    const both = { ...identity, roles: ["REQUESTER", "REVIEWER"] };
    let nextIdentity = { ...both, roles: ["REVIEWER", "REQUESTER"] };
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
    server.use(
        mockHttp.post("http://localhost/api/v1/auth/refresh", () => HttpResponse.json({ accessToken: "a" })),
        mockHttp.get("http://localhost/api/v1/auth/me", () => HttpResponse.json(nextIdentity)),
    );
    nextIdentity = both;
    renderSession("/dashboard");
    await screen.findByText("private:0");
    await userEvent.click(screen.getByText("private:0"));
    const initialGeneration = currentGeneration();
    nextIdentity = { ...both, roles: ["REVIEWER", "REQUESTER"] };
    await act(async () =>
{
 await captured.reloadIdentity();
});
    expect(currentGeneration()).toBe(initialGeneration);
    expect(screen.getByText("private:1")).toBeInTheDocument();
    const originalFetch = globalThis.fetch;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) =>
    {
        if (String(input).endsWith("/private")) return Promise.resolve({ ok: true, status: 200, text: () =>
{
 entered(); return body;
} } as Response);
        return originalFetch(input, init);
    });
    try
    {
        const pending = http("/private").catch((error: unknown) => error);
        await started;
        nextIdentity = { ...both, roles: ["REQUESTER"] };
        await act(async () =>
{
 await captured.reloadIdentity();
});
        expect(currentGeneration()).not.toBe(initialGeneration);
        expect(captured.user?.roles).toEqual(["REQUESTER"]);
        expect(readAccessToken()).toEqual({ token: "a", generation: currentGeneration() });
        expect(screen.getByText("private:0")).toBeInTheDocument();
        release("{}");
        expect(await pending).toBeInstanceOf(Error);
    }
    finally
{
 spy.mockRestore(); endSession();
}
});

test.each(["success", "failure"])("obsolete reload %s cannot replace or clear B", async (result) =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    endSession();
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
    let loginCalls = 0;
    server.use(
        mockHttp.post("http://localhost/api/v1/auth/login", () =>
{
 loginCalls += 1; return HttpResponse.json({ accessToken: loginCalls === 1 ? "a" : "b", user: loginCalls === 1 ? identity : identityB });
}),
        mockHttp.get("http://localhost/api/v1/auth/me", async () =>
{
 entered(); await gate; return result === "success" ? HttpResponse.json(identity) : new HttpResponse(null, { status: 503 });
}),
    );
    renderSession();
    await act(async () =>
{
 await captured.signIn(credentials);
});
    const reload = captured.reloadIdentity();
    await started;
    await act(async () =>
{
 await captured.signIn({ ...credentials, email: "b@example.test" });
});
    const generation = currentGeneration();
    await act(async () =>
{
 release(); await reload;
});
    expect(captured.user?.displayName).toBe("B");
    expect(readAccessToken()).toEqual({ token: "b", generation });
    expect(currentGeneration()).toBe(generation);
    endSession();
});

test.each([
    ["empty", "", "", true, true],
    ["invalid email", "invalid", "password", true, false],
    ["empty password", "test@example.test", "", false, true],
])("real session form rejects %s before transport", async (_name, emailValue, passwordValue, emailInvalid, passwordInvalid) =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    endSession();
    let calls = 0;
    server.use(mockHttp.post("http://localhost/api/v1/auth/login", () =>
    {
        calls += 1;
        return HttpResponse.json({ accessToken: "a", user: identity });
    }));
    function Form()
    {
        const session = useSession();
        return <><span>{session.status}:{session.user?.displayName}</span><LoginForm onSubmit={session.signIn} /></>;
    }
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/auth/login"]}><SessionProvider><Form /></SessionProvider></MemoryRouter>);
    const spy = vi.spyOn(globalThis, "fetch");
    try
    {
        const email = screen.getByLabelText("Email");
        const password = screen.getByLabelText("Password");
        if (emailValue) await user.type(email, emailValue);
        if (passwordValue) await user.type(password, passwordValue);
        await user.click(screen.getByRole("button", { name: "Sign in" }));
        expect(spy).not.toHaveBeenCalled();
        expect(calls).toBe(0);
        expect(readAccessToken()).toBeNull();
        expect(screen.queryByText("authenticated:Test User")).not.toBeInTheDocument();
        for (const [field, invalid, message] of [[email, emailInvalid, "Enter a valid email address."], [password, passwordInvalid, "Enter a password."]] as const)
        {
            if (invalid)
            {
                expect(field).toHaveAttribute("aria-invalid", "true");
                const error = document.getElementById(field.getAttribute("aria-describedby")!);
                expect(error).toBeVisible();
                expect(error?.textContent).toBe(message);
            }
            else
            {
                expect(field).not.toHaveAttribute("aria-invalid");
                expect(field).not.toHaveAttribute("aria-describedby");
            }
        }
        expect(emailInvalid ? email : password).toHaveFocus();
        expect(email).toHaveValue(emailValue);
        expect(password).toHaveValue(passwordValue);
        expect(screen.queryByText(/could not reach/i)).not.toBeInTheDocument();
        await user.clear(email);
        await user.type(email, "test@example.test");
        if (!passwordValue) await user.type(password, "password");
        await user.click(screen.getByRole("button", { name: "Sign in" }));
        await screen.findByText("authenticated:Test User");
        expect(calls).toBe(1);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(readAccessToken()?.token).toBe("a");
    }
    finally
    {
        spy.mockRestore();
        endSession();
    }
});
