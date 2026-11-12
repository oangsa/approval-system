import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { ClipboardCheck, Files, Workflow, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, X } from "lucide-react";
import type { UserRole } from "@workflow/contracts";
import { Button } from "~/components/ui/button";
import { useSession } from "~/modules/auth/sessionContext";
import { navigationItems, visibleNavigation } from "~/modules/shell/navigation";
import { cn } from "~/lib/utils";

const itemIcons: Record<string, typeof LayoutDashboard> = { "/requests": Files, "/reviews": ClipboardCheck, "/dashboard": LayoutDashboard, "/settings": Settings };
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
    const { pathname } = useLocation();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const drawerTrigger = useRef<HTMLButtonElement>(null);
    const drawerPanel = useRef<HTMLDialogElement>(null);
    const accountTrigger = useRef<HTMLButtonElement>(null);
    const accountPanel = useRef<HTMLDivElement>(null);
    const items = user ? visibleNavigation(navigationItems, user.roles) : [];

    const pageTitle = pathname === "/requests/new" ? "New request" : items.find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))?.label ?? "Workspace";

    useEffect(() =>
    {
        if (!drawerOpen) return;
        const panel = drawerPanel.current;
        panel?.showModal();
        panel?.querySelector<HTMLElement>("a")?.focus();
        function onResize()
        {
            if (window.innerWidth >= 768) setDrawerOpen(false);
        }
        window.addEventListener("resize", onResize);
        return () =>
        {
            window.removeEventListener("resize", onResize);
            panel?.close();
            drawerTrigger.current?.focus();
        };
    }, [drawerOpen]);
    useEffect(() =>
    {
        if (!accountOpen) return;
        function onKeyDown(event: globalThis.KeyboardEvent)
        {
            if (event.key === "Escape")
            {
                setAccountOpen(false);
                accountTrigger.current?.focus();
            }
        }
        function onPointerDown(event: PointerEvent)
        {
            if (!accountPanel.current?.contains(event.target as Node) && !accountTrigger.current?.contains(event.target as Node))
            {
                setAccountOpen(false);
                accountTrigger.current?.focus();
            }
        }
        document.addEventListener("keydown", onKeyDown);
        document.addEventListener("pointerdown", onPointerDown);
        return () =>
        {
            document.removeEventListener("keydown", onKeyDown);
            document.removeEventListener("pointerdown", onPointerDown);
        };
    }, [accountOpen]);
    function trapTab(event: KeyboardEvent<HTMLDialogElement>)
    {
        if (event.key !== "Tab") return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first)
        {
            event.preventDefault();
            last?.focus();
        }
        else if (!event.shiftKey && document.activeElement === last)
        {
            event.preventDefault();
            first?.focus();
        }
    }
    async function handleSignOut(): Promise<void>
    {
        setAccountOpen(false);
        await signOut();
        navigate("/auth/login", { replace: true });
    }
    function renderLink(item: { to: string; label: string }, rail = false)
    {
        const Icon = itemIcons[item.to] ?? LayoutDashboard;
        return (
            <div key={item.to} className="group relative"><NavLink to={item.to} onClick={() => setDrawerOpen(false)} aria-label={item.label} title={rail ? item.label : undefined}
                className={({ isActive }) => cn("flex items-center min-h-11 gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none", isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground")}>
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className={rail ? "sr-only" : undefined}>{item.label}</span>
            </NavLink>{rail && <span role="tooltip" className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md group-hover:block group-focus-within:block">{item.label}</span>}</div>
        );
    }
    return (
        <div className="flex min-h-svh flex-col">
            <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground">Skip to content</a>
            <header className="sticky top-0 z-30 flex h-16 min-w-0 items-center gap-3 border-b bg-background px-4 sm:px-6">
                <Button ref={drawerTrigger} type="button" className="p-2 text-muted-foreground hover:bg-secondary md:hidden" aria-label="Open navigation menu" aria-expanded={drawerOpen} aria-controls="app-drawer" onClick={() => setDrawerOpen(true)}><Menu aria-hidden="true" className="h-5 w-5" /></Button>
                <Workflow aria-hidden="true" className="hidden size-5 shrink-0 sm:block" /><div className="min-w-0"><p className="truncate text-xs text-muted-foreground">Workflow and Approval System</p><p className="truncate text-sm font-semibold">{pageTitle}</p></div>
                <div className="ml-auto flex min-w-0 items-center gap-2">
                    <Button ref={accountTrigger} type="button" className="max-w-36 truncate px-3 py-2 text-muted-foreground hover:bg-secondary sm:max-w-56" aria-expanded={accountOpen} aria-controls="account-details" onClick={() => setAccountOpen((open) => !open)}>{user?.displayName ?? "Account"}</Button>
                    {accountOpen && user && <div ref={accountPanel} id="account-details" role="region" aria-label="Account details" className="absolute right-4 top-16 w-56 rounded-md border bg-popover p-2 shadow-sm">
                        <p className="truncate px-2 py-1 text-sm font-medium">{user.displayName}</p><p className="truncate px-2 pb-2 text-xs text-muted-foreground">{user.email}</p><p className="px-2 pb-2 text-xs text-muted-foreground">{roleLabel(user.roles)}</p>
                        <Button type="button" className="flex w-full items-center gap-2 px-2 py-1.5 hover:bg-secondary" onClick={() => void handleSignOut()}><LogOut aria-hidden="true" className="h-4 w-4" />Sign out</Button>
                    </div>}
                </div>
            </header>
            <div className="flex flex-1">
                <nav id="desktop-navigation" aria-label="Primary" className={cn("sticky top-16 hidden h-[calc(100svh-4rem)] shrink-0 flex-col border-r bg-card p-3 transition-[width] duration-150 motion-reduce:transition-none md:flex", collapsed ? "w-16" : "w-60")}>
                    <Button type="button" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed} aria-controls="desktop-navigation" className="mb-2 self-end p-2 hover:bg-secondary" onClick={() => setCollapsed((value) => !value)}>{collapsed ? <PanelLeftOpen aria-hidden="true" className="h-4 w-4" /> : <PanelLeftClose aria-hidden="true" className="h-4 w-4" />}</Button>
                    <p className={cn("mb-3 px-3 text-xs font-medium text-muted-foreground", collapsed && "sr-only")}>Workspace</p>
                    <ul className="min-h-0 flex-1 space-y-1">{items.filter((item) => item.to !== "/settings").map((item) => <li key={item.to}>{renderLink(item, collapsed)}</li>)}</ul>
                    <div className="mt-4 space-y-3 border-t pt-3">{items.filter((item) => item.to === "/settings").map((item) => renderLink(item, collapsed))}{!collapsed && <div className="px-3 pb-1"><p className="truncate text-sm font-medium">{user?.displayName}</p><p className="mt-1 text-xs text-muted-foreground">{user?.roles.map((role) => role === "REQUESTER" ? "Requester" : role === "REVIEWER" ? "Reviewer" : "Administrator").join(" · ")}</p></div>}</div>
                </nav>
                {drawerOpen && <dialog ref={drawerPanel} id="app-drawer" aria-modal="true" aria-label="Navigation menu" onCancel={(event) =>
                {
                    event.preventDefault();
                    setDrawerOpen(false);
                }} onKeyDown={trapTab} onClick={(event) =>
                {
                    if (event.target === event.currentTarget) setDrawerOpen(false);
                }} className="fixed inset-y-0 left-0 right-auto m-0 h-full w-64 max-w-none overflow-y-auto overscroll-contain bg-background p-4 shadow-lg backdrop:bg-foreground/40 motion-safe:animate-in motion-safe:slide-in-from-left-4 motion-safe:duration-150 md:hidden">
                    <div className="mb-4 flex items-center justify-between"><span className="text-sm font-semibold">Menu</span><Button type="button" aria-label="Close navigation menu" className="p-2 hover:bg-secondary" onClick={() => setDrawerOpen(false)}><X aria-hidden="true" className="h-5 w-5" /></Button></div>
                    <ul className="space-y-1">{items.map((item) => <li key={item.to}>{renderLink(item)}</li>)}</ul>
                </dialog>}
                <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-5 focus-visible:outline-2 focus-visible:outline-ring sm:p-6 lg:p-8">{children}</main>
            </div>
        </div>
    );
}
