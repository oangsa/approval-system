import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import type { PublishedRequestType, RequestDetail } from "@workflow/contracts";
import { RequestResult } from "../../app/modules/requests/RequestResult";
import { RequestDetailPage } from "../../app/modules/requests/RequestDetailPage";
import { requestApi } from "../../app/api/requests";
import { ApiFailure } from "../../app/api/errors";
import { server } from "../helpers/server";

const session = vi.hoisted(() => ({ generation: 0, user: { id: "owner", roles: ["REQUESTER"] } }));
vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => session }));
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
afterEach(() =>
{
    vi.restoreAllMocks();
    session.generation = 0;
    session.user.id = "owner";
});
function Location()
{
    return <span data-testid="location">{useLocation().search}</span>;
}
const id = "7bb91ef4-5982-405f-8bd5-61b5c3cf410b";
const versionId = "8bb91ef4-5982-405f-8bd5-61b5c3cf410b";
const definition: PublishedRequestType = {
    id, code: "OPS", name: { en: "Operations" }, versionId, versionNumber: 1,
    isEnabled: true, supportsLineItems: false, monetary: false, publishedAt: "2026-11-06T00:00:00Z",
    fields: [{ key: "category", kind: "SELECT", label: { en: "Expense category" }, required: true, constraints: { options: [{ value: "OPS", label: { en: "Operational expense" } }] } }],
};
const detail: RequestDetail = {
    id, typeId: id, typeCode: "OPS", title: "Saved request", justification: "Reason", priority: "MEDIUM", status: "PENDING", requestNumber: "REQ-00000001",
    requester: { id, email: "owner@example.test", displayName: "Owner", roles: ["REQUESTER"], isActive: true, department: null }, department: null,
    revisionNumber: 1, currentCycleId: null, createdAt: "2026-11-06T00:00:00Z", updatedAt: "2026-11-06T17:30:00Z", submittedAt: "2026-11-06T00:00:00Z", version: 1,
    workingRevision: null, submittedRevision: { id, revisionNumber: 1, formDefinitionVersionId: versionId, fields: { category: "OPS" }, lineItems: [], amount: null, currency: null, submittedAt: "2026-11-06T00:00:00Z", submittedBy: id },
    currentStageNumber: null, currentApprovers: [], availableActions: [],
};

test("reopened request uses pinned field and option labels without reading the latest type", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    server.use(
        http.get(`http://localhost/api/v1/requests/${id}`, () => HttpResponse.json(detail)),
        http.get(`http://localhost/api/v1/request-types/${id}/versions/${versionId}`, ({ request }) =>
        {
            expect(new URL(request.url).searchParams.get("requestId")).toBe(id);
            return HttpResponse.json(definition);
        }),
    );
    render(<MemoryRouter initialEntries={[`/requests/${id}`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveTextContent("Loading request…");
    expect(await screen.findByText("Expense category")).toBeVisible();
    expect(screen.getAllByText("Saved request")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Justification" })).toBeVisible();
    expect(screen.getByText("Operational expense")).toBeVisible();
});

test("definition failures offer retry and do not render misleading raw labels", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    const failureRequestId = "5e7d3a28-9b1c-4d6e-8f0a-2c3b4d5e6f70";
    let fail = true;
    server.use(
        http.get(`http://localhost/api/v1/requests/${id}`, () => HttpResponse.json(detail)),
        http.get(`http://localhost/api/v1/request-types/${id}/versions/${versionId}`, () => fail ? HttpResponse.json({ statusCode: 503, code: "SERVICE_UNAVAILABLE", message: "Service unavailable", error: "Service unavailable", requestId: failureRequestId }, { status: 503 }) : HttpResponse.json(definition)),
    );
    render(<MemoryRouter initialEntries={[`/requests/${id}`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByText(/Request ID/)).toBeVisible();
    expect(screen.getByText(failureRequestId)).toHaveClass("select-all");
    expect(screen.queryByRole("region", { name: "Request result" })).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Operational expense")).toBeVisible();
});

test("approval tab groups current approvers by stage with readable states", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    const staged: RequestDetail = { ...detail, currentStageNumber: 1, currentApprovers: [
        { slotId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", stageNumber: 1, reviewer: { id, displayName: "Alice" }, status: "APPROVED" },
        { slotId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", stageNumber: 1, reviewer: { id, displayName: "Bob" }, status: "ACTIONABLE" },
        { slotId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", stageNumber: 2, reviewer: { id, displayName: "Carol" }, status: "WAITING" },
    ] };
    server.use(http.get(`http://localhost/api/v1/requests/${id}`, () => HttpResponse.json(staged)), http.get(`http://localhost/api/v1/requests/${id}/approvers`, () => HttpResponse.json(staged.currentApprovers)), http.get(`http://localhost/api/v1/request-types/${id}/versions/${versionId}`, () => HttpResponse.json(definition)));
    render(<MemoryRouter initialEntries={[`/requests/${id}?tab=approval`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("region", { name: "Stage 1" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Stage 2" })).toBeVisible();
    expect(screen.getByText("Stage 1 active")).toBeVisible();
    expect(screen.getByText("All approvers must approve · 1 of 2 approved; 1 remaining")).toBeVisible();
    expect(screen.getByText("All approvers must approve · 0 of 1 approved; 1 remaining")).toBeVisible();
    expect(screen.getByText("Stage 2 (waiting)")).toBeVisible();
    expect(screen.getByText("Alice").closest("li")).toHaveTextContent("Approved");
    expect(screen.getByText("Bob").closest("li")).toHaveTextContent("Action required");
    expect(screen.getByText("Carol").closest("li")).toHaveTextContent("Waiting");
    expect(screen.getByText("Pending approval")).toBeVisible();
});

test.each([[403, "You do not have access to this content."], [404, "This request is unavailable."]] as const)("terminal detail failures show safe copy without retry", async (status, message) =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    const envelope = { statusCode: status, code: status === 403 ? "FORBIDDEN" : "NOT_FOUND", message, error: message, requestId: "4d8b2e15-7c3a-4f5b-8e6d-1b2a9c0f7e42" };
    server.use(http.get(`http://localhost/api/v1/requests/${id}`, () => HttpResponse.json(envelope, { status })));
    render(<MemoryRouter initialEntries={[`/requests/${id}`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Request result" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "Saved request" })).not.toBeInTheDocument();
    if (status === 403) expect(screen.getByRole("link", { name: "Go to Dashboard" })).toHaveAttribute("href", "/dashboard");
});

test("detail tabs support keyboard navigation and keep the header visible", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    const emptyPage = { headers: { "X-Pagination": JSON.stringify({ currentPage: 1, pageSize: 20, totalPages: 0, totalCount: 0, hasPrevious: false, hasNext: false }) } };
    server.use(
        http.get(`http://localhost/api/v1/requests/${id}`, () => HttpResponse.json(detail)),
        http.get(`http://localhost/api/v1/request-types/${id}/versions/${versionId}`, () => HttpResponse.json(definition)),
        http.get(`http://localhost/api/v1/requests/${id}/approvers`, () => HttpResponse.json([])),
        http.get(`http://localhost/api/v1/requests/${id}/comments`, () => HttpResponse.json([], emptyPage)),
        http.get(`http://localhost/api/v1/requests/${id}/attachments`, () => HttpResponse.json([], emptyPage)),
    );
    render(<MemoryRouter initialEntries={[`/requests/${id}`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    const overview = await screen.findByRole("tab", { name: "Overview" });
    const dateOptions = { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" } as const;
    const bangkokDate = new Intl.DateTimeFormat(undefined, { ...dateOptions, timeZone: "Asia/Bangkok" }).format(new Date(detail.updatedAt));
    const utcDate = new Intl.DateTimeFormat(undefined, { ...dateOptions, timeZone: "UTC" }).format(new Date(detail.updatedAt));
    expect(bangkokDate).not.toBe(utcDate);
    expect(screen.getByText(bangkokDate, { selector: "time" })).toBeVisible();
    overview.focus();
    fireEvent.keyDown(overview, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Approval" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Approval" }), { key: "ArrowLeft" });
    expect(overview).toHaveFocus();
    fireEvent.keyDown(overview, { key: "End" });
    expect(screen.getByRole("tab", { name: "Discussion / Files" })).toHaveFocus();
    expect(screen.getByRole("tabpanel", { name: "Discussion / Files" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Saved request", level: 1 })).toBeVisible();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Discussion / Files" }), { key: "Home" });
    expect(overview).toHaveFocus();
});

test("detail restores URL tabs and falls back to overview", async () =>
{
    server.use(http.get("http://localhost/api/v1/requests/:id/timeline", () => HttpResponse.json([], { headers: { "X-Pagination": JSON.stringify({ currentPage: 1, pageSize: 20, totalPages: 0, totalCount: 0, hasPrevious: false, hasNext: false }) } })));
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    server.use(http.get(`http://localhost/api/v1/requests/${id}`, () => HttpResponse.json(detail)), http.get(`http://localhost/api/v1/request-types/${id}/versions/${versionId}`, () => HttpResponse.json(definition)));
    render(<MemoryRouter initialEntries={[`/requests/${id}?tab=history&other=kept`]}><Location /><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("tabpanel", { name: "History" })).toHaveTextContent("Formal decision and status history");
    expect(screen.getByText("Operations", { selector: "dd" })).toBeVisible();
    expect(screen.getByText("Owner", { selector: "dd" })).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Approval" }));
    expect(screen.getByRole("tabpanel", { name: "Approval" })).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("tab=approval&other=kept");
});

test("invalid tab defaults to overview", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    server.use(http.get(`http://localhost/api/v1/requests/${id}`, () => HttpResponse.json(detail)), http.get(`http://localhost/api/v1/request-types/${id}/versions/${versionId}`, () => HttpResponse.json(definition)));
    render(<MemoryRouter initialEntries={[`/requests/${id}?tab=invalid`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
});

test("late detail response from the previous account cannot replace current detail", async () =>
{
    const pending: { signal: AbortSignal | undefined; resolve: (value: RequestDetail) => void }[] = [];
    vi.spyOn(requestApi, "read").mockImplementation((_id, signal) => new Promise((resolve) => pending.push({ signal, resolve })));
    const view = render(<MemoryRouter initialEntries={[`/requests/${id}`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(pending).toHaveLength(1));
    session.generation = 1;
    session.user.id = "other";
    view.rerender(<MemoryRouter initialEntries={[`/requests/${id}`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0]!.signal?.aborted).toBe(true);
    const noRevisions = { ...detail, workingRevision: null, submittedRevision: null };
    await act(async () => pending[1]!.resolve({ ...noRevisions, title: "Current detail" }));
    expect(await screen.findByRole("heading", { name: "Current detail", level: 1 })).toBeVisible();
    await act(async () => pending[0]!.resolve({ ...noRevisions, title: "Old detail" }));
    expect(screen.getByRole("heading", { name: "Current detail", level: 1 })).toBeVisible();
    expect(screen.queryByText("Old detail")).not.toBeInTheDocument();
});

test("B07 detail withdrawal restores focus to Withdraw on cancel and moves focus to status when Withdraw disappears", async () =>
{
    session.user.id = id;
    const pending: RequestDetail = { ...detail, availableActions: ["WITHDRAW"] };
    const withdrawn: RequestDetail = { ...pending, status: "WITHDRAWN", version: 2, availableActions: [] };
    vi.spyOn(requestApi, "read").mockResolvedValue(pending);
    vi.spyOn(requestApi, "version").mockResolvedValue(definition);
    vi.spyOn(requestApi, "withdraw").mockResolvedValue(withdrawn);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={[`/requests/${id}`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    const withdraw = await screen.findByRole("button", { name: "Withdraw" });
    await user.click(withdraw);
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    await waitFor(() => expect(withdraw).toHaveFocus());
    await user.click(withdraw);
    await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
    const status = await screen.findByText("Withdrawn");
    await waitFor(() => expect(status).toHaveFocus());
    expect(screen.queryByRole("button", { name: "Withdraw" })).not.toBeInTheDocument();
});

test("RequestDetailTabs uses browser locale for type name with English fallback", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    const langsSpy = vi.spyOn(navigator, "languages", "get").mockReturnValue(["th-TH", "en-US"]);
    const localizedDef: PublishedRequestType = {
        ...definition,
        name: { en: "Operations", th: "งานปฏิบัติการ" },
    };
    server.use(
        http.get(`http://localhost/api/v1/requests/${id}`, () => HttpResponse.json(detail)),
        http.get(`http://localhost/api/v1/request-types/${id}/versions/${versionId}`, () => HttpResponse.json(localizedDef)),
    );
    const { unmount } = render(<MemoryRouter initialEntries={[`/requests/${id}`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText("งานปฏิบัติการ")).toBeVisible();
    unmount();

    langsSpy.mockReturnValue(["th-TH"]);
    server.use(
        http.get(`http://localhost/api/v1/request-types/${id}/versions/${versionId}`, () => HttpResponse.json(definition)),
    );
    render(<MemoryRouter initialEntries={[`/requests/${id}`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText("Operations", { selector: "dd" })).toBeVisible();
});

test.each(["RETURNED", "DRAFT", "PENDING"] as const)("%s overview selects the appropriate revision", (status) =>
{
    const working = { ...detail.submittedRevision!, fields: { category: "NEW" }, lineItems: [{ id, description: "Working item", quantity: "2", unitAmount: "5.00", totalAmount: "10.00" }], amount: "10.00", currency: "THB" };
    const submitted = { ...detail.submittedRevision!, fields: { category: "OPS" }, lineItems: [{ id, description: "Submitted item", quantity: "1", unitAmount: "3.00", totalAmount: "3.00" }], amount: "3.00", currency: "THB" };
    const choices: PublishedRequestType = { ...definition, fields: [{ ...definition.fields[0]!, constraints: { options: [{ value: "OPS", label: { en: "Old option" } }, { value: "NEW", label: { en: "New option" } }] } }] };
    render(<RequestResult detail={{ ...detail, status, title: "Edited title", workingRevision: working, submittedRevision: status === "DRAFT" ? null : submitted }} definition={choices} />);
    const workingShown = status !== "PENDING";
    expect(screen.getByText("Edited title")).toBeVisible();
    expect(screen.getByText(workingShown ? "New option" : "Old option")).toBeVisible();
    expect(screen.getByText(workingShown ? "Working item" : "Submitted item")).toBeVisible();
    expect(screen.queryByText(workingShown ? "Old option" : "New option")).not.toBeInTheDocument();
    expect(screen.getByText(workingShown ? /Total:.*10\.00/ : /Total:.*3\.00/)).toBeVisible();
});

test("approval tab loads, retries failures, and clears results on session change", async () =>
{
    const pending: { signal: AbortSignal | undefined; resolve: (value: RequestDetail["currentApprovers"]) => void; reject: (failure: unknown) => void }[] = [];
    vi.spyOn(requestApi, "read").mockResolvedValue({ ...detail, submittedRevision: null });
    vi.spyOn(requestApi, "approvers").mockImplementation((_id, signal) => new Promise((resolve, reject) => pending.push({ signal, resolve, reject })));
    const view = render(<MemoryRouter initialEntries={[`/requests/${id}?tab=approval`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(pending).toHaveLength(1));
    expect(screen.getByRole("status")).toHaveTextContent("Loading approval progress");
    await act(async () => pending[0]!.reject(new Error("private failure")));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load approval progress.");
    expect(screen.queryByText("private failure")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(pending).toHaveLength(2));
    await act(async () => pending[1]!.resolve([{ slotId: id, stageNumber: 1, reviewer: { id, displayName: "Private reviewer" }, status: "APPROVED" }]));
    expect(screen.getByText("Stage 1 (completed)")).toBeVisible();
    session.generation = 1;
    session.user.id = "other";
    view.rerender(<MemoryRouter initialEntries={[`/requests/${id}?tab=approval`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    expect(screen.queryByText("Private reviewer")).not.toBeInTheDocument();
    await waitFor(() => expect(pending).toHaveLength(3));
    await act(async () => pending[2]!.resolve([]));
    expect(screen.getByText("No current approvers.")).toBeVisible();
});

test("approval tab denies access without exposing reviewer data or retry", async () =>
{
    vi.spyOn(requestApi, "read").mockResolvedValue({ ...detail, submittedRevision: null });
    vi.spyOn(requestApi, "approvers").mockRejectedValue(new ApiFailure({ kind: "http", status: 403, message: "private" }));
    render(<MemoryRouter initialEntries={[`/requests/${id}?tab=approval`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have access to this content.");
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(screen.queryByText("private")).not.toBeInTheDocument();
});

test("approval summary determines active stage when request detail is stale", async () =>
{
    vi.spyOn(requestApi, "read").mockResolvedValue({ ...detail, submittedRevision: null, currentStageNumber: 1 });
    vi.spyOn(requestApi, "approvers").mockResolvedValue([
        { slotId: id, stageNumber: 1, reviewer: { id, displayName: "First" }, status: "APPROVED" },
        { slotId: versionId, stageNumber: 2, reviewer: { id, displayName: "Second" }, status: "ACTIONABLE" },
    ]);
    render(<MemoryRouter initialEntries={[`/requests/${id}?tab=approval`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText("Stage 2 (active)")).toBeVisible();
    expect(screen.getByText("Stage 1 (completed)")).toBeVisible();
    expect(screen.getByText("Stage 2 active")).toBeVisible();
});

test("late approval response from a prior session is ignored", async () =>
{
    const pending: { signal: AbortSignal | undefined; resolve: (value: RequestDetail["currentApprovers"]) => void }[] = [];
    vi.spyOn(requestApi, "read").mockResolvedValue({ ...detail, submittedRevision: null });
    vi.spyOn(requestApi, "approvers").mockImplementation((_id, signal) => new Promise((resolve) => pending.push({ signal, resolve })));
    const view = render(<MemoryRouter initialEntries={[`/requests/${id}?tab=approval`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(pending).toHaveLength(1));
    session.generation = 1;
    session.user.id = "other";
    view.rerender(<MemoryRouter initialEntries={[`/requests/${id}?tab=approval`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0]!.signal?.aborted).toBe(true);
    await act(async () => pending[1]!.resolve([{ slotId: id, stageNumber: 1, reviewer: { id, displayName: "Current" }, status: "CANCELLED" }]));
    expect(screen.getByText("Stage 1 (cancelled)")).toBeVisible();
    await act(async () => pending[0]!.resolve([{ slotId: id, stageNumber: 1, reviewer: { id, displayName: "Previous" }, status: "ACTIONABLE" }]));
    expect(screen.queryByText("Previous")).not.toBeInTheDocument();
    expect(screen.getByText("Current")).toBeVisible();
});
