import { Navigate, Outlet, useLocation } from "react-router";
import { useSession } from "~/modules/auth/sessionContext";
import { AppShell } from "~/modules/shell/AppShell";

/** Client-side guard: authenticated actors get the shell, anonymous visitors return to login with a return path. */
export function ProtectedLayout()
{
    const { status, generation } = useSession();
    const location = useLocation();

    if (status === "loading" || status === "idle")
    {
        return (
            <main className="flex min-h-screen items-center justify-center" aria-busy="true">
                <p className="text-sm text-muted-foreground">Loading…</p>
            </main>
        );
    }

    if (status === "anonymous")
    {
        const from = `${location.pathname}${location.search}`;
        return <Navigate to={`/auth/login?from=${encodeURIComponent(from)}`} replace />;
    }

    return (
        <AppShell key={generation}>
            <Outlet />
        </AppShell>
    );
}