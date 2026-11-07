import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { http, HttpResponse } from "msw";
import { afterEach, expect, test, vi } from "vitest";
import type { PublishedRequestType, RequestDetail } from "@workflow/contracts";
import { RequestDetailPage } from "../../app/modules/requests/RequestDetailPage";
import { requestApi } from "../../app/api/requests";
import { server } from "../helpers/server";

const session = vi.hoisted(() => ({ generation: 0, user: { id: "owner" } }));
vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => session }));
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
    expect(await screen.findByText("Expense category")).toBeVisible();
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
    server.use(http.get(`http://localhost/api/v1/requests/${id}`, () => HttpResponse.json(staged)), http.get(`http://localhost/api/v1/request-types/${id}/versions/${versionId}`, () => HttpResponse.json(definition)));
    render(<MemoryRouter initialEntries={[`/requests/${id}?tab=approval`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("region", { name: "Stage 1" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Stage 2" })).toBeVisible();
    expect(screen.getByText("Stage 1 active")).toBeVisible();
    expect(screen.getByText("All approvers must approve · 1 of 2 approved")).toBeVisible();
    expect(screen.getByText("All approvers must approve · 0 of 1 approved")).toBeVisible();
    expect(screen.getByText("Alice · Approved")).toBeVisible();
    expect(screen.getByText("Bob · Action required")).toBeVisible();
    expect(screen.getByText("Carol · Waiting")).toBeVisible();
    expect(screen.getAllByText("Pending approval")).toHaveLength(2);
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
    server.use(http.get(`http://localhost/api/v1/requests/${id}`, () => HttpResponse.json(detail)), http.get(`http://localhost/api/v1/request-types/${id}/versions/${versionId}`, () => HttpResponse.json(definition)));
    render(<MemoryRouter initialEntries={[`/requests/${id}`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    const overview = await screen.findByRole("tab", { name: "Overview" });
    const dateOptions = { year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" } as const;
    const bangkokDate = new Intl.DateTimeFormat(undefined, { ...dateOptions, timeZone: "Asia/Bangkok" }).format(new Date(detail.updatedAt));
    const utcDate = new Intl.DateTimeFormat(undefined, { ...dateOptions, timeZone: "UTC" }).format(new Date(detail.updatedAt));
    expect(bangkokDate).not.toBe(utcDate);
    expect(screen.getByText((_content, element) => element?.tagName === "P" && element.textContent === `Updated: ${bangkokDate}`)).toBeVisible();
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
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    server.use(http.get(`http://localhost/api/v1/requests/${id}`, () => HttpResponse.json(detail)), http.get(`http://localhost/api/v1/request-types/${id}/versions/${versionId}`, () => HttpResponse.json(definition)));
    render(<MemoryRouter initialEntries={[`/requests/${id}?tab=history&other=kept`]}><Location /><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("tabpanel", { name: "History" })).toHaveTextContent("History is not available yet.");
    expect(screen.getByText(/Type: Operations/)).toBeVisible();
    expect(screen.getByText(/Requester: Owner/)).toBeVisible();
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
