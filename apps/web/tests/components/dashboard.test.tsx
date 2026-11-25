import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import type { DashboardDTO, UserRole } from "@workflow/contracts";
import { dashboardApi } from "../../app/api/dashboard";
import { DashboardPage } from "../../app/modules/dashboard/DashboardPage";

const session = vi.hoisted(() => ({ generation: 0, user: { id: "owner", roles: ["ADMINISTRATOR"] as UserRole[] } }));
vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => session }));
afterEach(() =>
{
 vi.restoreAllMocks(); session.generation = 0; session.user.id = "owner"; session.user.roles = ["ADMINISTRATOR"];
});
const admin: DashboardDTO = { roleContext: ["ADMINISTRATOR"], generatedAt: "2026-11-01T00:00:00Z", administration: { statusCounts: [{ dimension: "STATUS", key: "PENDING", label: "Pending", count: 3 }], configuration: { enabledPublishedTypes: 1, activePolicyVersions: 2, activeAssignmentRules: 3 }, escalation: { actionableTasks: 4, overdueTasks: 1 } } };

test("administrator receives counts without private request links", async () =>
{
    vi.spyOn(dashboardApi, "read").mockResolvedValue(admin);
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(await screen.findByText("Enabled published types")).toBeVisible();
    expect(screen.getByText("Pending")).toBeVisible();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
test("stale session responses cannot display after an account switch", async () =>
{
    const pending: { signal?: AbortSignal; resolve(value: DashboardDTO): void }[] = [];
    vi.spyOn(dashboardApi, "read").mockImplementation((signal) => new Promise((resolve) => pending.push({ signal, resolve })));
    const view = render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await waitFor(() => expect(pending).toHaveLength(1));
    session.generation = 1; session.user.id = "other";
    view.rerender(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0]?.signal?.aborted).toBe(true);
    await act(async () => pending[0]?.resolve(admin));
    expect(screen.queryByText("Enabled published types")).not.toBeInTheDocument();
    await act(async () => pending[1]?.resolve(admin));
    expect(screen.getByText("Enabled published types")).toBeVisible();
});

test("role changes hide previous counts while the new response is pending", async () =>
{
    const pending: { resolve(value: DashboardDTO): void }[] = [];
    vi.spyOn(dashboardApi, "read").mockImplementation(() => new Promise((resolve) => pending.push({ resolve })));
    const view = render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0]?.resolve(admin));
    expect(screen.getByText("Enabled published types")).toBeVisible();
    session.user.roles = ["REQUESTER"];
    view.rerender(<MemoryRouter><DashboardPage /></MemoryRouter>);
    expect(screen.queryByText("Enabled published types")).not.toBeInTheDocument();
    await waitFor(() => expect(pending).toHaveLength(2));
});
