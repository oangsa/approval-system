import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { http, HttpResponse } from "msw";
import { afterEach, expect, test, vi } from "vitest";
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
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveDisplayValue("Pending approval");
    expect(screen.getByRole("combobox", { name: "Sort" })).toHaveDisplayValue("Last updated (newest first)");
    expect(screen.getAllByText("Pending approval")).toHaveLength(3);
    expect(screen.getAllByText("High")).toHaveLength(1);
    expect(screen.getByText("High · Finance")).toBeVisible();
    const bangkokDate = new Intl.DateTimeFormat(undefined, { timeZone: "Asia/Bangkok" }).format(new Date(item.updatedAt));
    const utcDate = new Intl.DateTimeFormat(undefined, { timeZone: "UTC" }).format(new Date(item.updatedAt));
    expect(bangkokDate).not.toBe(utcDate);
    expect(screen.getAllByText((_content, element) => element?.textContent === bangkokDate || element?.textContent === `Updated ${bangkokDate}`)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Private request" })[0]).toHaveAttribute("href", `/requests/${id}`);
    expect(queries[0]).toMatchObject({ pageNumber: 2, search: [{ name: "status", condition: "EQUAL", value: "PENDING" }, { name: "updatedAt", condition: "GREATEROREQUAL", value: "2026-10-31T17:00:00.000Z" }, { name: "updatedAt", condition: "LESSER", value: "2026-11-01T17:00:00.000Z" }] });
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
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
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "PENDING" } });
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
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "PENDING" } });
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
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "PENDING" } });
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
