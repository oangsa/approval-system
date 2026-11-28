import { createFieldRecord, createRequestSchema, withdrawRequestSchema, requestTypeSearchSchema, type AttachmentQuery, type CommentQuery, type CreateCommentInput, type CreateRequest, type RequestDetail, type RequestSearchQuery, type WithdrawRequest } from "@workflow/contracts";
import { requestApi, type IUploadAttachmentOptions } from "~/api/requests";
import { ApiFailure } from "~/api/errors";

/** One in-memory editing session; no request content or action key is persisted in browser storage. */
function canonical(value: unknown): string
{
    if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? "null" : canonical(item)).join(",")}]`;
    if (value !== null && typeof value === "object")
    {
        return `{${Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
            .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}

export class RequestEditingSession
{
    private saved: RequestDetail | null = null;
    private savedContent = "";
    constructor(detail?: RequestDetail, content?: CreateRequest)
    {
        this.saved = detail ?? null;
        this.savedContent = content ? canonical(createRequestSchema.parse(content)) : "";
    }
    private attempts = new Map<string, { body: string; key: string }>();
    private Key(scope: string, body: unknown): string
    {
        const serialized = canonical(body);
        const previous = this.attempts.get(scope);
        if (previous?.body === serialized) return previous.key;
        const key = crypto.randomUUID();
        this.attempts.set(scope, { body: serialized, key });
        return key;
    }
    public async Save(value: CreateRequest): Promise<RequestDetail>
    {
        const content = createRequestSchema.parse(value);
        const serialized = canonical(content);
        if (this.saved && this.savedContent === serialized)
        {
            const current = await requestApi.read(this.saved.id);
            if (current.status !== this.saved.status || !["DRAFT", "RETURNED"].includes(current.status) || !current.workingRevision) throw new ApiFailure({ kind: "http", status: 409, code: "INVALID_REQUEST_TRANSITION", message: "This request is no longer an editable draft." });
            if (!current.availableActions.includes("EDIT_DRAFT")) throw new ApiFailure({ kind: "http", status: 403, code: "FORBIDDEN", message: "You no longer have permission to edit this draft." });
            if (current.version !== this.saved.version) throw new ApiFailure({ kind: "http", status: 409, code: "REQUEST_STALE", message: "This draft has changed. Reload the saved draft before editing." });
            this.saved = current;
            return current;
        }
        if (!this.saved) this.saved = await requestApi.create(content, this.Key("create", content));
        else
        {
            const previous = this.savedContent ? JSON.parse(this.savedContent) as CreateRequest : null;
            const { typeId: ignored, ...editable } = content;
            void ignored;
            const fields = Object.fromEntries(Object.entries(editable).filter(([key, value]) => !previous || canonical(previous[key as keyof CreateRequest]) !== canonical(value)));
            const body = { ...fields, expectedVersion: this.saved.version };
            this.saved = await requestApi.patch(this.saved.id, body, this.Key("patch", body));
        }
        this.savedContent = serialized;
        return this.saved;
    }
    public async Submit(content: CreateRequest): Promise<RequestDetail>
    {
        // Submit performs its own authoritative checks and must replay an accepted lost response.
        const draft = this.saved && this.savedContent === canonical(createRequestSchema.parse(content)) ? this.saved : await this.Save(content);
        const operation = draft.status === "RETURNED" ? "resubmit" : "submit";
        this.saved = await requestApi[operation](draft.id, draft.version, this.Key(operation, { id: draft.id, expectedVersion: draft.version }));
        return this.saved;
    }
    public SavedId(): string | null
    {
        return this.saved?.id ?? null;
    }
    public async Reload(generation?: number)
    {
        if (!this.saved) throw new Error("No saved draft to reload.");
        const result = await resumeDraft(this.saved.id, new AbortController().signal, generation);
        this.saved = result.detail;
        this.savedContent = canonical(createRequestSchema.parse(result.content));
        this.attempts.clear();
        return result;
    }
    public HasSaved(): boolean
    {
        return this.saved !== null;
    }
}

export function searchRequests(query: RequestSearchQuery, signal?: AbortSignal, generation?: number)
{
    return requestApi.search(query, signal, generation);
}

export function searchRequestTypes(term: string, page: number, signal: AbortSignal, generation: number)
{
    return requestApi.searchTypes(requestTypeSearchSchema.parse({ pageNumber: page, pageSize: 20, ...(term.trim() ? { searchTerm: { name: "code,name", value: term.trim() } } : {}) }), signal, generation);
}

export async function readRequestResult(id: string, signal?: AbortSignal, generation?: number)
{
    const detail = await requestApi.read(id, signal, generation);
    const revision = detail.status === "RETURNED" ? detail.workingRevision : detail.submittedRevision ?? detail.workingRevision;
    const definition = revision ? await requestApi.version(detail.typeId, revision.formDefinitionVersionId, detail.id, signal, generation) : null;
    return { detail, definition };
}

export async function readRequestTypeSelection(id: string, signal: AbortSignal, generation: number)
{
    const type = await requestApi.type(id, signal, generation);
    return type.isEnabled ? { id: type.id, name: type.name, code: type.code } : null;
}

export async function resumeDraft(id: string, signal: AbortSignal, generation?: number)
{
    const result = await readRequestResult(id, signal, generation);
    const { detail, definition } = result;
    if (!["DRAFT", "RETURNED"].includes(detail.status) || !detail.workingRevision || !definition || !detail.availableActions.includes("EDIT_DRAFT")) throw new Error("This draft cannot be edited.");
    const revision = detail.workingRevision;
    const content: CreateRequest = {
        typeId: detail.typeId, formDefinitionVersionId: revision.formDefinitionVersionId,
        title: detail.title, justification: detail.justification, priority: detail.priority, fields: createFieldRecord(revision.fields),
        lineItems: revision.lineItems.map(({ description, quantity, unitAmount }) => ({ description, quantity, unitAmount })),
        monetaryAmount: definition.monetary && !definition.supportsLineItems ? revision.amount : null,
    };
    return { detail, definition, content };
}

export class WithdrawalAttempt
{
    private attempt: { payload: string; key: string } | null = null;
    public Submit(id: string, input: WithdrawRequest, generation: number)
    {
        const body = withdrawRequestSchema.parse(input);
        const payload = JSON.stringify([id, body]);
        if (this.attempt?.payload !== payload) this.attempt = { payload, key: crypto.randomUUID() };
        return requestApi.withdraw(id, body, this.attempt.key, generation);
    }
}

export function readRequestState(id: string, generation?: number)
{
    return requestApi.read(id, undefined, generation);
}

export function readApprovers(id: string, signal: AbortSignal, generation: number)
{
    return requestApi.approvers(id, signal, generation);
}

export function readRevisions(id: string, page: number, signal?: AbortSignal, generation?: number)
{
    return requestApi.revisions(id, page, signal, generation);
}

export function readRevision(id: string, revisionId: string, signal?: AbortSignal, generation?: number)
{
    return requestApi.revision(id, revisionId, signal, generation);
}

export function readComments(id: string, query: Partial<CommentQuery>, signal?: AbortSignal, generation?: number)
{
    return requestApi.listComments(id, query, signal, generation);
}

export function addComment(id: string, input: CreateCommentInput, signal?: AbortSignal, generation?: number)
{
    return requestApi.createComment(id, input, signal, generation);
}

export function readAttachments(id: string, query: Partial<AttachmentQuery>, signal?: AbortSignal, generation?: number)
{
    return requestApi.listAttachments(id, query, signal, generation);
}

export function uploadWorkingAttachment(options: IUploadAttachmentOptions)
{
    return requestApi.uploadAttachment(options);
}

export function removeWorkingAttachment(requestId: string, attachmentId: string, signal?: AbortSignal, generation?: number)
{
    return requestApi.deleteAttachment(requestId, attachmentId, signal, generation);
}

export function downloadRequestAttachment(attachmentId: string, fallbackFileName: string, signal?: AbortSignal, generation?: number)
{
    return requestApi.downloadAttachment(attachmentId, fallbackFileName, signal, generation);
}
