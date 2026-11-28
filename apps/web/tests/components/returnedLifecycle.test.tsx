import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";
import { RequestEditPage } from "../../app/modules/requests/RequestEditPage";
import { requestApi } from "../../app/api/requests";
import { ApiFailure } from "../../app/api/errors";
import { definition, draft, id } from "../helpers/requestLifecycle";

vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => ({ generation: 1, user: { id, roles: ["REQUESTER"], department: { id: "new", name: "New department" } } }) }));
vi.mock("../../app/api/requests", () => ({ requestApi: { read: vi.fn(), version: vi.fn(), type: vi.fn(), types: vi.fn(), patch: vi.fn(), submit: vi.fn(), resubmit: vi.fn(), listAttachments: vi.fn() } }));
const show = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
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
    if (show) Object.defineProperty(HTMLDialogElement.prototype, "showModal", show); else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
    if (close) Object.defineProperty(HTMLDialogElement.prototype, "close", close); else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});
afterEach(() => 
{
 vi.resetAllMocks(); vi.restoreAllMocks(); 
});
const pinned = { ...definition, isEnabled: false, fields: [{ key: "category", kind: "SELECT" as const, label: { en: "Category" }, required: true, constraints: { options: [{ value: "OLD", label: { en: "Pinned option" } }] } }] };
const returned = { ...draft, title: "Returned title", justification: "Reason", status: "RETURNED" as const, requestNumber: "REQ-00000001", department: { id, code: "OLD", name: "Original department", isActive: true }, availableActions: ["EDIT_DRAFT", "RESUBMIT"], workingRevision: { ...draft.workingRevision!, fields: { category: "OLD" } } };
function setup(detail = returned, form = pinned)
{
    vi.mocked(requestApi.read).mockResolvedValue(detail);
    vi.mocked(requestApi.version).mockResolvedValue(form);
    vi.mocked(requestApi.type).mockResolvedValue({ ...pinned, versionId: id, versionNumber: 2, fields: [] });
    vi.mocked(requestApi.listAttachments).mockResolvedValue({ items: [], pagination: { currentPage: 1, pageSize: 100, totalPages: 1, totalCount: 0, hasPrevious: false, hasNext: false } });
    return render(<RouterProvider router={createMemoryRouter([{ path: "/requests/:id/edit", Component: RequestEditPage }], { initialEntries: [`/requests/${id}/edit`] })} />);
}
async function review(user: ReturnType<typeof userEvent.setup>)
{
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.click(screen.getByRole("button", { name: "Resubmit request" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("new cycle");
    await user.click(screen.getByRole("button", { name: "Confirm resubmission" }));
}

test("returned edits keep pinned form and identity, save then resubmit authoritative result", async () =>
{
    const saved = { ...returned, title: "Returned title changed", version: 3 };
    vi.mocked(requestApi.patch).mockResolvedValue(saved);
    vi.mocked(requestApi.resubmit).mockResolvedValue({ ...saved, status: "PENDING", version: 4, submittedRevision: saved.workingRevision });
    setup();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Title (required)"), " changed");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Request type (required)")).toBeDisabled();
    expect(screen.getByText("Definition version 1")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    await screen.findByText(/Changes saved/);
    expect(requestApi.patch).toHaveBeenCalledWith(id, { expectedVersion: 2, title: saved.title }, expect.any(String));
    await review(user);
    expect(await screen.findByRole("heading", { name: "Request submitted" })).toBeVisible();
    expect(requestApi.resubmit).toHaveBeenCalledWith(id, 3, expect.any(String));
    expect(requestApi.submit).not.toHaveBeenCalled();
    expect(requestApi.types).not.toHaveBeenCalled();
    expect(requestApi.type).not.toHaveBeenCalled();
    expect(screen.getByText("Original department")).toBeVisible();
    expect(screen.getByText("REQ-00000001")).toBeVisible();
    expect(screen.getByText("Pinned option")).toBeVisible();
});

test("unchanged save revalidates while unchanged resubmit does not read again", async () =>
{
    vi.mocked(requestApi.resubmit).mockResolvedValue({ ...returned, status: "PENDING", version: 3, submittedRevision: returned.workingRevision });
    setup();
    const user = userEvent.setup();
    await screen.findByLabelText("Title (required)");
    expect(requestApi.read).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    await screen.findByText(/Changes saved/);
    expect(requestApi.read).toHaveBeenCalledTimes(2);
    expect(requestApi.patch).not.toHaveBeenCalled();
    await review(user);
    expect(await screen.findByRole("heading", { name: "Request submitted" })).toBeVisible();
    expect(requestApi.read).toHaveBeenCalledTimes(2);
});

test.each([false, true])("resubmit maps amount or indexed item validation with values retained (items=%s)", async (items) =>
{
    const form = { ...pinned, monetary: true, supportsLineItems: items };
    const item = { id, description: "Retained part", quantity: "1", unitAmount: "10.00", totalAmount: "10.00" };
    const detail = { ...returned, workingRevision: { ...returned.workingRevision, amount: "10.00", currency: "THB", lineItems: items ? [item] : [] } };
    const field = items ? "lineItems[0].quantity" : "monetaryAmount";
    vi.mocked(requestApi.resubmit).mockRejectedValueOnce(new ApiFailure({ kind: "http", status: 422, message: "Validation failed", details: [{ field, code: "VALIDATION_ERROR", message: "Invalid amount" }] }));
    setup(detail, form);
    const user = userEvent.setup();
    await screen.findByLabelText("Title (required)");
    await review(user);
    const input = await screen.findByLabelText(items ? "Quantity (item 1)" : "Amount (THB, required)");
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveValue(items ? "1" : "10.00");
    expect(screen.queryByRole("heading", { name: "Request submitted" })).not.toBeInTheDocument();
});

test.each([
    { field: "title", label: "Title (required)", value: "Returned title" },
    { field: "fields.category", label: "Category (required)", value: "OLD" },
])("resubmit maps $field validation and retains inputs", async ({ field, label, value }) =>
{
    vi.mocked(requestApi.resubmit).mockRejectedValueOnce(new ApiFailure({ kind: "http", status: 422, message: "Validation failed", details: [{ field, code: "VALIDATION_ERROR", message: "Invalid value" }] }));
    setup();
    const user = userEvent.setup();
    await screen.findByLabelText("Title (required)");
    await review(user);
    const input = await screen.findByLabelText(label);
    await waitFor(() => expect(input).toHaveFocus());
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveValue(value);
    expect(screen.queryByRole("heading", { name: "Request submitted" })).not.toBeInTheDocument();
    expect(requestApi.patch).not.toHaveBeenCalled();
});

test.each([
    new ApiFailure({ kind: "http", status: 422, code: "CONFIGURATION_INCOMPLETE", message: "Configuration incomplete" }),
    new ApiFailure({ kind: "network", message: "Network unavailable" }),
])("resubmit failure preserves values and requires explicit confirmation to retry", async (failure) =>
{
    const pending = { ...returned, status: "PENDING" as const, version: 3, submittedRevision: returned.workingRevision };
    vi.mocked(requestApi.resubmit).mockRejectedValueOnce(failure).mockResolvedValueOnce(pending);
    setup();
    const user = userEvent.setup();
    await screen.findByLabelText("Title (required)");
    await review(user);
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByText("Returned title")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Request submitted" })).not.toBeInTheDocument();
    expect(requestApi.resubmit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Resubmit request" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(requestApi.resubmit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Confirm resubmission" }));
    expect(await screen.findByRole("heading", { name: "Request submitted" })).toBeVisible();
    expect(vi.mocked(requestApi.resubmit).mock.calls[0]).toEqual(vi.mocked(requestApi.resubmit).mock.calls[1]);
});

test("stale resubmit blocks editing actions until explicit reload and uses a fresh attempt", async () =>
{
    const fresh = { ...returned, title: "Fresh saved title", version: 5 };
    vi.mocked(requestApi.resubmit).mockRejectedValueOnce(new ApiFailure({ kind: "http", status: 409, code: "REQUEST_STALE", message: "Stale request" })).mockResolvedValueOnce({ ...fresh, status: "PENDING", version: 6, submittedRevision: fresh.workingRevision });
    setup();
    const user = userEvent.setup();
    await screen.findByLabelText("Title (required)");
    await review(user);
    const reload = await screen.findByRole("button", { name: "Reload saved draft" });
    expect(screen.getByRole("button", { name: "Save Draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Resubmit request" })).toBeDisabled();
    expect(screen.getByText("Returned title")).toBeVisible();
    const reads = vi.mocked(requestApi.read).mock.calls.length;
    const confirmation = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(reload);
    expect(requestApi.read).toHaveBeenCalledTimes(reads);
    expect(screen.getByText("Returned title")).toBeVisible();
    vi.mocked(requestApi.read).mockResolvedValue(fresh);
    await user.click(reload);
    expect(await screen.findByLabelText("Title (required)")).toHaveValue("Fresh saved title");
    expect(requestApi.version).toHaveBeenCalledTimes(2);
    expect(requestApi.resubmit).toHaveBeenCalledTimes(1);
    await review(user);
    expect(await screen.findByRole("heading", { name: "Request submitted" })).toBeVisible();
    const calls = vi.mocked(requestApi.resubmit).mock.calls;
    expect(calls[1]).toEqual([id, 5, expect.any(String)]);
    expect(calls[1]![2]).not.toBe(calls[0]![2]);
    expect(confirmation).toHaveBeenCalledTimes(2);
});
