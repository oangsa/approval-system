import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, expect, test, vi } from "vitest";
import { reportingApi } from "../../app/api/reporting";
import { ReportsPage } from "../../app/modules/reports/ReportsPage";
const session = vi.hoisted(() => ({ generation: 0, user: { id: "owner", department: null } }));
vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => session }));
afterEach(() => vi.restoreAllMocks());
const pagination = { currentPage: 1, pageSize: 20, totalPages: 1, totalCount: 1, hasPrevious: false, hasNext: false };
test("renders server aggregates and filters to an authorized department", async () =>
{
    const search = vi.spyOn(reportingApi, "search").mockResolvedValue({ items: [{ dimension: "DEPARTMENT", key: "7bb91ef4-5982-405f-8bd5-61b5c3cf410b", label: "Finance", count: 3 }], pagination });
    render(<MemoryRouter initialEntries={["/reports?dimension=DEPARTMENT"]}><ReportsPage /></MemoryRouter>);
    expect(await screen.findByText("Finance")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Filter to this department" }));
    await waitFor(() => expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ search: [{ name: "departmentId", condition: "EQUAL", value: "7bb91ef4-5982-405f-8bd5-61b5c3cf410b" }] }), expect.any(AbortSignal), 0));
    expect(screen.getByText(/Selected department/)).toBeVisible();
});
test("shows request failure rather than empty data", async () =>
{
    vi.spyOn(reportingApi, "search").mockRejectedValue(new Error("failure"));
    render(<MemoryRouter><ReportsPage /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load reports.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
    expect(screen.queryByText("No report data available.")).not.toBeInTheDocument();
});
