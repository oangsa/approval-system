import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { expect, test, vi } from "vitest";
import { ReviewTaskPage } from "../../app/modules/reviews/ReviewTaskPage";
import { readApprovalTaskResult } from "../../app/services/approvalTaskService";
import type { ApprovalTask, PublishedRequestType, RequestDetail } from "@workflow/contracts";

vi.mock("../../app/services/approvalTaskService", () => ({ readApprovalTaskResult: vi.fn() }));
vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => ({ status: "authenticated", user: { id: "reviewer", roles: ["REVIEWER"] }, generation: 0 }) }));
test("shows progress for the current stage only", async () =>
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
    vi.mocked(readApprovalTaskResult).mockResolvedValueOnce({ task, detail, definition });
    render(<MemoryRouter initialEntries={["/reviews/task"]}><Routes><Route path="/reviews/:taskId" element={<ReviewTaskPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText("1 of 2 approved; 1 remaining")).toBeVisible();
});
test("denial shows a safe state without request content", async () =>
{
    vi.mocked(readApprovalTaskResult).mockRejectedValueOnce(new Error("private reason"));
    render(<MemoryRouter initialEntries={["/reviews/task"]}><Routes><Route path="/reviews/:taskId" element={<ReviewTaskPage />} /></Routes></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("This task is unavailable."));
    expect(screen.queryByText("private reason")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
});
