import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router";
import { LayoutDashboard, LogOut, Menu, Settings, X } from "lucide-react";
import type { UserRole } from "@workflow/contracts";
import { useSession } from "~/modules/auth/sessionContext";
import { navigationItems, visibleNavigation } from "~/modules/shell/navigation";
import { cn } from "~/lib/utils";

const itemIcons: Record<string, typeof LayoutDashboard> = { "/dashboard": LayoutDashboard, "/settings": Settings };

function roleLabel(roles: readonly UserRole[]): string
{
    return roles.join(", ");
}

interface IAppShellProps
{
    children: ReactNode;
}

export function AppShell({ children }: IAppShellProps)
{
    const { user, signOut } = useSession();
    const navigate = useNavigate();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const drawerTrigger = useRef<HTMLButtonElement>(null);
    const drawerPanel = useRef<HTMLDivElement>(null);
    const items = user ? visibleNavigation(navigationItems, user.roles) : [];

    useEffect(() =>
    {
        if (!drawerOpen) return;
        const panel = drawerPanel.current;
        (panel?.querySelector<HTMLElement>("a") ?? panel?.querySelector<HTMLElement>("button"))?.focus();
        function onKeyDown(event: KeyboardEvent)
        {
            if (event.key === "Escape") setDrawerOpen(false);
        }
        document.addEventListener("keydown", onKeyDown);
        return () =>
        {
            document.removeEventListener("keydown", onKeyDown);
            drawerTrigger.current?.focus();
        };
    }, [drawerOpen]);

    async function handleSignOut(): Promise<void>
    {
        setAccountOpen(false);
        await signOut();
        navigate("/auth/login", { replace: true });
    }

    function renderLink(item: { to: string; label: string })
    {
        const Icon = itemIcons[item.to] ?? LayoutDashboard;
        return (
            <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setDrawerOpen(false)}
                className={({ isActive }) => cn(
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
                )}
            >
                <Icon aria-hidden="true" className="h-4 w-4" />
                {item.label}
            </NavLink>
        );
    }

    return (
        <div className="flex min-h-screen flex-col">
            <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4">
                <button
                    ref={drawerTrigger}
                    type="button"
                    className="rounded-md p-2 text-muted-foreground hover:bg-secondary md:hidden"
                    aria-label="Open navigation menu"
                    aria-expanded={drawerOpen}
                    aria-controls="app-drawer"
                    onClick={() => setDrawerOpen(true)}
                >
                    <Menu aria-hidden="true" className="h-5 w-5" />
                </button>
                <span className="text-sm font-semibold">Workflow and Approval System</span>
                <div className="ml-auto flex items-center gap-2">
                    <button
                        type="button"
                        className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary"
                        aria-expanded={accountOpen}
                        aria-haspopup="menu"
                        onClick={() => setAccountOpen((open) => !open)}
                    >
                        {user?.displayName ?? "Account"}
                    </button>
                    {accountOpen && user && (
                        <div role="menu" className="absolute right-4 top-14 w-56 rounded-md border bg-popover p-2 shadow-sm">
                            <p className="truncate px-2 py-1 text-sm font-medium">{user.displayName}</p>
                            <p className="truncate px-2 pb-2 text-xs text-muted-foreground">{user.email}</p>
                            <p className="px-2 pb-2 text-xs text-muted-foreground">{roleLabel(user.roles)}</p>
                            <button
                                type="button"
                                role="menuitem"
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-secondary"
                                onClick={() =>
                                {
                                    setAccountOpen(false);
                                    void handleSignOut();
                                }}
                            >
                                <LogOut aria-hidden="true" className="h-4 w-4" />
                                Sign out
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <div className="flex flex-1">
                <nav aria-label="Primary" className="hidden w-56 shrink-0 border-r p-3 md:block">
                    <ul className="space-y-1">{items.map((item) => <li key={item.to}>{renderLink(item)}</li>)}</ul>
                </nav>

                {drawerOpen && (
                    <div className="fixed inset-0 z-40 md:hidden">
                        <button
                            type="button"
                            aria-label="Close navigation menu"
                            className="absolute inset-0 bg-black/50"
                            onClick={() => setDrawerOpen(false)}
                        />
                        <div
                            ref={drawerPanel}
                            id="app-drawer"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Navigation menu"
                            className="absolute inset-y-0 left-0 w-64 bg-background p-4 shadow-lg"
                        >
                            <div className="mb-4 flex items-center justify-between">
                                <span className="text-sm font-semibold">Menu</span>
                                <button type="button" aria-label="Close navigation menu" className="rounded-md p-2 hover:bg-secondary" onClick={() => setDrawerOpen(false)}>
                                    <X aria-hidden="true" className="h-5 w-5" />
                                </button>
                            </div>
                            <ul className="space-y-1">{items.map((item) => <li key={item.to}>{renderLink(item)}</li>)}</ul>
                        </div>
                    </div>
                )}

                <main className="flex-1 p-6">{children}</main>
            </div>
        </div>
    );
}