import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { LoginRequest, UserSummary } from "@workflow/contracts";
import { bootstrapSession, currentUser, login as loginService, logout as logoutService } from "~/services/authService";
import { endSession } from "~/api/tokenStore";

export type SessionStatus = "loading" | "authenticated" | "anonymous";

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
    const [status, setStatus] = useState<SessionStatus>("loading");
    const [user, setUser] = useState<UserSummary | null>(null);

    useEffect(() =>
    {
        let cancelled = false;
        void bootstrapSession().then((identity) =>
        {
            if (cancelled) return;
            setUser(identity);
            setStatus(identity ? "authenticated" : "anonymous");
        });
        return () =>
        {
            cancelled = true;
        };
    }, []);

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