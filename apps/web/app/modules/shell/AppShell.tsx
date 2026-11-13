import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { ClipboardCheck, Files, ChevronDown, UserRound, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, X } from "lucide-react";
import type { UserRole } from "@workflow/contracts";
import { ActionButton } from "~/components/actions/ActionButton";
import { ProductIdentity } from "~/components/layout/ProductIdentity";
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
        if (!window.matchMedia) return;
        const desktop = window.matchMedia("(min-width: 1024px)");
        setCollapsed(!desktop.matches);
        const onChange = (event: MediaQueryListEvent) => setCollapsed(!event.matches);
        desktop.addEventListener("change", onChange);
        return () => desktop.removeEventListener("change", onChange);
    }, []);
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
                className={({ isActive }) => cn("flex items-center min-h-11 gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none", rail && "justify-center px-0", isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground")}>
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                <span className={rail ? "sr-only" : undefined}>{item.label}</span>
            </NavLink>{rail && <span role="tooltip" className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-md border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md group-hover:block group-focus-within:block">{item.label}</span>}</div>
        );
    }
    return (
        <div className="flex min-h-svh bg-muted/20">
            <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground">Skip to content</a>
            <nav id="desktop-navigation" aria-label="Primary" className={cn("sticky top-0 hidden h-svh shrink-0 flex-col border-r bg-background transition-[width] duration-150 motion-reduce:transition-none md:flex", collapsed ? "w-18" : "w-64")}>
                <div className={cn("flex h-16 shrink-0 items-center border-b px-5", collapsed && "justify-center px-0")}><ProductIdentity compact={collapsed} /></div>
                <div className="min-h-0 flex-1 px-3 py-6">
                    <p className={cn("mb-3 px-3 text-xs font-medium text-muted-foreground", collapsed && "sr-only")}>Workspace</p>
                    <ul className="space-y-1.5">{items.filter((item) => item.to !== "/settings").map((item) => <li key={item.to}>{renderLink(item, collapsed)}</li>)}</ul>
                </div>
                <div className="space-y-1.5 border-t p-3">
                    {items.filter((item) => item.to === "/settings").map((item) => renderLink(item, collapsed))}
                    <ActionButton type="button" variant="ghost" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed} aria-controls="desktop-navigation" className={cn("w-full justify-start gap-3 px-3", collapsed && "justify-center")} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <PanelLeftOpen aria-hidden="true" className="size-4" /> : <PanelLeftClose aria-hidden="true" className="size-4" />}<span className={collapsed ? "sr-only" : undefined}>Collapse sidebar</span></ActionButton>
                </div>
                <div className={cn("flex items-center gap-3 border-t px-5 py-4", collapsed && "justify-center px-0")}>
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted/60 text-muted-foreground"><UserRound aria-hidden="true" className="size-4" /></span>
                    <div className={collapsed ? "sr-only" : "min-w-0"}><p className="truncate text-sm font-medium">{user?.displayName}</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{user?.roles.map((role) => role === "REQUESTER" ? "Requester" : role === "REVIEWER" ? "Reviewer" : "Administrator").join(" · ")}</p></div>
                </div>
            </nav>
            <div className="flex min-w-0 flex-1 flex-col">
                <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background px-4 sm:px-6 lg:px-8">
                    <ActionButton ref={drawerTrigger} variant="ghost" size="icon" type="button" className="-ml-2 md:hidden" aria-label="Open navigation menu" aria-expanded={drawerOpen} aria-controls="app-drawer" onClick={() => setDrawerOpen(true)}><Menu aria-hidden="true" className="size-5" /></ActionButton>
                    <div className="min-w-0"><p className="text-xs text-muted-foreground">Workspace</p><p className="truncate text-sm font-medium">{pageTitle}</p></div>
                    <div className="relative ml-auto min-w-0">
                        <ActionButton ref={accountTrigger} variant="ghost" type="button" aria-label={user?.displayName ?? "Account"} className="max-w-36 gap-2 px-2 sm:max-w-64 sm:px-3" aria-expanded={accountOpen} aria-controls="account-details" onClick={() => setAccountOpen((open) => !open)}><UserRound aria-hidden="true" className="size-4 shrink-0" /><span className="truncate">{user?.displayName ?? "Account"}</span><ChevronDown aria-hidden="true" className="hidden size-3.5 shrink-0 sm:block" /></ActionButton>
                        {accountOpen && user && <div ref={accountPanel} id="account-details" role="region" aria-label="Account details" className="absolute right-0 top-full mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-lg border bg-popover p-2 text-popover-foreground shadow-md">
                            <div className="border-b px-3 py-2"><p className="truncate text-sm font-medium">{user.displayName}</p><p className="mt-1 truncate text-xs text-muted-foreground">{user.email}</p><p className="mt-1 text-xs text-muted-foreground">{roleLabel(user.roles)}</p></div>
                            <ActionButton variant="ghost" type="button" className="mt-1 w-full justify-start px-3" onClick={() => void handleSignOut()}><LogOut aria-hidden="true" className="size-4" />Sign out</ActionButton>
                        </div>}
                    </div>
                </header>
                {drawerOpen && <dialog ref={drawerPanel} id="app-drawer" aria-modal="true" aria-label="Navigation menu" onCancel={(event) =>
                {
                    event.preventDefault();
                    setDrawerOpen(false);
                }} onKeyDown={trapTab} onClick={(event) =>
                {
                    if (event.target === event.currentTarget) setDrawerOpen(false);
                }} className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-72 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain border-r bg-background p-4 text-foreground shadow-lg backdrop:bg-foreground/40 motion-safe:animate-in motion-safe:slide-in-from-left-4 motion-safe:duration-150 md:hidden">
                    <div className="mb-6 flex items-center justify-between gap-3 border-b pb-4"><ProductIdentity /><ActionButton variant="ghost" size="icon" type="button" aria-label="Close navigation menu" onClick={() => setDrawerOpen(false)}><X aria-hidden="true" className="size-5" /></ActionButton></div>
                    <p className="mb-3 px-3 text-xs font-medium text-muted-foreground">Menu</p>
                    <ul className="space-y-1.5">{items.map((item) => <li key={item.to}>{renderLink(item)}</li>)}</ul>
                </dialog>}
                <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 focus-visible:outline-2 focus-visible:outline-ring sm:px-6 lg:px-8 lg:py-8">{children}</main>
            </div>
        </div>
    );
}
