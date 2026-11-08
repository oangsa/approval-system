import assert from "node:assert/strict";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import type { ApprovalTask, RequestDetail } from "@workflow/contracts";
import { ReviewQueuePage } from "../../app/modules/reviews/ReviewQueuePage";
import { searchApprovalTasks } from "../../app/services/approvalTaskService";
import { requestApi } from "../../app/api/requests";
import { ApiFailure } from "../../app/api/errors";

vi.mock("../../app/services/approvalTaskService", () => ({ searchApprovalTasks: vi.fn() }));
vi.mock("../../app/api/requests", () => ({ requestApi: { read: vi.fn() } }));
interface ICollectionProps
{
    items: ApprovalTask[];
    pagination: { currentPage: number; hasNext: boolean } | null;
    loading: boolean;
    error: string;
    columns: string[];
    loadingMessage: string;
    emptyMessage: string;
    onRetry?: () => void;
    onPageChange?: (pageNumber: number) => void;
    renderDesktopRow: (task: ApprovalTask) => import("react").ReactNode;
    renderMobileCard: (task: ApprovalTask) => import("react").ReactNode;
}
vi.mock("../../app/components/collections/RequestCollection", () => ({
    RequestCollection: ({ items, pagination, loading, error, emptyMessage, onRetry, onPageChange, renderDesktopRow }: ICollectionProps) =>
    {
        if (loading)
        {
            return <p role="status">Loading…</p>;
        }
        if (error)
        {
            return <div role="alert">{error}{onRetry && <button type="button" onClick={onRetry}>Retry</button>}</div>;
        }
        if (items.length === 0)
        {
            return <p>{emptyMessage}</p>;
        }
        return <table><tbody>{items.map((task) => <tr key={task.id}>{renderDesktopRow(task)}</tr>)}</tbody>{pagination?.hasNext && <tfoot><tr><td><button type="button" onClick={() => onPageChange?.(pagination.currentPage + 1)}>Next</button></td></tr></tfoot>}</table>;
    },
}));
const session = vi.hoisted(() => ({ status: "authenticated", user: { id: "a", roles: ["REVIEWER"] }, generation: 0 }));
vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => session }));
const id = "7bb91ef4-5982-405f-8bd5-61b5c3cf410b";
const task: ApprovalTask = { id, slotId: id, requestId: id, cycleId: id, revisionId: id, stageNumber: 1, assignedReviewer: { id, displayName: "Reviewer" }, status: "ACTIONABLE", dueAt: null, canCurrentUserDecide: true, version: 1 };
const page = { items: [task], pagination: { currentPage: 1, pageSize: 20, totalPages: 2, totalCount: 21, hasPrevious: false, hasNext: true } };
const stageFilter = { name: "stageNumber", condition: "EQUAL", value: 2 };
beforeEach(() =>
{
    vi.resetAllMocks();
    session.user.id = "a";
    session.generation = 0;
});
function show()
{
    return render(<MemoryRouter><ReviewQueuePage /></MemoryRouter>);
}
function deferred<T>()
{
    let resolve!: (value: T) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<T>((done, fail) =>
    {
        resolve = done;
        reject = fail;
    });
    return { promise, resolve, reject };
}
function detail(title: string, requestNumber: string): RequestDetail
{
    return { title, requestNumber, priority: "HIGH" } as RequestDetail;
}
test("loads labels incrementally with at most four detail reads", async () =>
{
    const tasks = Array.from({ length: 5 }, (_, index) => ({ ...task, id: `task-${index}`, requestId: `request-${index}` }));
    const reads = tasks.map(() => deferred<RequestDetail>());
    const firstRead = reads[0];
    const thirdRead = reads[2];
    assert(firstRead);
    assert(thirdRead);
    vi.mocked(searchApprovalTasks).mockResolvedValue({ ...page, items: tasks });
    vi.mocked(requestApi.read).mockImplementation((requestId) =>
    {
        const read = reads[Number(requestId.split("-")[1])];
        assert(read);
        return read.promise;
    });
    show();
    await waitFor(() => expect(requestApi.read).toHaveBeenCalledTimes(4));
    await act(async () => thirdRead.resolve(detail("Completed title", "REQ-3")));
    expect(screen.getByText("REQ-3")).toBeVisible();
    expect(screen.getByText("Completed title · High")).toBeVisible();
    await waitFor(() => expect(requestApi.read).toHaveBeenCalledTimes(5));
    expect(requestApi.read).toHaveBeenLastCalledWith("request-4", expect.any(AbortSignal), 0);
    await act(async () => firstRead.reject(new Error("denied")));
    expect(screen.getByText("Request request-0")).toBeVisible();
    expect(screen.getAllByText("Request details unavailable")).toHaveLength(4);
});
test("ignores late detail labels after an account switch", async () =>
{
    const oldRead = deferred<RequestDetail>();
    vi.mocked(searchApprovalTasks).mockResolvedValue(page);
    vi.mocked(requestApi.read).mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce(detail("New title", "NEW-1"));
    const view = show();
    await waitFor(() => expect(requestApi.read).toHaveBeenCalledTimes(1));
    const oldSignal = vi.mocked(requestApi.read).mock.calls[0]?.[1];
    assert(oldSignal);
    expect(requestApi.read).toHaveBeenNthCalledWith(1, id, oldSignal, 0);
    session.user.id = "b";
    session.generation = 1;
    view.rerender(<MemoryRouter><ReviewQueuePage /></MemoryRouter>);
    expect(await screen.findByText("New title · High")).toBeVisible();
    expect(requestApi.read).toHaveBeenNthCalledWith(2, id, expect.any(AbortSignal), 1);
    expect(oldSignal.aborted).toBe(true);
    await act(async () => oldRead.resolve(detail("Old title", "OLD-1")));
    expect(screen.queryByText("Old title · High")).not.toBeInTheDocument();
    expect(screen.queryByText("OLD-1")).not.toBeInTheDocument();
    expect(screen.getByText("New title · High")).toBeVisible();
    expect(screen.getByText("NEW-1")).toBeVisible();
});
test("shows tasks with safe fallback and sends filters and pagination to the server", async () =>
{
    vi.mocked(searchApprovalTasks).mockResolvedValue(page);
    vi.mocked(requestApi.read).mockRejectedValue(new Error("denied"));
    show();
    expect((await screen.findAllByText(`Request ${id}`))[0]).toHaveAttribute("href", `/reviews/${id}`);
    expect(screen.getAllByText("Request details unavailable")[0]).toBeVisible();
    fireEvent.change(screen.getByLabelText("Stage"), { target: { value: "2" } });
    await waitFor(() => expect(searchApprovalTasks).toHaveBeenLastCalledWith(expect.objectContaining({ search: [{ name: "stageNumber", condition: "EQUAL", value: 2 }] }), expect.any(AbortSignal), 0));
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    await waitFor(() => expect(searchApprovalTasks).toHaveBeenLastCalledWith(expect.objectContaining({ pageNumber: 2 }), expect.any(AbortSignal), 0));
});
test("retries a failed search", async () =>
{
    vi.mocked(searchApprovalTasks).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(page);
    vi.mocked(requestApi.read).mockRejectedValue(new Error("denied"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load reviews");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect((await screen.findAllByText(`Request ${id}`))[0]).toBeVisible();
});
test("clears an old account while its search resolves", async () =>
{
    let resolve!: (value: typeof page) => void;
    vi.mocked(searchApprovalTasks).mockReturnValueOnce(new Promise((done) =>
    {
        resolve = done;
    })).mockResolvedValue({ ...page, items: [] });
    const view = show();
    session.user.id = "b";
    session.generation = 1;
    view.rerender(<MemoryRouter><ReviewQueuePage /></MemoryRouter>);
    resolve(page);
    await waitFor(() => expect(screen.getByText("No reviews assigned.")).toBeVisible());
    expect(screen.queryByText(`Request ${id}`)).not.toBeInTheDocument();
    expect(requestApi.read).not.toHaveBeenCalled();
});
test("restores filters, sort and page from the initial URL", async () =>
{
    vi.mocked(searchApprovalTasks).mockResolvedValue(page);
    vi.mocked(requestApi.read).mockRejectedValue(new Error("denied"));
    render(<MemoryRouter initialEntries={["/reviews?stage=2&sort=dueAt%20desc&page=2"]}><ReviewQueuePage /></MemoryRouter>);
    await waitFor(() => expect(searchApprovalTasks).toHaveBeenCalledWith(expect.objectContaining({ pageNumber: 2, orderBy: "dueAt desc", search: [stageFilter] }), expect.any(AbortSignal), 0));
    expect(screen.getByLabelText("Stage")).toHaveValue("2");
    expect(screen.getByLabelText("Sort")).toHaveValue("dueAt desc");
});
test("reverts and reapplies the queue state on back and forward navigation", async () =>
{
    vi.mocked(searchApprovalTasks).mockResolvedValue(page);
    vi.mocked(requestApi.read).mockRejectedValue(new Error("denied"));
    const router = createMemoryRouter([{ path: "/reviews", element: <ReviewQueuePage /> }], { initialEntries: ["/reviews?stage=2"], initialIndex: 0 });
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(searchApprovalTasks).toHaveBeenCalledWith(expect.objectContaining({ search: [stageFilter] }), expect.any(AbortSignal), 0));
    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "dueAt desc" } });
    await waitFor(() => expect(searchApprovalTasks).toHaveBeenLastCalledWith(expect.objectContaining({ orderBy: "dueAt desc" }), expect.any(AbortSignal), 0));
    await router.navigate(-1);
    await waitFor(() => expect(searchApprovalTasks).toHaveBeenLastCalledWith(expect.objectContaining({ orderBy: "dueAt asc", search: [stageFilter] }), expect.any(AbortSignal), 0));
    expect(screen.getByLabelText("Sort")).toHaveValue("dueAt asc");
    await router.navigate(1);
    await waitFor(() => expect(searchApprovalTasks).toHaveBeenLastCalledWith(expect.objectContaining({ orderBy: "dueAt desc" }), expect.any(AbortSignal), 0));
    expect(screen.getByLabelText("Sort")).toHaveValue("dueAt desc");
});
test("keeps pending search text when a filter changes", async () =>
{
    vi.mocked(searchApprovalTasks).mockResolvedValue(page);
    vi.mocked(requestApi.read).mockRejectedValue(new Error("denied"));
    show();
    await screen.findAllByText(`Request ${id}`);
    fireEvent.change(screen.getByLabelText("Search requests"), { target: { value: "pending text" } });
    fireEvent.change(screen.getByLabelText("Stage"), { target: { value: "2" } });
    await waitFor(() => expect(searchApprovalTasks).toHaveBeenLastCalledWith(expect.objectContaining({ search: [stageFilter] }), expect.any(AbortSignal), 0));
    expect(screen.getByLabelText("Search requests")).toHaveValue("pending text");
});
test("resets the page when a filter changes", async () =>
{
    vi.mocked(searchApprovalTasks).mockResolvedValue(page);
    vi.mocked(requestApi.read).mockRejectedValue(new Error("denied"));
    render(<MemoryRouter initialEntries={["/reviews?page=2"]}><ReviewQueuePage /></MemoryRouter>);
    await waitFor(() => expect(searchApprovalTasks).toHaveBeenCalledWith(expect.objectContaining({ pageNumber: 2 }), expect.any(AbortSignal), 0));
    fireEvent.change(screen.getByLabelText("Stage"), { target: { value: "2" } });
    await waitFor(() => expect(searchApprovalTasks).toHaveBeenLastCalledWith(expect.objectContaining({ pageNumber: 1, search: [stageFilter] }), expect.any(AbortSignal), 0));
});
test("recovers from a rejected filter query with a default retry", async () =>
{
    vi.mocked(searchApprovalTasks).mockRejectedValueOnce(new ApiFailure({ kind: "http", status: 422, code: "VALIDATION_ERROR", message: "invalid" })).mockResolvedValue(page);
    vi.mocked(requestApi.read).mockRejectedValue(new Error("denied"));
    render(<MemoryRouter initialEntries={["/reviews?stage=2"]}><ReviewQueuePage /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Some filters could not be applied. Adjust them and try again.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(searchApprovalTasks).toHaveBeenLastCalledWith(expect.objectContaining({ pageNumber: 1, pageSize: 20, search: [], orderBy: "dueAt asc" }), expect.any(AbortSignal), 0));
    expect(screen.getByLabelText("Stage")).toHaveValue("");
});
