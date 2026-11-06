import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { UserSummary } from "@workflow/contracts";
import { AppShell } from "../../app/modules/shell/AppShell";
import { navigationItems, visibleNavigation } from "../../app/modules/shell/navigation";

const showDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeAll(() =>
{
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function (this: HTMLDialogElement)
    {
        this.open = true;
    } });
    Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: function (this: HTMLDialogElement)
    {
        this.open = false;
    } });
});
afterAll(() =>
{
    if (showDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "showModal", showDescriptor);
    else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
    if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "close", closeDescriptor);
    else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});
beforeEach(() => signOut.mockClear());

const signOut = vi.fn().mockResolvedValue(undefined);

vi.mock("../../app/modules/auth/sessionContext", () => ({
    useSession: () => ({ status: "authenticated", user: currentUser, signIn: vi.fn(), signOut, reloadIdentity: vi.fn() }),
}));

let currentUser: UserSummary | null = null;

function identity(overrides: Partial<UserSummary> = {}): UserSummary
{
    return {
        id: "3f1a2b3c-4d5e-4f70-8192-a3b4c5d6e7f8",
        displayName: "Ada Lovelace",
        email: "ada@example.com",
        roles: ["REQUESTER"],
        isActive: true,
        department: null,
        ...overrides,
    };
}

function renderShell(): void
{
    render(
        <MemoryRouter initialEntries={["/dashboard"]}>
            <AppShell>
                <p>Page content</p>
            </AppShell>
        </MemoryRouter>,
    );
}

test("navigation items are filtered by the current role union", () =>
{
    expect(visibleNavigation(navigationItems, ["REQUESTER"]).map((item) => item.to)).toEqual(["/dashboard", "/settings"]);
    expect(visibleNavigation([], ["ADMINISTRATOR"])).toEqual([]);
});

test("the shell renders the current account and only routes that ship in this feature", () =>
{
    currentUser = identity();
    renderShell();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Dashboard/ })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: /Settings/ })).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("link", { name: /Requests/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Approvals/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ada Lovelace" })).toBeInTheDocument();
});

test("the account menu exposes identity details and signs out", async () =>
{
    currentUser = identity({ roles: ["REQUESTER", "REVIEWER"] });
    const user = userEvent.setup();
    renderShell();

    await user.click(screen.getByRole("button", { name: "Ada Lovelace" }));
    const menu = screen.getByRole("region", { name: "Account details" });
    expect(menu).toHaveTextContent("ada@example.com");
    expect(menu).toHaveTextContent("REQUESTER, REVIEWER");

    await user.click(screen.getByRole("button", { name: /Sign out/ }));
    await waitFor(() => expect(signOut).toHaveBeenCalledTimes(1));
});

test("the mobile drawer is a focus-managed dialog that closes on Escape", async () =>
{
    currentUser = identity();
    const user = userEvent.setup();
    renderShell();

    const trigger = screen.getByRole("button", { name: "Open navigation menu" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "Navigation menu" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));

    act(() =>
    {
        dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
});
test("desktop navigation collapses to named links", async () =>
{
    currentUser = identity();
    const user = userEvent.setup();
    renderShell();
    const toggle = screen.getByRole("button", { name: "Collapse navigation" });
    await user.click(toggle);
    expect(screen.getByRole("button", { name: "Expand navigation" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
});

test.each<[UserSummary["roles"]]>([
    [["REQUESTER"]],
    [["REVIEWER"]],
    [["ADMINISTRATOR"]],
    [["REQUESTER", "REVIEWER"]],
])("shipped links remain available for %s", (roles) =>
{
    currentUser = identity({ roles: [...roles] });
    renderShell();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
});

test("desktop collapse preserves navigation semantics", async () =>
{
    currentUser = identity();
    const user = userEvent.setup();
    renderShell();
    const nav = screen.getByRole("navigation", { name: "Primary" });
    const toggle = screen.getByRole("button", { name: "Collapse navigation" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toBe(nav);
    for (let i = 0; i < 2; i += 1)
    {
        expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/dashboard");
        expect(within(nav).getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page");
        expect(within(nav).getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
        await user.click(screen.getByRole("button", { name: i === 0 ? "Collapse navigation" : "Expand navigation" }));
    }
    expect(toggle).toHaveAttribute("aria-expanded", "true");
});

test("disclosure closes on Escape and outside pointer, but not inside", async () =>
{
    currentUser = identity();
    const user = userEvent.setup();
    renderShell();
    const trigger = screen.getByRole("button", { name: "Ada Lovelace" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-haspopup", "menu");
    await user.click(trigger);
    const region = screen.getByRole("region", { name: "Account details" });
    expect(document.getElementById(trigger.getAttribute("aria-controls")!)).toBe(region);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem")).not.toBeInTheDocument();
    await user.click(within(region).getByText("ada@example.com"));
    expect(region).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("region", { name: "Account details" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    fireEvent.pointerDown(screen.getByText("Page content"));
    expect(screen.queryByRole("region", { name: "Account details" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
});

test("drawer loops focus repeatedly and inside clicks remain open", async () =>
{
    currentUser = identity();
    const user = userEvent.setup();
    const show = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    renderShell();
    const trigger = screen.getByRole("button", { name: "Open navigation menu" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Navigation menu" });
    expect(show).toHaveBeenCalledTimes(1);
    const firstLink = within(dialog).getByRole("link", { name: "Dashboard" });
    const lastLink = within(dialog).getByRole("link", { name: "Settings" });
    const close = within(dialog).getByRole("button", { name: "Close navigation menu" });
    expect(firstLink).toHaveFocus();
    await user.click(within(dialog).getByText("Menu"));
    expect(dialog).toBeInTheDocument();
    lastLink.focus();
    await user.tab();
    expect(close).toHaveFocus();
    await user.tab({ shift: true });
    expect(lastLink).toHaveFocus();
    for (let i = 0; i < 5; i += 1)
    {
        await user.tab();
        expect(dialog.contains(document.activeElement)).toBe(true);
    }
    for (let i = 0; i < 5; i += 1)
    {
        await user.tab({ shift: true });
        expect(dialog.contains(document.activeElement)).toBe(true);
    }
    await user.click(close);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.tab();
    expect(trigger).not.toHaveFocus();
    show.mockRestore();
});

test.each(["backdrop", "navigation"])("drawer closes on %s", async (method) =>
{
    currentUser = identity();
    const user = userEvent.setup();
    renderShell();
    const trigger = screen.getByRole("button", { name: "Open navigation menu" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog");
    if (method === "backdrop") await user.click(dialog);
    else await user.click(within(dialog).getByRole("link", { name: "Settings" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
});

test("drawer closes at desktop breakpoint and unmounts safely", async () =>
{
    currentUser = identity();
    const original = window.innerWidth;
    const user = userEvent.setup();
    try
    {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 767 });
        const view = render(<MemoryRouter><AppShell>Page content</AppShell></MemoryRouter>);
        const trigger = screen.getByRole("button", { name: "Open navigation menu" });
        await user.click(trigger);
        act(() =>
        {
            window.dispatchEvent(new Event("resize"));
        });
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        Object.defineProperty(window, "innerWidth", { configurable: true, value: 768 });
        act(() =>
        {
            window.dispatchEvent(new Event("resize"));
        });
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
        expect(trigger).toHaveFocus();
        await user.click(trigger);
        view.unmount();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }
    finally
    {
        Object.defineProperty(window, "innerWidth", { configurable: true, value: original });
    }
});
