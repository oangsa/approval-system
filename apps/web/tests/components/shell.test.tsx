import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router";
import type { UserSummary } from "@workflow/contracts";
import { AppShell } from "../../app/modules/shell/AppShell";
import { navigationItems, visibleNavigation } from "../../app/modules/shell/navigation";

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
        <MemoryRouter>
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
    const menu = screen.getByRole("menu");
    expect(menu).toHaveTextContent("ada@example.com");
    expect(menu).toHaveTextContent("REQUESTER, REVIEWER");

    await user.click(screen.getByRole("menuitem", { name: /Sign out/ }));
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

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
});