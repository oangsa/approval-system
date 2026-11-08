import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { ApprovalTask, DecisionResult } from "@workflow/contracts";
import { DecisionActions } from "../../app/modules/reviews/DecisionActions";
import { DecisionAttempt } from "../../app/services/decisionService";
import { refreshAfterDecision } from "../../app/services/approvalTaskService";
vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => ({ generation: 0 }) }));
vi.mock("../../app/modules/requests/AuditTimeline", () => ({ AuditTimeline: () => <p>Persisted decision history</p> }));
vi.mock("../../app/modules/reviews/DecisionDialog", () => ({ DecisionDialog: ({ onConfirm, error }: { onConfirm: () => void; error: string }) => <><button onClick={onConfirm}>Confirm approval</button>{error && <p role="alert">{error}</p>}</> }));
vi.mock("../../app/services/approvalTaskService", () => ({ refreshAfterDecision: vi.fn() }));
const task: ApprovalTask = { id: "task", slotId: "task", requestId: "request", cycleId: "cycle", revisionId: "revision", stageNumber: 1, assignedReviewer: { id: "reviewer", displayName: "Reviewer" }, status: "ACTIONABLE", dueAt: null, canCurrentUserDecide: true, version: 0 };
const accepted: DecisionResult = { taskId: "task", slotId: "task", decisionId: "decision", decision: "APPROVE", decidedBy: "reviewer", decidedAt: "2026-11-08T00:00:00Z", requestStatus: "PENDING", currentStageNumber: 1, requestVersion: 2, taskVersion: 1 };
test("success shows authoritative current stage even when current request read is no longer permitted", async () =>
{
    vi.spyOn(DecisionAttempt.prototype, "Submit").mockResolvedValue(accepted);
    vi.mocked(refreshAfterDecision).mockResolvedValue({ decision: accepted, detail: null, refreshFailed: false });
    render(<DecisionActions task={task} requestLabel="REQ-1" reason="" onReason={vi.fn()} onReload={vi.fn()} onAccepted={vi.fn()} onUnavailable={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Current stage: Stage 1");
});
test.each([403, 404])("permission denial %i closes the action and clears parent private content", async (status) =>
{
    const { ApiFailure } = await import("../../app/api/errors");
    vi.spyOn(DecisionAttempt.prototype, "Submit").mockRejectedValue(new ApiFailure({ kind: "http", status, message: "denied" }));
    const onUnavailable = vi.fn();
    render(<DecisionActions {...{ task, requestLabel: "REQ-1", reason: "", onReason: vi.fn(), onReload: vi.fn(), onAccepted: vi.fn(), onUnavailable }} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledOnce());
    expect(screen.queryByRole("button", { name: "Confirm approval" })).not.toBeInTheDocument();
});

test.each([500, 503])("server decision error %i shows a safe copyable support ID", async (status) =>
{
    const { ApiFailure } = await import("../../app/api/errors");
    vi.spyOn(DecisionAttempt.prototype, "Submit").mockRejectedValue(new ApiFailure({ kind: "http", status, message: "private database failure", requestId: "support-id" }));
    render(<DecisionActions task={task} requestLabel="REQ-1" reason="" onReason={vi.fn()} onReload={vi.fn()} onAccepted={vi.fn()} onUnavailable={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm approval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Request ID: support-id");
    expect(screen.queryByText("private database failure")).not.toBeInTheDocument();
});
