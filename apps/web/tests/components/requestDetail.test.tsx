import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { http, HttpResponse } from "msw";
import { expect, test, vi } from "vitest";
import type { PublishedRequestType, RequestDetail } from "@workflow/contracts";
import { RequestDetailPage } from "../../app/modules/requests/RequestDetailPage";
import { server } from "../helpers/server";

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
    revisionNumber: 1, currentCycleId: null, createdAt: "2026-11-06T00:00:00Z", updatedAt: "2026-11-06T00:00:00Z", submittedAt: "2026-11-06T00:00:00Z", version: 1,
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
