import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import type { LoginRequest, UserSummary } from "@workflow/contracts";
import { bootstrapSession, currentUser, login as loginService, logout as logoutService } from "~/services/authService";
import { endSession } from "~/api/tokenStore";

export type SessionStatus = "idle" | "loading" | "authenticated" | "anonymous";

/** Only these paths need an identity; public pages never trigger an auth round trip. */
function needsSession(pathname: string): boolean
{
    return pathname.startsWith("/dashboard") || pathname.startsWith("/settings");
}

export interface ISessionContext
{
    status: SessionStatus;
    user: UserSummary | null;
    signIn(credentials: LoginRequest): Promise<void>;
    signOut(): Promise<void>;
    reloadIdentity(): Promise<void>;
}

const SessionContext = createContext<ISessionContext | null>(null);

export function SessionProvider({ children }: { children: ReactNode })
{
    const location = useLocation();
    const [status, setStatus] = useState<SessionStatus>("idle");
    const [user, setUser] = useState<UserSummary | null>(null);
    const started = useRef(false);
    const required = needsSession(location.pathname);

    useEffect(() =>
    {
        // Bootstrap only when there is no identity yet: a fresh document load on a
        // protected route, never right after a successful in-app login.
        if (!required || started.current || user !== null) return;
        started.current = true;
        setStatus("loading");
        void bootstrapSession().then((identity) =>
        {
            setUser(identity);
            setStatus(identity ? "authenticated" : "anonymous");
        });
    }, [required, user]);

    const signIn = useCallback(async (credentials: LoginRequest) =>
    {
        const identity = await loginService(credentials);
        setUser(identity);
        setStatus("authenticated");
    }, []);

    const signOut = useCallback(async () =>
    {
        await logoutService();
        setUser(null);
        setStatus("anonymous");
    }, []);

    const reloadIdentity = useCallback(async () =>
    {
        try
        {
            const identity = await currentUser();
            setUser(identity);
            setStatus("authenticated");
        }
        catch
        {
            endSession();
            setUser(null);
            setStatus("anonymous");
        }
    }, []);

    const value = useMemo<ISessionContext>(() => ({ status, user, signIn, signOut, reloadIdentity }), [status, user, signIn, signOut, reloadIdentity]);
    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): ISessionContext
{
    const context = useContext(SessionContext);
    if (!context) throw new Error("useSession must be used inside SessionProvider");
    return context;
}