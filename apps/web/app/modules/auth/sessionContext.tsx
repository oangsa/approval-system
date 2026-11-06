import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import type { LoginRequest, UserSummary } from "@workflow/contracts";
import { bootstrapSession, currentUser, login as loginService, logout as logoutService, retryLogout } from "~/services/authService";
import { abortFailure } from "~/api/http";
import { currentGeneration, endSession, readAccessToken, subscribeInvalidation, writeAccessToken } from "~/api/tokenStore";

export type SessionStatus = "idle" | "loading" | "authenticated" | "anonymous";
function needsSession(pathname: string): boolean
{
 return pathname.startsWith("/dashboard") || pathname.startsWith("/settings");
}
export interface ISessionContext
{
    status: SessionStatus;
    user: UserSummary | null;
    generation: number;
    logoutWarning: boolean;
    retryPending: boolean;
    retrySignOut(): Promise<void>;
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
    const [generation, setGeneration] = useState(currentGeneration);
    const [logoutWarning, setLogoutWarning] = useState(false);
    const [retryPending, setRetryPending] = useState(false);
    const retry = useRef<{ token: string | null; generation: number } | null>(null);
    const userRef = useRef<UserSummary | null>(null);
    const started = useRef(false);
    const required = needsSession(location.pathname);
    useEffect(() => subscribeInvalidation(() =>
    {
        started.current = true;
        userRef.current = null;
        setUser(null);
        setStatus("anonymous");
        setGeneration(currentGeneration());
    }), []);
    useEffect(() =>
    {
        if (!required || started.current || user !== null) return;
        started.current = true;
        const owner = currentGeneration();
        setStatus("loading");
        void bootstrapSession(owner).then((identity) =>
        {
            if (owner !== currentGeneration()) return;
            userRef.current = identity;
            setUser(identity);
            setGeneration(owner);
            setStatus(identity ? "authenticated" : "anonymous");
        });
    }, [required, user]);
    const signIn = useCallback(async (credentials: LoginRequest) =>
    {
        retry.current = null;
        setLogoutWarning(false);
        endSession();
        const owner = currentGeneration();
        const identity = await loginService(credentials, owner);
        if (owner !== currentGeneration()) throw abortFailure();
        userRef.current = identity;
        setUser(identity);
        setGeneration(owner);
        setStatus("authenticated");
    }, []);
    const signOut = useCallback(async () =>
    {
        const token = readAccessToken()?.token ?? null;
        const operation = logoutService();
        const owner = currentGeneration();
        try
{
 await operation;
}
        catch
        {
            if (owner !== currentGeneration()) return;
            retry.current = { token, generation: owner };
            setLogoutWarning(true);
        }
    }, []);
    const retrySignOut = useCallback(async () =>
    {
        const saved = retry.current;
        if (!saved || saved.generation !== currentGeneration() || retryPending) return;
        setRetryPending(true);
        try
        {
            await retryLogout(saved.token, saved.generation);
            if (retry.current === saved && saved.generation === currentGeneration())
            {
                retry.current = null;
                setLogoutWarning(false);
            }
        }
        catch
{ /* Retain warning and credential for another retry. */ }
        finally
{
 setRetryPending(false);
}
    }, [retryPending]);
    const reloadIdentity = useCallback(async () =>
    {
        const owner = currentGeneration();
        try
        {
            const identity = await currentUser(owner);
            if (owner !== currentGeneration()) return;
            const previous = userRef.current;
            const sameIdentity = previous !== null && JSON.stringify({ ...identity, roles: [...identity.roles].sort() }) === JSON.stringify({ ...previous, roles: [...previous.roles].sort() });
            if (!sameIdentity)
            {
                const token = readAccessToken()?.token;
                endSession(owner);
                if (token) writeAccessToken(token, currentGeneration());
            }
            userRef.current = identity;
            setUser(identity);
            setGeneration(currentGeneration());
            setStatus("authenticated");
        }
        catch
{ /* Transport invalidates terminal authentication failures. */ }
    }, []);
    const value = useMemo<ISessionContext>(() => ({ status, user, generation, logoutWarning, retryPending, retrySignOut, signIn, signOut, reloadIdentity }), [status, user, generation, logoutWarning, retryPending, retrySignOut, signIn, signOut, reloadIdentity]);
    return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession(): ISessionContext
{
    const context = useContext(SessionContext);
    if (!context) throw new Error("useSession must be used inside SessionProvider");
    return context;
}
