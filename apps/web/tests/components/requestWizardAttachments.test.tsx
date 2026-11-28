import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { http, HttpResponse } from "msw";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";
import type { AttachmentDTO, IRequestTypeSearchResult, PublishedRequestType, RequestDetail } from "@workflow/contracts";
type Pagination = IRequestTypeSearchResult["pagination"];
import { requestApi } from "../../app/api/requests";
import { beginSession, currentGeneration, endSession } from "../../app/api/tokenStore";
import { RequestWizard } from "../../app/modules/requests/RequestWizard";
import { server } from "../helpers/server";

const ownerId = "7bb91ef4-5982-405f-8bd5-61b5c3cf410b";
const typeId = "8bb91ef4-5982-405f-8bd5-61b5c3cf410b";
const versionId = "9bb91ef4-5982-405f-8bd5-61b5c3cf410b";
const savedRequestId = "abb91ef4-5982-405f-8bd5-61b5c3cf410b";
const workingRevId = "bbb91ef4-5982-405f-8bd5-61b5c3cf410b";

const session = vi.hoisted(() => ({
    generation: 0,
    user: { id: "7bb91ef4-5982-405f-8bd5-61b5c3cf410b", displayName: "Requester", roles: ["REQUESTER"] as string[], department: { id: "dep-1", name: "Operations" } },
}));

vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => session }));

interface IFakeXhrInstance
{
    method: string;
    url: string;
    withCredentials: boolean;
    headers: Record<string, string>;
    body: FormData | null;
    status: number;
    statusText: string;
    responseText: string;
    responseHeaders: Record<string, string>;
    aborted: boolean;
    upload: {
        onprogress: ((event: ProgressEvent) => void) | null;
        onloadend: (() => void) | null;
    };
    onload: (() => void) | null;
    onerror: (() => void) | null;
    onabort: (() => void) | null;
    ontimeout: (() => void) | null;
    open(method: string, url: string): void;
    setRequestHeader(name: string, value: string): void;
    getResponseHeader(name: string): string | null;
    send(body: FormData): void;
    abort(): void;
}

const xhrInstances: IFakeXhrInstance[] = [];
const OriginalXhr = globalThis.XMLHttpRequest;

class FakeXMLHttpRequest implements IFakeXhrInstance
{
    public method = "";
    public url = "";
    public withCredentials = true;
    public headers: Record<string, string> = {};
    public body: FormData | null = null;
    public status = 0;
    public statusText = "";
    public responseText = "";
    public responseHeaders: Record<string, string> = {};
    public aborted = false;
    public upload = {
        onprogress: null as ((event: ProgressEvent) => void) | null,
        onloadend: null as (() => void) | null,
    };
    public onload: (() => void) | null = null;
    public onerror: (() => void) | null = null;
    public onabort: (() => void) | null = null;
    public ontimeout: (() => void) | null = null;

    constructor()
    {
        xhrInstances.push(this);
    }

    public open(method: string, url: string): void
    {
        this.method = method;
        this.url = url;
    }

    public setRequestHeader(name: string, value: string): void
    {
        this.headers[name] = value;
    }

    public getResponseHeader(name: string): string | null
    {
        return this.responseHeaders[name.toLowerCase()] ?? null;
    }

    public send(body: FormData): void
    {
        this.body = body;
    }

    public abort(): void
    {
        this.aborted = true;
        this.onabort?.();
    }
}

const showDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");

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
    globalThis.XMLHttpRequest = OriginalXhr;
    if (showDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "showModal", showDescriptor);
    else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).showModal;
    if (closeDescriptor) Object.defineProperty(HTMLDialogElement.prototype, "close", closeDescriptor);
    else delete (HTMLDialogElement.prototype as Partial<HTMLDialogElement>).close;
});

beforeEach(() =>
{
    session.generation = currentGeneration();
    session.user = { id: ownerId, displayName: "Requester", roles: ["REQUESTER"], department: { id: "dep-1", name: "Operations" } };
});

afterEach(() =>
{
    globalThis.XMLHttpRequest = OriginalXhr;
    xhrInstances.length = 0;
    vi.restoreAllMocks();
    endSession();
    session.generation = currentGeneration();
    session.user = { id: ownerId, displayName: "Requester", roles: ["REQUESTER"], department: { id: "dep-1", name: "Operations" } };
});

function makeType(supportsLineItems: boolean): PublishedRequestType
{
    return {
        id: typeId,
        code: "OPS",
        name: { en: "Operations" },
        versionId,
        versionNumber: 1,
        isEnabled: true,
        supportsLineItems,
        monetary: supportsLineItems,
        publishedAt: "2026-11-06T00:00:00Z",
        fields: [],
    };
}

function makeDraftDetail(): RequestDetail
{
    return {
        id: savedRequestId,
        typeId,
        typeCode: "OPS",
        title: "Travel budget",
        justification: "Conference travel",
        priority: "MEDIUM",
        status: "DRAFT",
        requestNumber: null,
        requester: { id: ownerId, email: "owner@example.test", displayName: "Requester", roles: ["REQUESTER"], isActive: true, department: { id: "dep-1", name: "Operations", code: "OPS", isActive: true } },
        department: { id: "dep-1", name: "Operations", code: "OPS", isActive: true },
        revisionNumber: null,
        currentCycleId: null,
        createdAt: "2026-11-06T00:00:00Z",
        updatedAt: "2026-11-06T00:00:00Z",
        submittedAt: null,
        version: 1,
        workingRevision: { id: workingRevId, revisionNumber: 1, formDefinitionVersionId: versionId, fields: {}, lineItems: [], amount: null, currency: null, submittedAt: null, submittedBy: null },
        submittedRevision: null,
        currentStageNumber: null,
        currentApprovers: [],
        availableActions: ["EDIT_DRAFT", "SUBMIT"],
    };
}

function makeAttachment(index: number, fileName: string, sizeBytes = 2048): AttachmentDTO
{
    return {
        id: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        requestId: savedRequestId,
        workingOrSubmittedRevisionId: workingRevId,
        fileName,
        mediaType: "application/pdf",
        sizeBytes,
        uploadedBy: ownerId,
        uploadedAt: "2026-11-06T00:05:00Z",
    };
}

function makePage(totalCount: number): Pagination
{
    return {
        currentPage: 1,
        pageSize: 100,
        totalPages: totalCount === 0 ? 0 : 1,
        totalCount,
        hasPrevious: false,
        hasNext: false,
    };
}

async function advanceToStep4(user: ReturnType<typeof userEvent.setup>, supportsLineItems: boolean, fillRequired = true)
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    const reqType = makeType(supportsLineItems);
    server.use(
        http.post("http://localhost/api/v1/request-types/search", () =>
            HttpResponse.json([reqType], { headers: { "X-Pagination": JSON.stringify(makePage(1)) } })),
    );

    const view = render(<RouterProvider router={createMemoryRouter([{ path: "/", Component: RequestWizard }])} />);
    await user.selectOptions(await screen.findByRole("combobox", { name: "Request type (required)" }), typeId);
    await user.click(screen.getByRole("button", { name: /^Next$/ }));

    if (fillRequired)
    {
        await user.type(screen.getByLabelText("Title (required)"), "Travel budget");
        await user.type(screen.getByLabelText("Justification (required)"), "Conference travel");
    }
    else
    {
        await user.type(screen.getByLabelText("Title (required)"), "Draft title");
        await user.type(screen.getByLabelText("Justification (required)"), "Draft justification");
    }

    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    expect(screen.getByRole("heading", { name: "Items & Attachments" })).toBeVisible();
    return view;
}

test("ATT-UI-01 shows Step 4 Items & Attachments with uploader and without line-item editor when supportsLineItems is false", async () =>
{
    const user = userEvent.setup({ applyAccept: false });
    await advanceToStep4(user, false);

    expect(screen.getByLabelText("Attach supporting file")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add item" })).not.toBeInTheDocument();
});

test("ATT-UI-02 shows both LineItemsEditor and working-revision attachment uploader when supportsLineItems is true", async () =>
{
    const user = userEvent.setup({ applyAccept: false });
    await advanceToStep4(user, true);

    expect(screen.getByRole("button", { name: "Add item" })).toBeVisible();
    expect(screen.getByLabelText("Attach supporting file")).toBeVisible();
});

test("ATT-UI-03 auto-saves unsaved draft before uploading file via XHR with Bearer token and workingRevisionId", async () =>
{
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    beginSession("wizard-jwt");
    session.generation = currentGeneration();

    const draftDetail = makeDraftDetail();
    const createSpy = vi.spyOn(requestApi, "create").mockResolvedValue(draftDetail);
    vi.spyOn(requestApi, "listAttachments").mockResolvedValue({ items: [], pagination: makePage(0) });

    const user = userEvent.setup({ applyAccept: false });
    await advanceToStep4(user, false);

    const file = new File(["%PDF-1.4\n"], "quote.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Attach supporting file"), file);

    await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(xhrInstances).toHaveLength(1));

    const xhr = xhrInstances[0]!;
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe(`http://localhost/api/v1/requests/${savedRequestId}/attachments`);
    expect(xhr.withCredentials).toBe(false);
    expect(xhr.headers["Authorization"]).toBe("Bearer wizard-jwt");
    expect(xhr.body?.get("file")).toBe(file);
    expect(xhr.body?.get("workingRevisionId")).toBe(workingRevId);
});

test("ATT-UI-04 prevents upload and preserves inputs when draft save fails before upload", async () =>
{
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    vi.spyOn(requestApi, "create").mockRejectedValue(new Error("Server error"));

    const user = userEvent.setup({ applyAccept: false });
    await advanceToStep4(user, false);

    const file = new File(["%PDF-1.4\n"], "quote.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Attach supporting file"), file);

    expect(await screen.findByRole("alert")).toBeVisible();
    expect(xhrInstances).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByLabelText("Title (required)")).toHaveValue("Travel budget");
    expect(screen.getByLabelText("Justification (required)")).toHaveValue("Conference travel");
});

test("ATT-UI-05 tracks XHR progress Uploading (50%) -> Finalizing -> Uploaded with file metadata", async () =>
{
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    vi.spyOn(requestApi, "create").mockResolvedValue(makeDraftDetail());
    vi.spyOn(requestApi, "listAttachments").mockResolvedValue({ items: [], pagination: makePage(0) });

    const user = userEvent.setup({ applyAccept: false });
    await advanceToStep4(user, false);

    const file = new File(["%PDF-1.4\n"], "proposal.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Attach supporting file"), file);

    await waitFor(() => expect(xhrInstances).toHaveLength(1));
    const xhr = xhrInstances[0]!;

    await act(async () =>
    {
        xhr.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
    });
    expect(screen.getByText("Uploading (50%)")).toBeVisible();

    await act(async () =>
    {
        xhr.upload.onloadend?.();
    });
    expect(screen.getByText("Finalizing")).toBeVisible();

    const uploadedDto = makeAttachment(1, "proposal.pdf", 2048);
    await act(async () =>
    {
        xhr.status = 201;
        xhr.responseText = JSON.stringify(uploadedDto);
        xhr.onload?.();
    });

    expect(await screen.findByText("Uploaded")).toBeVisible();
    expect(screen.getByText("proposal.pdf")).toBeVisible();
    expect(screen.getByText(/2\.0 KB/)).toBeVisible();
});

test("ATT-UI-06 reconciles UNKNOWN drop during Finalizing with server list (committed vs absent)", async () =>
{
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    vi.spyOn(requestApi, "create").mockResolvedValue(makeDraftDetail());
    const listSpy = vi.spyOn(requestApi, "listAttachments").mockResolvedValue({ items: [], pagination: makePage(0) });

    const user = userEvent.setup({ applyAccept: false });
    await advanceToStep4(user, false);

    const fileA = new File(["%PDF-1.4\n"], "committed.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Attach supporting file"), fileA);
    await waitFor(() => expect(xhrInstances).toHaveLength(1));

    const committedDto = makeAttachment(1, "committed.pdf", fileA.size);
    let releaseReconcile!: (value: { items: AttachmentDTO[]; pagination: Pagination }) => void;
    listSpy.mockImplementationOnce(() => new Promise((resolve) =>
    {
        releaseReconcile = resolve;
    }));

    await act(async () =>
    {
        xhrInstances[0]!.upload.onloadend?.();
        xhrInstances[0]!.status = 0;
        xhrInstances[0]!.onload?.();
    });

    expect(await screen.findByText("UNKNOWN — verifying with server")).toBeVisible();

    await act(async () => releaseReconcile({ items: [committedDto], pagination: makePage(1) }));
    expect(await screen.findByText("Uploaded")).toBeVisible();
    expect(screen.getByText("committed.pdf")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();

    const fileB = new File(["%PDF-1.4\n"], "absent.pdf", { type: "application/pdf" });
    listSpy.mockResolvedValueOnce({ items: [committedDto], pagination: makePage(1) });
    await user.upload(screen.getByLabelText("Attach supporting file"), fileB);
    await waitFor(() => expect(xhrInstances).toHaveLength(2));

    await act(async () =>
    {
        xhrInstances[1]!.upload.onloadend?.();
        xhrInstances[1]!.onerror?.();
    });

    expect(await screen.findByRole("button", { name: "Retry" })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(/interrupted/i);
});

test.each([
    [413, "FILE_TOO_LARGE", /10 MB size limit/i],
    [415, "UNSUPPORTED_MEDIA_TYPE", /Unsupported file type/i],
])("ATT-UI-07 / ATT-UI-08 maps %i %s to accessible error while keeping existing files intact", async (status, code, pattern) =>
{
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    const existing = makeAttachment(1, "already-uploaded.pdf", 1024);
    vi.spyOn(requestApi, "create").mockResolvedValue(makeDraftDetail());
    vi.spyOn(requestApi, "listAttachments").mockResolvedValue({ items: [existing], pagination: makePage(1) });

    const user = userEvent.setup({ applyAccept: false });
    await advanceToStep4(user, false);

    const firstFile = new File(["%PDF-1.4\n"], "already-uploaded.pdf", { type: "application/pdf" });
    await user.upload(screen.getByLabelText("Attach supporting file"), firstFile);
    await waitFor(() => expect(xhrInstances).toHaveLength(1));
    await act(async () =>
    {
        xhrInstances[0]!.status = 201;
        xhrInstances[0]!.responseText = JSON.stringify(existing);
        xhrInstances[0]!.onload?.();
    });
    expect(await screen.findByText("already-uploaded.pdf")).toBeVisible();

    const badFile = new File(["bad"], "bad-file.bin", { type: "application/octet-stream" });
    await user.upload(screen.getByLabelText("Attach supporting file"), badFile);
    await waitFor(() => expect(xhrInstances).toHaveLength(2));
    await act(async () =>
    {
        xhrInstances[1]!.status = status;
        xhrInstances[1]!.responseText = JSON.stringify({
            statusCode: status,
            code,
            message: "Server rejected file",
            error: code,
            requestId: "err-req-1",
        });
        xhrInstances[1]!.onload?.();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(pattern);
    expect(screen.getByText("already-uploaded.pdf")).toBeVisible();
});

test("ATT-UI-12 Step 5 Review & Submit summarizes uploaded attachment filenames, sizes, and count", async () =>
{
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    const file1Dto = makeAttachment(1, "budget-sheet.pdf", 1536);
    const file2Dto = makeAttachment(2, "receipt.png", 3 * 1024 * 1024);
    vi.spyOn(requestApi, "create").mockResolvedValue(makeDraftDetail());
    vi.spyOn(requestApi, "listAttachments").mockResolvedValue({ items: [], pagination: makePage(0) });

    const user = userEvent.setup({ applyAccept: false });
    await advanceToStep4(user, false);

    await user.upload(screen.getByLabelText("Attach supporting file"), [
        new File(["a"], "budget-sheet.pdf", { type: "application/pdf" }),
        new File(["b"], "receipt.png", { type: "image/png" }),
    ]);

    await waitFor(() => expect(xhrInstances).toHaveLength(2));
    await act(async () =>
    {
        xhrInstances[0]!.status = 201;
        xhrInstances[0]!.responseText = JSON.stringify(file1Dto);
        xhrInstances[0]!.onload?.();
        xhrInstances[1]!.status = 201;
        xhrInstances[1]!.responseText = JSON.stringify(file2Dto);
        xhrInstances[1]!.onload?.();
    });

    expect(await screen.findByText("2 / 10 files")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    expect(screen.getByRole("heading", { name: "Review & Submit" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Attachments (2)" })).toBeVisible();
    const summaryList = screen.getByRole("list", { name: "Review attachments" });
    expect(summaryList).toHaveTextContent("budget-sheet.pdf");
    expect(summaryList).toHaveTextContent("1.5 KB");
    expect(summaryList).toHaveTextContent("receipt.png");
    expect(summaryList).toHaveTextContent("3.0 MB");
});

test("ATT-UI-13 aborts active XHR upload and attachment fetch and clears attachment list when session generation increments", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    server.use(
        http.post("http://localhost/api/v1/request-types/search", () =>
            HttpResponse.json([makeType(false)], { headers: { "X-Pagination": JSON.stringify(makePage(1)) } })),
    );
    globalThis.XMLHttpRequest = FakeXMLHttpRequest as unknown as typeof XMLHttpRequest;
    const existing = makeAttachment(1, "user-a-file.pdf", 2048);
    const listPending: { signal: AbortSignal | undefined; resolve: (value: { items: AttachmentDTO[]; pagination: Pagination }) => void }[] = [];
    vi.spyOn(requestApi, "listAttachments").mockImplementation((_id, _query, signal) => new Promise((resolve) =>
    {
        listPending.push({ signal, resolve });
    }));

    const draftDetail = makeDraftDetail();
    const user = userEvent.setup({ applyAccept: false });
    const view = render(
        <RouterProvider router={createMemoryRouter([{
            path: "/",
            element: <RequestWizard initial={{
                detail: draftDetail,
                definition: makeType(false),
                content: { typeId, formDefinitionVersionId: versionId, title: "Travel budget", justification: "Conference travel", priority: "MEDIUM", fields: {}, lineItems: [] },
            }} />,
        }])} />,
    );

    await waitFor(() => expect(listPending).toHaveLength(1));
    await act(async () => listPending[0]!.resolve({ items: [existing], pagination: makePage(1) }));

    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    await user.click(screen.getByRole("button", { name: /^Next$/ }));
    expect(await screen.findByText("user-a-file.pdf")).toBeVisible();

    await user.upload(screen.getByLabelText("Attach supporting file"), new File(["%PDF-1.4"], "in-flight.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(xhrInstances).toHaveLength(1));
    expect(xhrInstances[0]!.aborted).toBe(false);

    session.generation = currentGeneration() + 1;
    session.user = { id: "other-user", displayName: "Other User", roles: ["REQUESTER"], department: { id: "dep-2", name: "Finance" } };
    view.rerender(
        <RouterProvider router={createMemoryRouter([{
            path: "/",
            element: <RequestWizard initial={{
                detail: draftDetail,
                definition: makeType(false),
                content: { typeId, formDefinitionVersionId: versionId, title: "Travel budget", justification: "Conference travel", priority: "MEDIUM", fields: {}, lineItems: [] },
            }} />,
        }])} />,
    );

    await waitFor(() => expect(xhrInstances[0]!.aborted).toBe(true));
    expect(screen.queryByText("user-a-file.pdf")).not.toBeInTheDocument();
    expect(screen.queryByText("in-flight.pdf")).not.toBeInTheDocument();
});
