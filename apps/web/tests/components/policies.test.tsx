import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import type { ApprovalPolicyDTO, UserRole } from "@workflow/contracts";
import { ApprovalPolicyEditorPage } from "../../app/modules/admin/policies/ApprovalPolicyEditorPage";
import { ConfigurationListPage } from "../../app/modules/admin/policies/ConfigurationListPage";
import { ApiFailure } from "../../app/api/errors";
import { searchConfiguration, policyAction, lookupSelection } from "../../app/services/configurationService";
let roles: UserRole[] = ["ADMINISTRATOR"];
vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => ({ generation: 0, user: { id: "admin", roles } }) }));
vi.mock("../../app/services/configurationService", async () =>
{
    const actual = await vi.importActual<typeof import("../../app/services/configurationService")>("../../app/services/configurationService");
    return { ...actual, searchConfiguration: vi.fn(), policyAction: vi.fn(), lookupSelection: vi.fn() };
});
const policy: ApprovalPolicyDTO = {
    id: "11111111-1111-4111-8111-111111111111", code: "ROUTING", typeId: "22222222-2222-4222-8222-222222222222",
    versionId: null, versionNumber: null, isPublished: false, isEnabled: true, priority: 10,
    departmentId: null, minAmount: null, maxAmount: null, version: 0,
    stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 480 }],
};
const pagination = { currentPage: 1, pageSize: 20, totalPages: 1, totalCount: 1, hasNext: false, hasPrevious: false };
function renderEditor(id = policy.id)
{
    return render(<RouterProvider router={createMemoryRouter([{ path: "/admin/approval-policies/:id", element: <ApprovalPolicyEditorPage /> }], { initialEntries: [`/admin/approval-policies/${id}`] })} />);
}
beforeEach(() =>
{
    roles = ["ADMINISTRATOR"];
    vi.mocked(searchConfiguration).mockResolvedValue({ items: [policy], pagination });
    vi.mocked(lookupSelection).mockImplementation(async (_kind, id) => ({ id, label: `Label ${id}` }));
});
test("PRB-AC-05 nonadmin cannot load policy or configuration directory", () =>
{
    roles = ["REQUESTER"];
    const { unmount } = renderEditor();
    expect(screen.getByRole("alert")).toHaveTextContent("Administrator access required");
    unmount();
    render(<ConfigurationListPage kind="reviewer-assignments" />);
    expect(searchConfiguration).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("Administrator access required");
});
test("PRB-AC-02/08 local preview handles temporarily invalid money without crashing or calling simulation API", async () =>
{
    const user = userEvent.setup();
    renderEditor();
    await screen.findByRole("heading", { name: "Policy ROUTING" });
    await user.type(screen.getByLabelText("Sample amount"), "20.20");
    expect(screen.getByRole("complementary")).toHaveTextContent("Amount matches");
    await user.type(screen.getByLabelText("Minimum amount (inclusive, optional)"), "invalid");
    expect(screen.getByRole("complementary")).toHaveTextContent("Local explanation only");
    await user.click(screen.getByRole("button", { name: "Add stage 2" }));
    expect(screen.getByRole("heading", { name: "Stage 2 — ALL must approve" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add stage 3" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Publish version" })).toBeDisabled();
    expect(policyAction).not.toHaveBeenCalled();
});
test("PRB-AC-09 stale draft save keeps edits and offers explicit reload", async () =>
{
    const user = userEvent.setup();
    vi.mocked(policyAction).mockRejectedValue(new ApiFailure({ kind: "http", status: 409, code: "CONFLICT", message: "Request conflict" }));
    renderEditor();
    await screen.findByRole("heading", { name: "Policy ROUTING" });
    const priority = screen.getByLabelText("Numeric priority");
    await user.clear(priority);
    await user.type(priority, "99");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Configuration changed");
    expect(priority).toHaveValue(99);
    vi.mocked(searchConfiguration).mockResolvedValue({ items: [{ ...policy, priority: 20, version: 1 }], pagination });
    await user.click(screen.getByRole("button", { name: "Reload server version" }));
    await waitFor(() => expect(screen.getByLabelText("Numeric priority")).toHaveValue(20));
});
test("PRB-AC-01 published form stays read-only without perpetual busy state", async () =>
{
    vi.mocked(searchConfiguration).mockResolvedValue({ items: [{ ...policy, isPublished: true, versionId: "33333333-3333-4333-8333-333333333333", versionNumber: 1 }], pagination });
    renderEditor();
    await screen.findByRole("heading", { name: "Policy ROUTING" });
    expect(screen.getByLabelText("Numeric priority")).toBeDisabled();
    expect(screen.getByLabelText("Sample amount")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Branch new draft" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
});
