import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, MemoryRouter, RouterProvider } from "react-router";
import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { RequestEditPage } from "../../app/modules/requests/RequestEditPage";
import { RequestOwnerActions } from "../../app/modules/requests/RequestOwnerActions";
import { requestApi } from "../../app/api/requests";
import { ApiFailure } from "../../app/api/errors";
import { definition, draft, id } from "../helpers/requestLifecycle";
vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => ({ generation: 1, user: { id: "7bb91ef4-5982-405f-8bd5-61b5c3cf410b", roles: ["REQUESTER"] } }) }));
vi.mock("../../app/api/requests", () => ({ requestApi: { read: vi.fn(), version: vi.fn(), type: vi.fn(), types: vi.fn(), create: vi.fn(), patch: vi.fn(), withdraw: vi.fn() } }));
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
    if (show) Object.defineProperty(HTMLDialogElement.prototype, "showModal", show);
    else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
    if (close) Object.defineProperty(HTMLDialogElement.prototype, "close", close);
    else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});
test("resume route restores incomplete content, saves without completeness, and focuses server field errors", async () =>
{
    vi.mocked(requestApi.read).mockResolvedValue(draft);
    vi.mocked(requestApi.version).mockResolvedValue(definition);
    vi.mocked(requestApi.types).mockResolvedValue({ items: [definition], pagination: { currentPage: 1, pageSize: 100, totalCount: 1, totalPages: 1, hasNext: false, hasPrevious: false } });
    vi.mocked(requestApi.patch).mockRejectedValueOnce(new ApiFailure({ kind: "http", status: 422, message: "Invalid title", details: [{ field: "title", code: "VALIDATION_ERROR", message: "Invalid title" }] })).mockResolvedValue({ ...draft, title: "Changed", version: 3 });
    const user = userEvent.setup();
    render(<RouterProvider router={createMemoryRouter([{ path: "/requests/:id/edit", Component: RequestEditPage }], { initialEntries: [`/requests/${id}/edit`] })} />);
    const title = await screen.findByLabelText("Title (required)");
    expect(title).toHaveValue("Saved incomplete");
    expect(screen.getByLabelText("Justification (required)")).toHaveValue("");
    await user.clear(title);
    await user.type(title, "Changed");
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(screen.getByLabelText("Title (required)")).toHaveFocus());
    expect(screen.getByLabelText("Title (required)")).toHaveValue("Changed");
    expect(requestApi.patch).toHaveBeenCalledWith(id, { expectedVersion: 2, title: "Changed" }, expect.any(String));
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Draft saved");
});
test("withdraw confirmation permits absent reason, guards busy, and renders server result", async () =>
{
    const pending = { ...draft, status: "PENDING" as const, availableActions: ["WITHDRAW"], requestNumber: "REQ-00000001" };
    let finish!: (value: typeof draft) => void;
    vi.mocked(requestApi.withdraw).mockReturnValue(new Promise((resolve) => finish = resolve));
    const changed = vi.fn();
    const user = userEvent.setup();
    render(<MemoryRouter><RequestOwnerActions detail={pending} onChanged={changed} /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    const confirm = screen.getByRole("button", { name: "Confirm withdrawal" });
    expect(confirm).toBeEnabled();
    await user.click(confirm);
    expect(screen.getByRole("button", { name: "Withdrawing…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(requestApi.withdraw).toHaveBeenCalledTimes(1);
    expect(requestApi.withdraw).toHaveBeenCalledWith(id, { expectedVersion: 2 }, expect.any(String), 1);
    finish({ ...draft, status: "WITHDRAWN", version: 3 });
    await waitFor(() => expect(changed).toHaveBeenCalledWith(expect.objectContaining({ status: "WITHDRAWN", version: 3 })));
});
test("stale withdrawal preserves reason, requires reload and confirms refreshed version", async () =>
{
    const pending = { ...draft, status: "PENDING" as const, availableActions: ["WITHDRAW"] };
    vi.mocked(requestApi.withdraw).mockRejectedValueOnce(new ApiFailure({ kind: "http", status: 409, code: "REQUEST_STALE", message: "Stale request" })).mockResolvedValue({ ...draft, status: "WITHDRAWN", version: 5 });
    vi.mocked(requestApi.read).mockResolvedValue({ ...pending, version: 4 });
    const user = userEvent.setup();
    render(<MemoryRouter><RequestOwnerActions detail={pending} /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    await user.type(screen.getByLabelText("Reason (optional)"), "Keep this reason");
    await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Stale request");
    expect(screen.getByRole("button", { name: "Confirm withdrawal" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Reload request" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm withdrawal" })).toBeEnabled());
    expect(screen.getByLabelText("Reason (optional)")).toHaveValue("Keep this reason");
    await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
    expect(requestApi.withdraw).toHaveBeenLastCalledWith(id, { expectedVersion: 4, reason: "Keep this reason" }, expect.any(String), 1);
});
test.each([403, 404])("withdrawal %s refreshes parent permission scope", async (status) =>
{
    vi.mocked(requestApi.withdraw).mockRejectedValue(new ApiFailure({ kind: "http", status, message: "Unavailable" }));
    const unavailable = vi.fn();
    const user = userEvent.setup();
    render(<MemoryRouter><RequestOwnerActions detail={{ ...draft, status: "PENDING", availableActions: ["WITHDRAW"] }} onUnavailable={unavailable} /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
    await waitFor(() => expect(unavailable).toHaveBeenCalledOnce());
    expect(screen.getByRole("alert")).toHaveTextContent(status === 403 ? "You do not have access" : "This request is unavailable");
});
test("foreign and terminal requests offer no owner mutations", () =>
{
    const view = render(<MemoryRouter><RequestOwnerActions detail={{ ...draft, requester: { ...draft.requester, id: definition.versionId } }} /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: "Resume draft" })).not.toBeInTheDocument();
    view.rerender(<MemoryRouter><RequestOwnerActions detail={{ ...draft, status: "WITHDRAWN" }} /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "Withdraw" })).not.toBeInTheDocument();
});

test("review: withdrawal conflict reload needs only current request and Escape refreshes parent", async () =>
{
    const pending = { ...draft, status: "PENDING" as const, availableActions: ["WITHDRAW"] };
    vi.mocked(requestApi.withdraw).mockRejectedValue(new ApiFailure({ kind: "http", status: 409, code: "REQUEST_STALE", message: "Stale request" }));
    vi.mocked(requestApi.read).mockResolvedValue({ ...pending, status: "WITHDRAWN", version: 4, availableActions: [] });
    vi.mocked(requestApi.version).mockRejectedValue(new Error("Definition endpoint unavailable"));
    const changed = vi.fn();
    const user = userEvent.setup();
    render(<MemoryRouter><RequestOwnerActions detail={pending} onChanged={changed} /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
    await user.click(await screen.findByRole("button", { name: "Reload request" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Current server status: Withdrawn"));
    expect(requestApi.version).not.toHaveBeenCalled();
    fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ status: "WITHDRAWN", version: 4 }));
});

test("review: withdrawal permission lost during conflict reload refreshes parent scope", async () =>
{
    vi.mocked(requestApi.withdraw).mockRejectedValue(new ApiFailure({ kind: "http", status: 409, message: "Stale" }));
    vi.mocked(requestApi.read).mockRejectedValue(new ApiFailure({ kind: "http", status: 403, message: "Forbidden" }));
    const unavailable = vi.fn();
    const user = userEvent.setup();
    render(<MemoryRouter><RequestOwnerActions detail={{ ...draft, status: "PENDING", availableActions: ["WITHDRAW"] }} onUnavailable={unavailable} /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Withdraw" }));
    await user.click(screen.getByRole("button", { name: "Confirm withdrawal" }));
    await user.click(await screen.findByRole("button", { name: "Reload request" }));
    await waitFor(() => expect(unavailable).toHaveBeenCalledOnce());
});

function editableFixture(detail = draft, form = definition)
{
    vi.mocked(requestApi.read).mockResolvedValue(detail);
    vi.mocked(requestApi.version).mockResolvedValue(form);
    vi.mocked(requestApi.types).mockResolvedValue({ items: [definition], pagination: { currentPage: 1, pageSize: 100, totalCount: 1, totalPages: 1, hasNext: false, hasPrevious: false } });
    return render(<RouterProvider router={createMemoryRouter([{ path: "/requests/:id/edit", Component: RequestEditPage }], { initialEntries: [`/requests/${id}/edit`] })} />);
}

test.each([403, 404])("review: draft save %s removes protected editor instead of leaving a writable form", async (status) =>
{
    vi.mocked(requestApi.patch).mockRejectedValue(new ApiFailure({ kind: "http", status, message: "Unavailable" }));
    editableFixture();
    const user = userEvent.setup();
    const title = await screen.findByLabelText("Title (required)");
    await user.type(title, " change");
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(screen.queryByLabelText("Title (required)")).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "My Requests" })).toBeVisible();
});

test("review: stale draft offers explicit reload; cancel keeps inputs and confirmed reload resets expectedVersion", async () =>
{
    vi.mocked(requestApi.patch).mockRejectedValueOnce(new ApiFailure({ kind: "http", status: 409, code: "REQUEST_STALE", message: "Reload before editing" })).mockResolvedValue({ ...draft, version: 6 });
    editableFixture();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Title (required)"), " local");
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    const reload = await screen.findByRole("button", { name: "Reload saved draft" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.click(reload);
    expect(screen.getByLabelText("Title (required)")).toHaveValue("Saved incomplete local");
    expect(requestApi.read).toHaveBeenCalledTimes(1);
    confirm.mockReturnValue(true);
    vi.mocked(requestApi.read).mockResolvedValue({ ...draft, title: "Server edit", version: 5 });
    await user.click(reload);
    await waitFor(() => expect(screen.getByLabelText("Title (required)")).toHaveValue("Server edit"));
    await user.type(screen.getByLabelText("Title (required)"), " after reload");
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    expect(requestApi.patch).toHaveBeenLastCalledWith(id, { title: "Server edit after reload", expectedVersion: 5 }, expect.any(String));
});

test("review: recoverable draft server error retains input and support Request ID", async () =>
{
    vi.mocked(requestApi.patch).mockRejectedValue(new ApiFailure({ kind: "http", status: 503, message: "Unavailable", requestId: "support-issue6" }));
    editableFixture();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Title (required)"), " retained");
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("support-issue6"));
    expect(screen.getByLabelText("Title (required)")).toHaveValue("Saved incomplete retained");
});

test("review: explicit updated-form review can remove obsolete monetary authority without trapping draft saves", async () =>
{
    const oldDefinition = { ...definition, monetary: true };
    const oldDraft = { ...draft, workingRevision: { ...draft.workingRevision!, amount: "12.00", currency: "THB" } };
    vi.mocked(requestApi.patch).mockRejectedValueOnce(new ApiFailure({ kind: "http", status: 409, code: "FORM_DEFINITION_CHANGED", message: "Review updated form" })).mockResolvedValue({ ...draft, version: 3 });
    editableFixture(oldDraft, oldDefinition);
    const newVersion = "9bb91ef4-5982-405f-8bd5-61b5c3cf410b";
    vi.mocked(requestApi.type).mockResolvedValue({ ...definition, versionId: newVersion, versionNumber: 2 });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Title (required)"), " keep");
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    await user.click(await screen.findByRole("button", { name: "Review updated form" }));
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    expect(requestApi.patch).toHaveBeenLastCalledWith(id, expect.objectContaining({ expectedVersion: 2, formDefinitionVersionId: newVersion, monetaryAmount: null }), expect.any(String));
    expect(confirm).toHaveBeenCalled();
});

test("review: returning to completed Review step validates edited amounts before computing totals", async () =>
{
    const itemDefinition = { ...definition, supportsLineItems: true, monetary: true };
    const itemDraft = { ...draft, justification: "Needed", workingRevision: { ...draft.workingRevision!, amount: "1.00", currency: "THB", lineItems: [{ id, description: "Part", quantity: "1", unitAmount: "1.00", totalAmount: "1.00" }] } };
    editableFixture(itemDraft, itemDefinition);
    const user = userEvent.setup();
    await screen.findByLabelText("Title (required)");
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    const quantity = screen.getByLabelText("Quantity (item 1)");
    await user.clear(quantity);
    await user.type(quantity, "invalid");
    await user.click(screen.getByRole("button", { name: /Review & Submit/ }));
    expect(screen.getByLabelText("Quantity (item 1)")).toHaveFocus();
    expect(screen.getByRole("heading", { name: "Items & Attachments" })).toBeVisible();
});

test("B02 type change replaces edit resource URL, keeps step, and unchanged retry creates no duplicate", async () =>
{
    const other = { ...definition, id: "9bb91ef4-5982-405f-8bd5-61b5c3cf410b", code: "OTHER", name: { en: "Other" } };
    const saved = { ...draft, id: "abb91ef4-5982-405f-8bd5-61b5c3cf410b", typeId: other.id, typeCode: other.code, title: "", version: 0 };
    vi.mocked(requestApi.read).mockImplementation(async (requestId) => requestId === saved.id ? saved : draft);
    vi.mocked(requestApi.version).mockImplementation(async (typeId) => typeId === other.id ? other : definition);
    vi.mocked(requestApi.types).mockResolvedValue({ items: [definition, other], pagination: { currentPage: 1, pageSize: 100, totalCount: 2, totalPages: 1, hasNext: false, hasPrevious: false } });
    vi.mocked(requestApi.create).mockResolvedValue(saved);
    const router = createMemoryRouter([{ path: "/requests/:id/edit", Component: RequestEditPage }], { initialEntries: [`/requests/${id}/edit`] });
    render(<RouterProvider router={router} />);
    const user = userEvent.setup();
    await screen.findByLabelText("Title (required)");
    await user.click(screen.getByRole("button", { name: "Back" }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await user.selectOptions(screen.getByLabelText("Request type (required)"), other.id);
    expect(screen.getByLabelText("Request type (required)")).toHaveValue(definition.id);
    expect(requestApi.create).not.toHaveBeenCalled();
    expect(requestApi.patch).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    await user.selectOptions(screen.getByLabelText("Request type (required)"), other.id);
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/requests/${saved.id}/edit`));
    expect(router.state.historyAction).toBe("REPLACE");
    await waitFor(() => expect(screen.getByLabelText("Request type (required)")).toHaveValue(other.id));
    expect(screen.getByRole("heading", { name: "Request Type" })).toBeVisible();
    expect(confirm).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Save Draft" }));
    await screen.findByText(/Draft saved/);
    expect(requestApi.create).toHaveBeenCalledTimes(1);
    expect(requestApi.patch).not.toHaveBeenCalled();
});
