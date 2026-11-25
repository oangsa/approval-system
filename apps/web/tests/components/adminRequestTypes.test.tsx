import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterAll, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { AdminRequestTypeDetail, AdminRequestTypeSummary, PublishedRequestType, RequestTypeDraftDto, UserRole } from "@workflow/contracts";
import { RequestTypesListPage } from "../../app/modules/admin/requestTypes/RequestTypesListPage";
import { RequestTypeEditorPage } from "../../app/modules/admin/requestTypes/RequestTypeEditorPage";
import { RequestTypePreview } from "../../app/modules/admin/requestTypes/RequestTypePreview";
import { requestTypeApi } from "../../app/api/requestTypes";
import { ApiFailure } from "../../app/api/errors";

let currentRoles: UserRole[] = ["ADMINISTRATOR"];
vi.mock("../../app/modules/auth/sessionContext", () => ({
    useSession: () => ({ generation: 1, user: { id: "admin-1", displayName: "Admin", roles: currentRoles } }),
}));

vi.mock("../../app/api/requestTypes", () => ({
    requestTypeApi: {
        searchAdmin: vi.fn(),
        readAdmin: vi.fn(),
        readVersion: vi.fn(),
        create: vi.fn(),
        patchDraft: vi.fn(),
        branchDraft: vi.fn(),
        publish: vi.fn(),
        enable: vi.fn(),
        disable: vi.fn(),
    },
}));

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

beforeEach(() =>
{
    currentRoles = ["ADMINISTRATOR"];
    vi.clearAllMocks();
});

const typeId = "11111111-1111-4111-8111-111111111111";
const versionId = "22222222-2222-4222-8222-222222222222";

const summaryItem: AdminRequestTypeSummary = {
    id: typeId,
    code: "PROCURE",
    name: { en: "Procurement", th: "จัดซื้อ" },
    isEnabled: true,
    monetary: true,
    supportsLineItems: true,
    version: 1,
    publishedVersionId: versionId,
    publishedVersionNumber: 1,
    publishedAt: "2026-11-25T00:00:00.000Z",
    hasDraft: true,
    updatedAt: "2026-11-25T00:00:00.000Z",
};

const detailItem: AdminRequestTypeDetail = {
    id: typeId,
    code: "PROCURE",
    isEnabled: true,
    version: 1,
    publishedVersion: {
        id: typeId,
        code: "PROCURE",
        name: { en: "Procurement", th: "จัดซื้อ" },
        versionId,
        versionNumber: 1,
        isEnabled: true,
        monetary: true,
        supportsLineItems: true,
        fields: [],
        publishedAt: "2026-11-25T00:00:00.000Z",
    },
    draft: {
        name: { en: "Procurement", th: "จัดซื้อ" },
        monetary: true,
        supportsLineItems: true,
        fields: [
            {
                key: "urgentFlag",
                kind: "BOOLEAN",
                label: { en: "Urgent?" },
                required: false,
            },
            {
                key: "reason",
                kind: "TEXT",
                label: { en: "Urgent reason", th: "เหตุผลด่วน" },
                required: false,
                visibleWhen: { all: [{ fieldKey: "urgentFlag", operator: "EQ", value: false }] },
                requiredWhen: { all: [{ fieldKey: "urgentFlag", operator: "PRESENT" }] },
            },
        ],
    },
    versions: [{ versionId, versionNumber: 1, publishedAt: "2026-11-25T00:00:00.000Z" }],
    createdAt: "2026-11-25T00:00:00.000Z",
    updatedAt: "2026-11-25T00:00:00.000Z",
};

test("UI-12 non-admin receives forbidden view without calling admin APIs", () =>
{
    currentRoles = ["REQUESTER"];
    render(<RouterProvider router={createMemoryRouter([{ path: "/admin/request-types", Component: RequestTypesListPage }], { initialEntries: ["/admin/request-types"] })} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Administrator access is required");
    expect(requestTypeApi.searchAdmin).not.toHaveBeenCalled();

    render(<RouterProvider router={createMemoryRouter([{ path: "/admin/request-types/new", Component: RequestTypeEditorPage }], { initialEntries: ["/admin/request-types/new"] })} />);
    expect(requestTypeApi.create).not.toHaveBeenCalled();
});

test("UI-12 list page searches, disables with confirmation, and refreshes", async () =>
{
    vi.mocked(requestTypeApi.searchAdmin).mockResolvedValue({
        items: [summaryItem],
        pagination: { currentPage: 1, pageSize: 20, totalPages: 1, totalCount: 1, hasPrevious: false, hasNext: false },
    });
    vi.mocked(requestTypeApi.disable).mockResolvedValue({ ...summaryItem, isEnabled: false, version: 2 });

    const user = userEvent.setup();
    render(<RouterProvider router={createMemoryRouter([{ path: "/admin/request-types", Component: RequestTypesListPage }], { initialEntries: ["/admin/request-types"] })} />);

    expect(await screen.findAllByText("Procurement")).not.toHaveLength(0);
    await user.click(screen.getAllByRole("button", { name: "Disable" })[0]!);
    expect(screen.getByRole("dialog", { name: "Disable request type?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm disable" }));
    await waitFor(() => expect(requestTypeApi.disable).toHaveBeenCalledWith(typeId, { expectedVersion: 1 }, expect.any(String), 1));
});

test("UI-12 editor supports add/reorder, live shared-evaluator preview, 422/409 draft preservation, and publish confirmation", async () =>
{
    vi.mocked(requestTypeApi.readAdmin).mockResolvedValue(detailItem);
    vi.mocked(requestTypeApi.patchDraft)
        .mockRejectedValueOnce(new ApiFailure({ kind: "http", status: 422, code: "VALIDATION_ERROR", message: "Cyclic dependency", details: [{ field: "fields[0].key", code: "VALIDATION_ERROR", message: "Cyclic dependency" }] }))
        .mockRejectedValueOnce(new ApiFailure({ kind: "http", status: 409, code: "CONFLICT", message: "Version conflict" }))
        .mockResolvedValueOnce({
            id: typeId,
            code: "PROCURE",
            name: { en: "Procurement Edited", th: "จัดซื้อ" },
            isEnabled: true,
            monetary: true,
            supportsLineItems: true,
            fields: detailItem.draft!.fields,
            version: 2,
            publishedVersionId: versionId,
            publishedVersionNumber: 1,
            updatedAt: "2026-11-25T01:00:00.000Z",
        } satisfies RequestTypeDraftDto);
    vi.mocked(requestTypeApi.publish).mockResolvedValue({
        ...detailItem.publishedVersion!,
        versionId: "33333333-3333-4333-8333-333333333333",
        versionNumber: 2,
    } satisfies PublishedRequestType);

    const user = userEvent.setup();
    render(<RouterProvider router={createMemoryRouter([{ path: "/admin/request-types/:id", Component: RequestTypeEditorPage }], { initialEntries: [`/admin/request-types/${typeId}`] })} />);

    const nameInput = await screen.findByLabelText("English name (required)");
    expect(nameInput).toHaveValue("Procurement");

    // Live shared-evaluator preview reacts to boolean false as PRESENT.
    const preview = screen.getByRole("complementary", { name: "Live form preview" });
    const previewFlag = within(preview).getByLabelText("Urgent?");
    expect(within(preview).queryByLabelText(/Urgent reason/)).not.toBeInTheDocument();
    await user.selectOptions(previewFlag, "false");
    expect(within(preview).getByLabelText(/Urgent reason/)).toBeVisible();
    await user.selectOptions(within(preview).getByLabelText("Preview language"), "th");
    expect(within(preview).getByLabelText(/เหตุผลด่วน/)).toBeVisible();

    // Reorder field 2 up.
    await user.click(screen.getByRole("button", { name: "Move Urgent reason up" }));
    const fieldSections = screen.getAllByRole("region", { name: /^Field \d+:/ });
    expect(fieldSections[0]).toHaveAccessibleName("Field 1: Urgent reason");

    // Edit name, hit 422 and 409 while preserving editable input, then succeed on save.
    await user.clear(nameInput);
    await user.type(nameInput, "Procurement Edited");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cyclic dependency");
    expect(nameInput).toHaveValue("Procurement Edited");

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Version conflict");
    expect(screen.getByRole("button", { name: "Reload latest" })).toBeVisible();
    expect(nameInput).toHaveValue("Procurement Edited");

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Draft saved.");

    // Publish requires confirmation dialog.
    await user.click(screen.getByRole("button", { name: "Publish version" }));
    expect(screen.getByRole("dialog", { name: "Publish immutable version 2?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Confirm publish" }));
    await waitFor(() => expect(requestTypeApi.publish).toHaveBeenCalledWith(typeId, { expectedVersion: 2 }, expect.any(String), 1));
});

test("UI-12 ConditionBuilder preserves IN typing, surfaces incompatible operators, and Disable keeps unsaved draft edits", async () =>
{
    const detailWithDecimalAndSelect: AdminRequestTypeDetail = {
        ...detailItem,
        draft: {
            name: { en: "Procurement" },
            monetary: true,
            supportsLineItems: false,
            fields: [
                {
                    key: "amountCap",
                    kind: "DECIMAL",
                    label: { en: "Amount cap" },
                    required: false,
                },
                {
                    key: "category",
                    kind: "SELECT",
                    label: { en: "Category" },
                    required: true,
                    constraints: {
                        options: [
                            { value: "IT", label: { en: "IT" } },
                            { value: "OTHER", label: { en: "Other" } },
                        ],
                    },
                },
                {
                    key: "urgentFlag",
                    kind: "BOOLEAN",
                    label: { en: "Urgent?" },
                    required: false,
                },
                {
                    key: "note",
                    kind: "TEXT",
                    label: { en: "Note" },
                    required: false,
                    visibleWhen: {
                        all: [{ fieldKey: "amountCap", operator: "GT", value: "100.00" }],
                    },
                },
            ],
        },
    };
    vi.mocked(requestTypeApi.readAdmin).mockResolvedValue(detailWithDecimalAndSelect);
    vi.mocked(requestTypeApi.disable).mockResolvedValue({ ...summaryItem, isEnabled: false, version: 2 });
    vi.mocked(requestTypeApi.patchDraft).mockResolvedValue({
        id: typeId,
        code: "PROCURE",
        name: { en: "Unsaved Name" },
        isEnabled: true,
        monetary: true,
        supportsLineItems: false,
        fields: detailWithDecimalAndSelect.draft!.fields,
        version: 3,
        publishedVersionId: versionId,
        publishedVersionNumber: 1,
        updatedAt: "2026-11-25T02:00:00.000Z",
    });

    const user = userEvent.setup();
    render(<RouterProvider router={createMemoryRouter([{ path: "/admin/request-types/:id", Component: RequestTypeEditorPage }], { initialEntries: [`/admin/request-types/${typeId}`] })} />);

    const nameInput = await screen.findByLabelText("English name (required)");

    // Changing DECIMAL amountCap to TEXT surfaces GT (incompatible) instead of silently showing EQ.
    const amountKind = document.getElementById("fields[0].kind") as HTMLSelectElement;
    await user.selectOptions(amountKind, "TEXT");
    const noteOperator = document.getElementById("fields[3].visibleWhen.all.0.operator") as HTMLSelectElement;
    expect(noteOperator.value).toBe("GT");
    expect(within(noteOperator).getByRole("option", { name: "GT (incompatible)" })).toBeInTheDocument();

    // B04: typed IN membership controls for SELECT checkboxes, BOOLEAN checkboxes, and TEXT items preserving commas.
    const noteTarget = document.getElementById("fields[3].visibleWhen.all.0.field") as HTMLSelectElement;
    await user.selectOptions(noteTarget, "category");
    await user.selectOptions(noteOperator, "IN");
    const itCheckbox = document.getElementById("fields[3].visibleWhen.all.0.value.opt.0") as HTMLInputElement;
    const otherCheckbox = document.getElementById("fields[3].visibleWhen.all.0.value.opt.1") as HTMLInputElement;
    expect(itCheckbox).toBeChecked();
    expect(otherCheckbox).not.toBeChecked();
    await user.click(otherCheckbox);
    expect(otherCheckbox).toBeChecked();

    const noteSection = screen.getByRole("region", { name: "Field 4: Note" });
    await user.click(within(noteSection).getAllByRole("button", { name: "Add AND rule" })[1]!);
    const reqTarget = document.getElementById("fields[3].requiredWhen.all.0.field") as HTMLSelectElement;
    const reqOperator = document.getElementById("fields[3].requiredWhen.all.0.operator") as HTMLSelectElement;
    await user.selectOptions(reqTarget, "urgentFlag");
    await user.selectOptions(reqOperator, "IN");
    const trueCheckbox = document.getElementById("fields[3].requiredWhen.all.0.value.true") as HTMLInputElement;
    const falseCheckbox = document.getElementById("fields[3].requiredWhen.all.0.value.false") as HTMLInputElement;
    expect(trueCheckbox).toBeChecked();
    await user.click(falseCheckbox);
    expect(falseCheckbox).toBeChecked();

    // Also add a TEXT IN rule with comma-containing values via Add value.
    await user.click(within(noteSection).getAllByRole("button", { name: "Add AND rule" })[0]!);
    const textTarget = document.getElementById("fields[3].visibleWhen.all.1.field") as HTMLSelectElement;
    const textOperator = document.getElementById("fields[3].visibleWhen.all.1.operator") as HTMLSelectElement;
    await user.selectOptions(textTarget, "amountCap");
    await user.selectOptions(textOperator, "IN");
    const firstTextValue = document.getElementById("fields[3].visibleWhen.all.1.value") as HTMLInputElement;
    await user.type(firstTextValue, "Bangkok, Thailand");
    await user.click(within(noteSection).getByRole("button", { name: "Add value" }));
    const secondTextValue = document.getElementById("fields[3].visibleWhen.all.1.value.1") as HTMLInputElement;
    await user.type(secondTextValue, "Chiang Mai, Thailand");

    // Disable preserves unsaved edits and updates version in place.
    await user.clear(nameInput);
    await user.type(nameInput, "Unsaved Name");
    await user.click(screen.getByRole("button", { name: "Disable" }));
    await user.click(screen.getByRole("button", { name: "Confirm disable" }));
    await waitFor(() => expect(requestTypeApi.disable).toHaveBeenCalledWith(typeId, { expectedVersion: 1 }, expect.any(String), 1));
    expect(nameInput).toHaveValue("Unsaved Name");
    expect(requestTypeApi.readAdmin).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(requestTypeApi.patchDraft).toHaveBeenCalledWith(
        typeId,
        expect.objectContaining({
            expectedVersion: 2,
            name: { en: "Unsaved Name" },
            fields: expect.arrayContaining([
                expect.objectContaining({
                    key: "note",
                    visibleWhen: {
                        all: [
                            { fieldKey: "category", operator: "IN", value: ["IT", "OTHER"] },
                            { fieldKey: "amountCap", operator: "IN", value: ["Bangkok, Thailand", "Chiang Mai, Thailand"] },
                        ],
                    },
                    requiredWhen: { all: [{ fieldKey: "urgentFlag", operator: "IN", value: [true, false] }] },
                }),
            ]),
        }),
        expect.any(String),
        1,
    ));
});

test("B03 RequestTypePreview treats inherited Object.prototype field keys such as constructor as unset", async () =>
{
    const user = userEvent.setup();
    render(
        <RequestTypePreview
            code="PROTO"
            definition={{
                name: { en: "Prototype safety" },
                monetary: false,
                supportsLineItems: false,
                fields: [
                    { key: "constructor", kind: "TEXT", label: { en: "Constructor" }, required: false },
                    { key: "dependent", kind: "TEXT", label: { en: "Dependent" }, required: true, visibleWhen: { all: [{ fieldKey: "constructor", operator: "PRESENT" }] } },
                ],
            }}
        />,
    );

    const constructorInput = screen.getByLabelText("Constructor");
    expect(constructorInput).toHaveValue("");
    expect(screen.queryByLabelText(/Dependent/)).not.toBeInTheDocument();

    await user.type(constructorInput, "custom");
    expect(screen.getByLabelText(/Dependent/)).toBeVisible();
});

test("UI-12 list page Published only filter requires hasDraft=false and Reset filters recovers empty matches", async () =>
{
    vi.mocked(requestTypeApi.searchAdmin).mockResolvedValue({
        items: [],
        pagination: { currentPage: 1, pageSize: 20, totalPages: 0, totalCount: 0, hasPrevious: false, hasNext: false },
    });

    const user = userEvent.setup();
    render(<RouterProvider router={createMemoryRouter([{ path: "/admin/request-types", Component: RequestTypesListPage }], { initialEntries: ["/admin/request-types"] })} />);

    await screen.findByText("No request types configured yet.");
    await user.selectOptions(screen.getByLabelText("Draft state"), "published");

    await waitFor(() => expect(requestTypeApi.searchAdmin).toHaveBeenLastCalledWith(
        expect.objectContaining({
            search: [
                { name: "isPublished", condition: "EQUAL", value: true },
                { name: "hasDraft", condition: "EQUAL", value: false },
            ],
        }),
        expect.any(AbortSignal),
        1,
    ));
    expect(await screen.findByText("No request types match your filters.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    await waitFor(() => expect(requestTypeApi.searchAdmin).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: [] }),
        expect.any(AbortSignal),
        1,
    ));
});
