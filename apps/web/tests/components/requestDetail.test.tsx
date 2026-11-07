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
    let fail = true;
    server.use(
        http.get(`http://localhost/api/v1/requests/${id}`, () => HttpResponse.json(detail)),
        http.get(`http://localhost/api/v1/request-types/${id}/versions/${versionId}`, () => fail ? new HttpResponse(null, { status: 503 }) : HttpResponse.json(definition)),
    );
    render(<MemoryRouter initialEntries={[`/requests/${id}`]}><Routes><Route path="/requests/:id" element={<RequestDetailPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.queryByRole("region", { name: "Request result" })).not.toBeInTheDocument();
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Operational expense")).toBeVisible();
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
