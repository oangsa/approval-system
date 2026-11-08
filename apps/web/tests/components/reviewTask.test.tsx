import { DecisionAttempt } from "../../app/services/decisionService";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, test, vi } from "vitest";
import { ApiFailure } from "../../app/api/errors";
import { ReviewTaskPage } from "../../app/modules/reviews/ReviewTaskPage";
import { readApprovalTaskResult } from "../../app/services/approvalTaskService";
import type { ApprovalTask, PublishedRequestType, RequestDetail } from "@workflow/contracts";

vi.mock("../../app/modules/requests/AuditTimeline", () => ({ AuditTimeline: () => <section>Persisted history</section> }));
vi.mock("../../app/modules/reviews/DecisionDialog", () => ({ DecisionDialog: ({ onConfirm }: { onConfirm: () => void }) => <button onClick={onConfirm}>Confirm approval</button> }));
vi.mock("../../app/services/approvalTaskService", () => ({ readApprovalTaskResult: vi.fn() }));
vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => ({ status: "authenticated", user: { id: "reviewer", roles: ["REVIEWER"] }, generation: 0 }) }));
function taskFixture()
{
    const id = "7bb91ef4-5982-405f-8bd5-61b5c3cf410b";
    const task: ApprovalTask = { id, slotId: id, requestId: id, cycleId: id, revisionId: id, stageNumber: 1, assignedReviewer: { id, displayName: "Reviewer" }, status: "ACTIONABLE", dueAt: null, canCurrentUserDecide: true, version: 1 };
    const definition: PublishedRequestType = { id, code: "OPS", name: { en: "Operations" }, versionId: id, versionNumber: 1, isEnabled: true, supportsLineItems: false, monetary: false, publishedAt: "2026-11-06T00:00:00Z", fields: [] };
    const detail: RequestDetail = {
        id, typeId: id, typeCode: "OPS", title: "Saved request", justification: "Reason", priority: "MEDIUM", status: "PENDING", requestNumber: "REQ-00000001",
        requester: { id, email: "owner@example.test", displayName: "Owner", roles: ["REQUESTER"], isActive: true, department: null }, department: null,
        revisionNumber: 1, currentCycleId: id, createdAt: "2026-11-06T00:00:00Z", updatedAt: "2026-11-06T00:00:00Z", submittedAt: "2026-11-06T00:00:00Z", version: 1,
        workingRevision: null, submittedRevision: { id, revisionNumber: 1, formDefinitionVersionId: id, fields: {}, lineItems: [], amount: null, currency: null, submittedAt: "2026-11-06T00:00:00Z", submittedBy: id },
        currentStageNumber: 1, currentApprovers: [
            { slotId: id, stageNumber: 1, reviewer: { id, displayName: "Reviewer" }, status: "ACTIONABLE" },
            { slotId: "8bb91ef4-5982-405f-8bd5-61b5c3cf410b", stageNumber: 1, reviewer: { id, displayName: "Other" }, status: "APPROVED" },
            { slotId: "9bb91ef4-5982-405f-8bd5-61b5c3cf410b", stageNumber: 2, reviewer: { id, displayName: "Future" }, status: "WAITING" },
        ], availableActions: [],
    };
    return { task, detail, definition };
}
test("shows progress for the current stage only", async () =>
{
    vi.mocked(readApprovalTaskResult).mockResolvedValueOnce(taskFixture());
    render(<MemoryRouter initialEntries={["/reviews/task"]}><Routes><Route path="/reviews/:taskId" element={<ReviewTaskPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText("1 of 2 approved; 1 remaining")).toBeVisible();
});
test("denial shows a safe state without request content", async () =>
{
    vi.mocked(readApprovalTaskResult).mockRejectedValueOnce(new Error("private reason"));
    render(<MemoryRouter initialEntries={["/reviews/task"]}><Routes><Route path="/reviews/:taskId" element={<ReviewTaskPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This task is unavailable."));
    expect(screen.queryByText("private reason")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved request")).not.toBeInTheDocument();
    expect(screen.queryByText(/Request ID:/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry|Reload task/ })).not.toBeInTheDocument();
});

test.each([401, 403, 404, 422])("shows a safe terminal state after %i", async (status) =>
{
    vi.mocked(readApprovalTaskResult).mockRejectedValueOnce(new ApiFailure({ kind: "http", status, message: "private error", requestId: "private-id" }));
    render(<MemoryRouter initialEntries={["/reviews/task"]}><Routes><Route path="/reviews/:taskId" element={<ReviewTaskPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("This task is unavailable.");
    expect(screen.queryByText("private error")).not.toBeInTheDocument();
    expect(screen.queryByText("Saved request")).not.toBeInTheDocument();
    expect(screen.queryByText(/Request ID:|private-id/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry|Reload task/ })).not.toBeInTheDocument();
});

test("retries a network failure without showing a support ID", async () =>
{
    vi.mocked(readApprovalTaskResult).mockRejectedValueOnce(new ApiFailure({ kind: "network", message: "private error", requestId: "private-id" })).mockResolvedValueOnce(taskFixture());
    render(<MemoryRouter initialEntries={["/reviews/task"]}><Routes><Route path="/reviews/:taskId" element={<ReviewTaskPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this task. Please try again.");
    expect(screen.queryByText(/Request ID:|private-id|private error/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("1 of 2 approved; 1 remaining")).toBeVisible();
});

test.each([500, 503])("shows safe support ID and retries after %i", async (status) =>
{
    const requestId = "7bb91ef4-5982-405f-8bd5-61b5c3cf410b";
    vi.mocked(readApprovalTaskResult).mockRejectedValueOnce(new ApiFailure({ kind: "http", status, message: "private error", requestId })).mockResolvedValueOnce(taskFixture());
    render(<MemoryRouter initialEntries={["/reviews/task"]}><Routes><Route path="/reviews/:taskId" element={<ReviewTaskPage />} /></Routes></MemoryRouter>);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load this task. Please try again.");
    expect(alert).toHaveTextContent(`Request ID: ${requestId}`);
    expect(screen.getByText(`Request ID: ${requestId}`)).toHaveClass("select-text");
    expect(alert).not.toHaveTextContent("private error");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("1 of 2 approved; 1 remaining")).toBeVisible();
    expect(readApprovalTaskResult).toHaveBeenCalledTimes(2);
});
test("reloads a stale task without showing private content", async () =>
{
    const fixture = taskFixture();
    vi.mocked(readApprovalTaskResult).mockResolvedValueOnce({ ...fixture, detail: { ...fixture.detail, currentStageNumber: 2 } }).mockResolvedValueOnce(fixture);
    render(<MemoryRouter initialEntries={["/reviews/task"]}><Routes><Route path="/reviews/:taskId" element={<ReviewTaskPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("This task is unavailable.");
    expect(screen.queryByRole("region", { name: "Task summary" })).not.toBeInTheDocument();
    expect(screen.queryByText("Saved request")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload task" }));
    expect(await screen.findByText("1 of 2 approved; 1 remaining")).toBeVisible();
});

test.each([403, 404])("a decision %i clears previously loaded private content", async (status) =>
{
    vi.mocked(readApprovalTaskResult).mockResolvedValueOnce(taskFixture());
    vi.spyOn(DecisionAttempt.prototype, "Submit").mockRejectedValue(new ApiFailure({ kind: "http", status, message: "denied" }));
    render(<MemoryRouter initialEntries={["/reviews/task"]}><Routes><Route path="/reviews/:taskId" element={<ReviewTaskPage />} /></Routes></MemoryRouter>);
    await screen.findByText("Saved request");
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("unavailable");
    expect(screen.queryByText("Saved request")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Task summary" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm approval" })).not.toBeInTheDocument();
});
test("handled task shows read-only history without current request content or actions", async () =>
{
    vi.mocked(readApprovalTaskResult).mockResolvedValueOnce({ task: { ...taskFixture().task, status: "APPROVED", canCurrentUserDecide: false }, detail: null, definition: null });
    render(<MemoryRouter initialEntries={["/reviews/task"]}><Routes><Route path="/reviews/:taskId" element={<ReviewTaskPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByRole("region", { name: "Handled task" })).toHaveTextContent("Read-only handled task");
    expect(screen.getByText("Persisted history")).toBeVisible();
    expect(screen.queryByText("Saved request")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
});
