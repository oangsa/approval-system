import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import type { RequestSummary, UserRole } from "@workflow/contracts";
import { requestApi } from "../../app/api/requests";
import { RequestListPage } from "../../app/modules/requests/RequestListPage";
import { server } from "../helpers/server";

const session = vi.hoisted(() => ({ generation: 0, user: { id: "owner", roles: ["REQUESTER"] as UserRole[] } }));
vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => session }));
afterEach(() =>
{
    vi.restoreAllMocks();
    session.generation = 0;
    session.user.id = "owner";
    session.user.roles = ["REQUESTER"];
});
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
function selectStatus(value: string)
{
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.change(screen.getByLabelText("Status", { exact: true }), { target: { value } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
}
const id = "7bb91ef4-5982-405f-8bd5-61b5c3cf410b";
const item: RequestSummary = { id, requestNumber: "REQ-1", typeId: id, typeCode: "OPS", title: "Private request", priority: "HIGH", status: "PENDING", requester: { id, email: "owner@example.test", displayName: "Owner", roles: ["REQUESTER"], isActive: true, department: null }, department: { id, code: "FIN", name: "Finance", isActive: true }, revisionNumber: 1, currentCycleId: null, createdAt: "2026-11-06T00:00:00Z", updatedAt: "2026-11-06T17:30:00Z", submittedAt: null, version: 1 };
const pagination = { currentPage: 1, pageSize: 20, totalPages: 2, totalCount: 21, hasPrevious: false, hasNext: true };

test("search sends filters and renders metadata, safe links and pagination", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    const queries: Record<string, unknown>[] = [];
    server.use(http.post("http://localhost/api/v1/requests/search", async ({ request }) =>
    {
        queries.push(await request.json() as Record<string, unknown>);
        return HttpResponse.json([item], { headers: { "X-Pagination": JSON.stringify(pagination) } });
    }));
    render(<MemoryRouter initialEntries={["/requests?status=PENDING&updatedOn=2026-11-01&page=2"]}><RequestListPage /></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(await screen.findAllByRole("link", { name: "Private request" })).toHaveLength(2);
    expect(screen.getAllByText("Finance")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveDisplayValue("Pending approval");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("combobox", { name: "Sort" })).toHaveDisplayValue("Last updated (newest first)");
    expect(screen.getAllByText("Pending approval")).toHaveLength(2);
    expect(screen.getAllByText("High")).toHaveLength(1);
    expect(screen.getByText("High · Finance")).toBeVisible();
    const bangkokDate = new Intl.DateTimeFormat(undefined, { timeZone: "Asia/Bangkok" }).format(new Date(item.updatedAt));
    const utcDate = new Intl.DateTimeFormat(undefined, { timeZone: "UTC" }).format(new Date(item.updatedAt));
    expect(bangkokDate).not.toBe(utcDate);
    expect(screen.getAllByText((_content, element) => element?.textContent === bangkokDate || element?.textContent === `Updated ${bangkokDate}`)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Private request" })[0]).toHaveAttribute("href", `/requests/${id}`);
    expect(queries[0]).toMatchObject({ pageNumber: 2, search: [{ name: "status", condition: "EQUAL", value: "PENDING" }, { name: "updatedAt", condition: "GREATEROREQUAL", value: "2026-10-31T17:00:00.000Z" }, { name: "updatedAt", condition: "LESSER", value: "2026-11-01T17:00:00.000Z" }] });
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    await waitFor(() => expect(queries.at(-1)).toMatchObject({ pageNumber: 1, search: [] }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(queries.at(-1)).toMatchObject({ pageNumber: 2 }));
});

test("obsolete query and account responses cannot replace current rows", async () =>
{
    const pending: { signal: AbortSignal | undefined; resolve: (value: Awaited<ReturnType<typeof requestApi.search>>) => void }[] = [];
    vi.spyOn(requestApi, "search").mockImplementation((_query, signal) => new Promise((resolve) => pending.push({ signal, resolve })));
    const view = render(<MemoryRouter><RequestListPage /></MemoryRouter>);
    await waitFor(() => expect(pending).toHaveLength(1));
    selectStatus("PENDING");
    await waitFor(() => expect(pending).toHaveLength(2));
    session.generation = 1;
    session.user.id = "other";
    view.rerender(<MemoryRouter><RequestListPage /></MemoryRouter>);
    await waitFor(() => expect(pending).toHaveLength(3));
    expect(pending[0]!.signal?.aborted).toBe(true);
    expect(pending[1]!.signal?.aborted).toBe(true);
    await act(async () => pending[2]!.resolve({ items: [{ ...item, title: "Current request" }], pagination }));
    expect(screen.getAllByRole("link", { name: "Current request" })).toHaveLength(2);
    await act(async () =>
    {
        pending[0]!.resolve({ items: [{ ...item, title: "Old query" }], pagination });
        pending[1]!.resolve({ items: [{ ...item, title: "Old account" }], pagination });
    });
    expect(screen.getAllByRole("link", { name: "Current request" })).toHaveLength(2);
    expect(screen.queryByText("Old query")).not.toBeInTheDocument();
    expect(screen.queryByText("Old account")).not.toBeInTheDocument();
});

test("empty, filtered empty and retry states are shown", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    const failureRequestId = "3c9c1f24-6d0e-4f6a-9d2b-5a7f0c8e4b31";
    let fail = true;
    server.use(http.post("http://localhost/api/v1/requests/search", () => fail ? HttpResponse.json({ statusCode: 503, code: "SERVICE_UNAVAILABLE", message: "Service unavailable", error: "Service unavailable", requestId: failureRequestId }, { status: 503 }) : HttpResponse.json([], { headers: { "X-Pagination": JSON.stringify({ ...pagination, totalPages: 0, totalCount: 0, hasNext: false }) } })));
    render(<MemoryRouter><RequestListPage /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByText(/Request ID/)).toBeVisible();
    expect(screen.getByText(failureRequestId)).toHaveClass("select-all");
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No requests yet.")).toBeVisible();
    selectStatus("PENDING");
    expect(await screen.findByText("No requests match your filters.")).toBeVisible();
});

test("debounced search preserves new filters and ignores equivalent whitespace", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    const queries: Record<string, unknown>[] = [];
    server.use(http.post("http://localhost/api/v1/requests/search", async ({ request }) =>
    {
        queries.push(await request.json() as Record<string, unknown>);
        return HttpResponse.json([], { headers: { "X-Pagination": JSON.stringify(pagination) } });
    }));
    render(<MemoryRouter initialEntries={["/requests?sort=title%20asc&page=2"]}><RequestListPage /></MemoryRouter>);
    await waitFor(() => expect(queries).toHaveLength(1));
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "  travel  " } });
    selectStatus("PENDING");
    await waitFor(() => expect(queries.at(-1)).toMatchObject({ pageNumber: 1, orderBy: "title asc", search: [{ name: "status", condition: "EQUAL", value: "PENDING" }], searchTerm: { value: "travel" } }));
    const count = queries.length;
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: " travel " } });
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(queries).toHaveLength(count);
});

test.each([["REVIEWER"], ["ADMINISTRATOR"]] as const)("non-requester role cannot search or see requester controls", async (role) =>
{
    const searchSpy = vi.spyOn(requestApi, "search");
    session.user.roles = [role];
    render(<MemoryRouter initialEntries={["/requests"]}><RequestListPage /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("My Requests is available to Requester accounts only. Your account does not have Requester access.");
    expect(screen.getByRole("link", { name: "Go to Dashboard" })).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByLabelText("Search")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "New request" })).not.toBeInTheDocument();
    expect(searchSpy).not.toHaveBeenCalled();
});


test("draft filters apply atomically; cancel, reset and individual chips preserve other criteria", async () =>
{
    const search = vi.spyOn(requestApi, "search").mockResolvedValue({ items: [item], pagination });
    render(<MemoryRouter initialEntries={["/requests?page=2"]}><RequestListPage /></MemoryRouter>);
    await screen.findAllByText("Private request");
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "HIGH" } });
    expect(search).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(search).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(screen.getByLabelText("Priority")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "HIGH" } });
    fireEvent.change(screen.getByLabelText("Created from"), { target: { value: "2026-11-01" } });
    fireEvent.change(screen.getByLabelText("Created through"), { target: { value: "2026-11-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ pageNumber: 1, search: [
        { name: "priority", condition: "EQUAL", value: "HIGH" },
        { name: "createdAt", condition: "GREATEROREQUAL", value: "2026-10-31T17:00:00.000Z" },
        { name: "createdAt", condition: "LESSER", value: "2026-11-02T17:00:00.000Z" },
    ] }), expect.any(AbortSignal), 0));
    fireEvent.click(screen.getByRole("button", { name: "Remove Priority: High" }));
    await waitFor(() => expect(search.mock.calls.at(-1)?.[0].search).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.click(screen.getByRole("button", { name: "Reset filters" }));
    expect(search.mock.calls.at(-1)?.[0].search).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(search.mock.calls.at(-1)?.[0].search).toEqual([]));
});

test("invalid URL criteria never trigger an unfiltered fetch and can be cleared", async () =>
{
    const search = vi.spyOn(requestApi, "search").mockResolvedValue({ items: [], pagination: { ...pagination, totalPages: 0, totalCount: 0, hasNext: false } });
    render(<MemoryRouter initialEntries={["/requests?createdFrom=2026-02-30"]}><RequestListPage /></MemoryRouter>);
    expect(screen.getByRole("alert")).toHaveTextContent("valid calendar dates");
    expect(search).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear invalid criteria" }));
    expect(await screen.findByText("No requests yet.")).toBeVisible();
    expect(screen.getByText("0 results")).toBeVisible();
    expect(screen.queryByText(/Page 1 of 0/)).not.toBeInTheDocument();
});

test("filter dialog wraps keyboard focus and restores trigger on Escape", async () =>
{
    vi.spyOn(requestApi, "search").mockResolvedValue({ items: [item], pagination });
    render(<MemoryRouter><RequestListPage /></MemoryRouter>);
    await screen.findAllByText("Private request");
    const trigger = screen.getByRole("button", { name: /^Filters/ });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Advanced filters" });
    const first = screen.getByRole("button", { name: "Close filters" });
    const last = screen.getByRole("button", { name: "Apply filters" });
    first.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(first).toHaveFocus();
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
});

test("pending debounced search does not discard an open filter draft", async () =>
{
    const search = vi.spyOn(requestApi, "search").mockResolvedValue({ items: [item], pagination });
    render(<MemoryRouter><RequestListPage /></MemoryRouter>);
    await screen.findAllByText("Private request");
    fireEvent.change(screen.getByLabelText("Search"), { target: { value: "travel" } });
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.change(screen.getByLabelText("Priority"), { target: { value: "HIGH" } });
    await waitFor(() => expect(search.mock.calls.at(-1)?.[0].searchTerm?.value).toBe("travel"));
    expect(screen.getByLabelText("Priority")).toHaveValue("HIGH");
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(search.mock.calls.at(-1)?.[0]).toMatchObject({ searchTerm: { value: "travel" }, search: [{ name: "priority", condition: "EQUAL", value: "HIGH" }] }));
});

test("out-of-range pages recover once from server metadata; sort and page size reset page", async () =>
{
    const search = vi.spyOn(requestApi, "search").mockImplementation(async (query) => ({ items: query.pageNumber > 2 ? [] : [item], pagination: { ...pagination, currentPage: query.pageNumber, hasPrevious: query.pageNumber > 1 } }));
    render(<MemoryRouter initialEntries={["/requests?page=99"]}><RequestListPage /></MemoryRouter>);
    await screen.findAllByText("Private request");
    expect(search.mock.calls.map(([query]) => query.pageNumber)).toEqual([99, 2]);
    fireEvent.change(screen.getByLabelText("Rows per page"), { target: { value: "50" } });
    await waitFor(() => expect(search.mock.calls.at(-1)?.[0]).toMatchObject({ pageNumber: 1, pageSize: 50 }));
    fireEvent.click(screen.getByRole("button", { name: "Request" }));
    await waitFor(() => expect(search.mock.calls.at(-1)?.[0].orderBy).toBe("title asc"));
    expect(screen.getByRole("columnheader", { name: "Request" })).toHaveAttribute("aria-sort", "ascending");
});

test("selected type keeps its label after Apply, reopen and URL restoration", async () =>
{
    const type = { id, code: "OPS", name: { en: "Operations" }, versionId: id, versionNumber: 1, isEnabled: true, supportsLineItems: false, monetary: false, fields: [], publishedAt: "2026-11-01T00:00:00Z" };
    vi.spyOn(requestApi, "search").mockResolvedValue({ items: [item], pagination });
    vi.spyOn(requestApi, "searchTypes").mockResolvedValue({ items: [type], pagination });
    const read = vi.spyOn(requestApi, "type").mockResolvedValue(type);
    const view = render(<MemoryRouter><RequestListPage /></MemoryRouter>);
    await screen.findAllByText("Private request");
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    fireEvent.click(screen.getByRole("button", { name: "Request type All request types" }));
    fireEvent.click(await screen.findByRole("button", { name: "Operations (OPS)" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(await screen.findByRole("button", { name: "Remove Request type: Operations (OPS)" })).toBeVisible();
    expect(read).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    expect(screen.getByRole("button", { name: "Request type Operations (OPS)" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Clear request type" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Remove Request type: Operations (OPS)" })).toBeVisible();
    view.unmount();
    render(<MemoryRouter initialEntries={[`/requests?typeId=${id}`]}><RequestListPage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "Remove Request type: Operations (OPS)" })).toBeVisible();
    expect(read).toHaveBeenCalledWith(id, expect.any(AbortSignal), 0);
});

test("invalid filter ranges identify fields, announce the error and focus its control", async () =>
{
    const search = vi.spyOn(requestApi, "search").mockResolvedValue({ items: [item], pagination });
    render(<MemoryRouter><RequestListPage /></MemoryRouter>);
    await screen.findAllByText("Private request");
    fireEvent.click(screen.getByRole("button", { name: /^Filters/ }));
    const from = screen.getByLabelText("Created from");
    const through = screen.getByLabelText("Created through");
    fireEvent.change(from, { target: { value: "2026-11-10" } });
    fireEvent.change(through, { target: { value: "2026-11-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Created date range");
    expect(from).toHaveAttribute("aria-invalid", "true");
    expect(through).toHaveAttribute("aria-invalid", "true");
    expect(from).toHaveAccessibleDescription("Created date range: start must be on or before its end.");
    await waitFor(() => expect(from).toHaveFocus());
    expect(search).toHaveBeenCalledTimes(1);
    fireEvent.change(through, { target: { value: "2026-11-12" } });
    expect(from).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply filters" }));
    await waitFor(() => expect(search.mock.calls.at(-1)?.[0].search).toHaveLength(2));
});

test("type label resolution aborts and clears metadata on account changes", async () =>
{
    const pending: { signal: AbortSignal | undefined; resolve: (value: Awaited<ReturnType<typeof requestApi.type>>) => void }[] = [];
    vi.spyOn(requestApi, "search").mockResolvedValue({ items: [], pagination });
    vi.spyOn(requestApi, "type").mockImplementation((_id, signal) => new Promise((resolve) => pending.push({ signal, resolve })));
    const view = render(<MemoryRouter initialEntries={[`/requests?typeId=${id}`]}><RequestListPage /></MemoryRouter>);
    await waitFor(() => expect(pending).toHaveLength(1));
    session.generation = 1;
    session.user.id = "other";
    view.rerender(<MemoryRouter initialEntries={[`/requests?typeId=${id}`]}><RequestListPage /></MemoryRouter>);
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0]!.signal?.aborted).toBe(true);
    const type = { id, code: "OLD", name: { en: "Previous account type" }, versionId: id, versionNumber: 1, isEnabled: true, supportsLineItems: false, monetary: false, fields: [], publishedAt: "2026-11-01T00:00:00Z" };
    await act(async () => pending[0]!.resolve(type));
    expect(screen.queryByText(/Previous account type/)).not.toBeInTheDocument();
    await act(async () => pending[1]!.resolve({ ...type, code: "NEW", name: { en: "Current account type" } }));
    expect(await screen.findByRole("button", { name: "Remove Request type: Current account type (NEW)" })).toBeVisible();
});

test("unavailable selected types remain clearable and temporary label failures retry", async () =>
{
    vi.spyOn(requestApi, "search").mockResolvedValue({ items: [], pagination });
    const type = { id, code: "OPS", name: { en: "Operations" }, versionId: id, versionNumber: 1, isEnabled: false, supportsLineItems: false, monetary: false, fields: [], publishedAt: "2026-11-01T00:00:00Z" };
    const read = vi.spyOn(requestApi, "type").mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce(type);
    render(<MemoryRouter initialEntries={[`/requests?typeId=${id}`]}><RequestListPage /></MemoryRouter>);
    fireEvent.click(await screen.findByRole("button", { name: "Retry request type" }));
    expect(await screen.findByText("This request type is unavailable. Clear it or choose another type.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Remove Request type unavailable" }));
    await waitFor(() => expect(screen.queryByText(/This request type is unavailable/)).not.toBeInTheDocument());
    expect(read).toHaveBeenCalledTimes(2);
});
