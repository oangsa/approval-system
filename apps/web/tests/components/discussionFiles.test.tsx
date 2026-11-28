import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import type { AttachmentDTO, CommentDTO, IRequestTypeSearchResult, PublishedRequestType, RequestDetail } from "@workflow/contracts";
type Pagination = IRequestTypeSearchResult["pagination"];
import { requestApi } from "../../app/api/requests";
import { ApiFailure } from "../../app/api/errors";
import { beginSession, currentGeneration, endSession } from "../../app/api/tokenStore";
import { SessionProvider } from "../../app/modules/auth/sessionContext";
import { RequestDetailPage } from "../../app/modules/requests/RequestDetailPage";
import { RequestDetailTabs } from "../../app/modules/requests/RequestDetailTabs";
import DetailRoute from "../../app/routes/requests/detail";
import { server } from "../helpers/server";

const ownerId = "7bb91ef4-5982-405f-8bd5-61b5c3cf410b";
const reviewerId = "8bb91ef4-5982-405f-8bd5-61b5c3cf410b";
const requestId = "9bb91ef4-5982-405f-8bd5-61b5c3cf410b";
const versionId = "abb91ef4-5982-405f-8bd5-61b5c3cf410b";
const workingRevId = "bbb91ef4-5982-405f-8bd5-61b5c3cf410b";
const submittedRevId = "cbb91ef4-5982-405f-8bd5-61b5c3cf410b";

const session = vi.hoisted(() => ({
    generation: 0,
    user: { id: "7bb91ef4-5982-405f-8bd5-61b5c3cf410b", displayName: "Owner User", roles: ["REQUESTER"] as string[] },
}));

vi.mock("../../app/modules/auth/sessionContext", async (importOriginal) =>
{
    const actual = await importOriginal<typeof import("../../app/modules/auth/sessionContext")>();
    return {
        ...actual,
        useSession: () => session,
    };
});

beforeEach(() =>
{
    session.generation = currentGeneration();
    session.user = { id: ownerId, displayName: "Owner User", roles: ["REQUESTER"] };
});

afterEach(() =>
{
    vi.restoreAllMocks();
    endSession();
    session.generation = currentGeneration();
    session.user = { id: ownerId, displayName: "Owner User", roles: ["REQUESTER"] };
});

const definition: PublishedRequestType = {
    id: requestId,
    code: "OPS",
    name: { en: "Operations" },
    versionId,
    versionNumber: 1,
    isEnabled: true,
    supportsLineItems: false,
    monetary: false,
    publishedAt: "2026-11-06T00:00:00Z",
    fields: [],
};

const baseDetail: RequestDetail = {
    id: requestId,
    typeId: requestId,
    typeCode: "OPS",
    title: "Collaboration Request",
    justification: "Need review",
    priority: "MEDIUM",
    status: "DRAFT",
    requestNumber: null,
    requester: { id: ownerId, email: "owner@example.test", displayName: "Owner User", roles: ["REQUESTER"], isActive: true, department: null },
    department: null,
    revisionNumber: null,
    currentCycleId: null,
    createdAt: "2026-11-06T00:00:00Z",
    updatedAt: "2026-11-06T10:00:00Z",
    submittedAt: null,
    version: 1,
    workingRevision: { id: workingRevId, revisionNumber: 1, formDefinitionVersionId: versionId, fields: {}, lineItems: [], amount: null, currency: null, submittedAt: null, submittedBy: null },
    submittedRevision: null,
    currentStageNumber: null,
    currentApprovers: [],
    availableActions: ["EDIT_DRAFT", "SUBMIT"],
};

function makePage(totalCount: number, pageNumber = 1, pageSize = 20): Pagination
{
    const totalPages = totalCount === 0 ? 0 : Math.ceil(totalCount / pageSize);
    return {
        currentPage: pageNumber,
        pageSize,
        totalPages,
        totalCount,
        hasPrevious: pageNumber > 1,
        hasNext: pageNumber < totalPages,
    };
}

function makeComment(index: number, body = `Comment #${index}`, authorName = "Owner User"): CommentDTO
{
    return {
        id: `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        requestId,
        author: { id: ownerId, displayName: authorName },
        body,
        createdAt: `2026-11-06T10:${String(index % 60).padStart(2, "0")}:00Z`,
    };
}

function makeAttachment(index: number, revisionId: string, fileName = `evidence-${index}.pdf`): AttachmentDTO
{
    return {
        id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        requestId,
        workingOrSubmittedRevisionId: revisionId,
        fileName,
        mediaType: "application/pdf",
        sizeBytes: 2048 * index,
        uploadedBy: ownerId,
        uploadedAt: "2026-11-06T10:05:00Z",
    };
}

function renderTabs(detail: RequestDetail = baseDetail, initialUrl = `/requests/${requestId}`)
{
    return render(
        <MemoryRouter initialEntries={[initialUrl]}>
            <Routes>
                <Route path="/requests/:id" element={<RequestDetailTabs detail={detail} definition={definition} />} />
            </Routes>
        </MemoryRouter>,
    );
}

test("CMT-UI-01 selects Discussion / Files via click and keyboard, renders chronological plain-text comments and discussion-only notice", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    const comments: CommentDTO[] = [
        makeComment(1, "First <script>alert('xss')</script> comment", "Owner User"),
        makeComment(2, "Second reply from reviewer", "Reviewer User"),
    ];
    server.use(
        http.get(`http://localhost/api/v1/requests/${requestId}/comments`, () =>
            HttpResponse.json(comments, { headers: { "X-Pagination": JSON.stringify(makePage(2)) } })),
        http.get(`http://localhost/api/v1/requests/${requestId}/attachments`, () =>
            HttpResponse.json([], { headers: { "X-Pagination": JSON.stringify(makePage(0)) } })),
        http.get(`http://localhost/api/v1/requests/${requestId}/approvers`, () => HttpResponse.json([])),
    );

    const user = userEvent.setup();
    const { container } = renderTabs();

    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    overviewTab.focus();
    fireEvent.keyDown(overviewTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Approval" })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole("tab", { name: "Approval" }), { key: "End" });
    const discussionTab = screen.getByRole("tab", { name: "Discussion / Files" });
    expect(discussionTab).toHaveFocus();
    await user.click(discussionTab);

    expect(await screen.findByText(/business discussion only and do not record formal approval decisions/i)).toBeVisible();
    expect(screen.getByText("First <script>alert('xss')</script> comment")).toBeVisible();
    expect(screen.getByText("Second reply from reviewer")).toBeVisible();
    expect(container.querySelector("script")).toBeNull();
    const items = screen.getByRole("list", { name: "Comments list" }).querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("Owner User");
    expect(items[1]).toHaveTextContent("Reviewer User");
});

test("CMT-UI-02 posts a comment with pending disabled state, clears textarea, and renders no approval actions", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    const created = makeComment(1, "Clarified invoice date");
    let release!: (value: CommentDTO) => void;
    vi.spyOn(requestApi, "listComments").mockResolvedValue({ items: [], pagination: makePage(0) });
    vi.spyOn(requestApi, "listAttachments").mockResolvedValue({ items: [], pagination: makePage(0) });
    vi.spyOn(requestApi, "createComment").mockImplementation(() => new Promise((resolve) =>
    {
        release = resolve;
    }));

    const user = userEvent.setup();
    renderTabs(baseDetail, `/requests/${requestId}?tab=discussion`);

    const textarea = await screen.findByLabelText("Add a comment");
    await user.type(textarea, "  Clarified invoice date  ");
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    expect(textarea).toBeDisabled();
    expect(screen.getByRole("button", { name: "Posting…" })).toBeDisabled();
    expect(requestApi.createComment).toHaveBeenCalledWith(requestId, { body: "Clarified invoice date" }, expect.any(AbortSignal), currentGeneration());

    await act(async () => release(created));
    expect(await screen.findByText("Clarified invoice date")).toBeVisible();
    expect(textarea).toHaveValue("");
    expect(textarea).toBeEnabled();
    expect(screen.queryByRole("button", { name: /Approve|Reject|Return/i })).not.toBeInTheDocument();
});

test("CMT-UI-03 paginates comments across pages using X-Pagination", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    const page1 = Array.from({ length: 20 }, (_, i) => makeComment(i + 1));
    const page2 = Array.from({ length: 5 }, (_, i) => makeComment(21 + i));

    server.use(
        http.get(`http://localhost/api/v1/requests/${requestId}/comments`, ({ request }) =>
        {
            const pageNumber = Number(new URL(request.url).searchParams.get("pageNumber") ?? "1");
            const items = pageNumber === 2 ? page2 : page1;
            return HttpResponse.json(items, { headers: { "X-Pagination": JSON.stringify(makePage(25, pageNumber, 20)) } });
        }),
        http.get(`http://localhost/api/v1/requests/${requestId}/attachments`, () =>
            HttpResponse.json([], { headers: { "X-Pagination": JSON.stringify(makePage(0)) } })),
    );

    const user = userEvent.setup();
    renderTabs(baseDetail, `/requests/${requestId}?tab=discussion`);

    expect(await screen.findByText("Comment #1")).toBeVisible();
    expect(screen.getByText("Page 1 of 2 (25 total)")).toBeVisible();
    expect(screen.getByRole("button", { name: "Previous comments" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Next comments" }));
    expect(await screen.findByText("Comment #21")).toBeVisible();
    expect(screen.queryByText("Comment #1")).not.toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2 (25 total)")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Previous comments" }));
    expect(await screen.findByText("Comment #1")).toBeVisible();
});

test.each([
    [503, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable. Try again."],
    [422, "VALIDATION_ERROR", "Comment exceeds limit"],
])("CMT-UI-04 preserves unsent comment text and shows accessible alert when submit returns %i", async (status, code, expectedText) =>
{
    vi.spyOn(requestApi, "listComments").mockResolvedValue({ items: [], pagination: makePage(0) });
    vi.spyOn(requestApi, "listAttachments").mockResolvedValue({ items: [], pagination: makePage(0) });
    vi.spyOn(requestApi, "createComment").mockRejectedValueOnce(new ApiFailure({
        kind: "http",
        status,
        code,
        message: expectedText,
        requestId: "req-err-1",
    }));

    const user = userEvent.setup();
    renderTabs(baseDetail, `/requests/${requestId}?tab=discussion`);

    const textarea = await screen.findByLabelText("Add a comment");
    await user.type(textarea, "Unsent message preserved");
    await user.click(screen.getByRole("button", { name: "Post comment" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(expectedText);
    expect(textarea).toHaveValue("Unsent message preserved");
    expect(screen.queryByText("Unsent message preserved", { selector: "p" })).not.toBeInTheDocument();
});

test("CMT-UI-05 aborts in-flight comment fetch and clears comments when session generation increments", async () =>
{
    const pending: { signal: AbortSignal | undefined; resolve: (value: { items: CommentDTO[]; pagination: Pagination }) => void }[] = [];
    vi.spyOn(requestApi, "listComments").mockImplementation((_id, _query, signal) => new Promise((resolve) =>
    {
        pending.push({ signal, resolve });
    }));
    vi.spyOn(requestApi, "listAttachments").mockResolvedValue({ items: [], pagination: makePage(0) });

    const view = render(
        <MemoryRouter initialEntries={[`/requests/${requestId}?tab=discussion`]}>
            <Routes>
                <Route path="/requests/:id" element={<RequestDetailTabs detail={baseDetail} definition={definition} />} />
            </Routes>
        </MemoryRouter>,
    );

    await waitFor(() => expect(pending).toHaveLength(1));
    await act(async () => pending[0]!.resolve({ items: [makeComment(1, "User A secret comment")], pagination: makePage(1) }));
    expect(await screen.findByText("User A secret comment")).toBeVisible();

    session.generation = 1;
    session.user = { id: reviewerId, displayName: "User B", roles: ["REVIEWER"] };
    view.rerender(
        <MemoryRouter initialEntries={[`/requests/${requestId}?tab=discussion`]}>
            <Routes>
                <Route path="/requests/:id" element={<RequestDetailTabs detail={baseDetail} definition={definition} />} />
            </Routes>
        </MemoryRouter>,
    );

    expect(screen.queryByText("User A secret comment")).not.toBeInTheDocument();
    await waitFor(() => expect(pending).toHaveLength(2));

    session.generation = 2;
    session.user = { id: ownerId, displayName: "User C", roles: ["REQUESTER"] };
    view.rerender(
        <MemoryRouter initialEntries={[`/requests/${requestId}?tab=discussion`]}>
            <Routes>
                <Route path="/requests/:id" element={<RequestDetailTabs detail={baseDetail} definition={definition} />} />
            </Routes>
        </MemoryRouter>,
    );

    expect(pending[1]!.signal?.aborted).toBe(true);
    await waitFor(() => expect(pending).toHaveLength(3));
    await act(async () => pending[1]!.resolve({ items: [makeComment(2, "Stale User B comment")], pagination: makePage(1) }));
    expect(screen.queryByText("Stale User B comment")).not.toBeInTheDocument();
    await act(async () => pending[2]!.resolve({ items: [makeComment(3, "Fresh User C comment")], pagination: makePage(1) }));
    expect(await screen.findByText("Fresh User C comment")).toBeVisible();
});

test("ATT-UI-09 deletes working attachment on DRAFT/RETURNED and removes row on 204", async () =>
{
    const workingFile = makeAttachment(1, workingRevId, "working-quote.pdf");
    vi.spyOn(requestApi, "listComments").mockResolvedValue({ items: [], pagination: makePage(0) });
    vi.spyOn(requestApi, "listAttachments").mockResolvedValue({ items: [workingFile], pagination: makePage(1) });
    vi.spyOn(requestApi, "deleteAttachment").mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderTabs({ ...baseDetail, status: "RETURNED" }, `/requests/${requestId}?tab=discussion`);

    expect(await screen.findByText("working-quote.pdf")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Delete working-quote.pdf" }));

    await waitFor(() => expect(requestApi.deleteAttachment).toHaveBeenCalledWith(requestId, workingFile.id, expect.any(AbortSignal), currentGeneration()));
    await waitFor(() => expect(screen.queryByText("working-quote.pdf")).not.toBeInTheDocument());
});

test("ATT-UI-10 separates editable working files from read-only submitted evidence and hides edit controls for reviewers", async () =>
{
    const workingFile = makeAttachment(1, workingRevId, "new-working.pdf");
    const submittedFile = makeAttachment(2, submittedRevId, "prior-cycle-evidence.pdf");
    vi.spyOn(requestApi, "listComments").mockResolvedValue({ items: [], pagination: makePage(0) });
    vi.spyOn(requestApi, "listAttachments").mockResolvedValue({ items: [workingFile, submittedFile], pagination: makePage(2) });

    const returnedDetail: RequestDetail = {
        ...baseDetail,
        status: "RETURNED",
        revisionNumber: 1,
        workingRevision: { ...baseDetail.workingRevision!, revisionNumber: 2 },
        submittedRevision: { id: submittedRevId, revisionNumber: 1, formDefinitionVersionId: versionId, fields: {}, lineItems: [], amount: null, currency: null, submittedAt: "2026-11-06T09:00:00Z", submittedBy: ownerId },
        availableActions: ["EDIT_DRAFT", "RESUBMIT"],
    };

    const view = renderTabs(returnedDetail, `/requests/${requestId}?tab=discussion`);
    expect(await screen.findByText("new-working.pdf")).toBeVisible();
    expect(screen.getByText("prior-cycle-evidence.pdf")).toBeVisible();
    expect(screen.getByLabelText("Attach supporting file")).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete new-working.pdf" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete prior-cycle-evidence.pdf" })).not.toBeInTheDocument();

    session.user = { id: reviewerId, displayName: "Reviewer", roles: ["REVIEWER"] };
    const pendingDetail: RequestDetail = {
        ...returnedDetail,
        status: "PENDING",
        workingRevision: null,
        availableActions: [],
    };
    view.rerender(
        <MemoryRouter initialEntries={[`/requests/${requestId}?tab=discussion`]}>
            <Routes>
                <Route path="/requests/:id" element={<RequestDetailTabs detail={pendingDetail} definition={definition} />} />
            </Routes>
        </MemoryRouter>,
    );

    expect(await screen.findByText("prior-cycle-evidence.pdf")).toBeVisible();
    expect(screen.queryByLabelText("Attach supporting file")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Delete/i })).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Download" }).length).toBeGreaterThanOrEqual(1);
});

test("ATT-UI-11 downloads binary Blob with Bearer auth, parses RFC 5987 filename, revokes ObjectURL, and renders no direct storage URL", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    beginSession("secret-jwt-token");
    session.generation = currentGeneration();

    const submittedFile = makeAttachment(1, submittedRevId, "fallback.pdf");
    let capturedAuth: string | null = null;
    server.use(
        http.get(`http://localhost/api/v1/requests/${requestId}/comments`, () =>
            HttpResponse.json([], { headers: { "X-Pagination": JSON.stringify(makePage(0)) } })),
        http.get(`http://localhost/api/v1/requests/${requestId}/attachments`, () =>
            HttpResponse.json([submittedFile], { headers: { "X-Pagination": JSON.stringify(makePage(1)) } })),
        http.get(`http://localhost/api/v1/attachments/${submittedFile.id}/download`, ({ request }) =>
        {
            capturedAuth = request.headers.get("authorization");
            return new HttpResponse(new Uint8Array([37, 80, 68, 70, 45]), {
                status: 200,
                headers: {
                    "Content-Type": "application/pdf",
                    "Content-Disposition": "attachment; filename=\"fallback.pdf\"; filename*=UTF-8''invoice%202026.pdf",
                },
            });
        }),
    );

    const createObjectUrl = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:http://localhost/temp-file");
    const revokeObjectUrl = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    let downloadedName = "";
    let downloadedHref = "";
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement)
    {
        downloadedName = this.download;
        downloadedHref = this.href;
    });

    const pendingDetail: RequestDetail = {
        ...baseDetail,
        status: "PENDING",
        workingRevision: null,
        submittedRevision: { id: submittedRevId, revisionNumber: 1, formDefinitionVersionId: versionId, fields: {}, lineItems: [], amount: null, currency: null, submittedAt: "2026-11-06T09:00:00Z", submittedBy: ownerId },
        availableActions: [],
    };

    const user = userEvent.setup();
    const { container } = renderTabs(pendingDetail, `/requests/${requestId}?tab=discussion`);

    expect(await screen.findByText("fallback.pdf")).toBeVisible();
    expect(container.innerHTML).not.toContain("storage.googleapis.com");
    expect(container.innerHTML).not.toContain("secret-jwt-token");

    await user.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    expect(capturedAuth).toBe("Bearer secret-jwt-token");
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(downloadedHref).toBe("blob:http://localhost/temp-file");
    expect(downloadedName).toBe("invoice 2026.pdf");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:http://localhost/temp-file");
});

test("ATT-UI-14 public SSR render for /requests/:id contains no private comments, attachment metadata, or file bytes", () =>
{
    const listCommentsSpy = vi.spyOn(requestApi, "listComments");
    const listAttachmentsSpy = vi.spyOn(requestApi, "listAttachments");

    const html = renderToString(
        <MemoryRouter initialEntries={[`/requests/${requestId}?tab=discussion`]}>
            <SessionProvider>
                <Routes>
                    <Route path="/requests/:id" element={<DetailRoute />} />
                    <Route path="/requests/:id/fallback" element={<RequestDetailPage />} />
                </Routes>
            </SessionProvider>
        </MemoryRouter>,
    );

    expect(listCommentsSpy).not.toHaveBeenCalled();
    expect(listAttachmentsSpy).not.toHaveBeenCalled();
    expect(html).not.toContain("Comment #");
    expect(html).not.toContain("evidence-");
    expect(html).not.toContain("working-quote.pdf");
});
