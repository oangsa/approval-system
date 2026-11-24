import { createRequestSchema, withdrawRequestSchema, requestTypeSearchSchema, type CreateRequest, type RequestDetail, type RequestSearchQuery, type WithdrawRequest } from "@workflow/contracts";
import { requestApi } from "~/api/requests";

/** One in-memory editing session; no request content or action key is persisted in browser storage. */
export class RequestEditingSession
{
    private saved: RequestDetail | null = null;
    private savedContent = "";
    constructor(detail?: RequestDetail, content?: CreateRequest)
    {
        this.saved = detail ?? null;
        this.savedContent = content ? JSON.stringify(createRequestSchema.parse(content)) : "";
    }
    private attempts = new Map<string, { body: string; key: string }>();
    private Key(scope: string, body: unknown): string
    {
        const serialized = JSON.stringify(body);
        const previous = this.attempts.get(scope);
        if (previous?.body === serialized) return previous.key;
        const key = crypto.randomUUID();
        this.attempts.set(scope, { body: serialized, key });
        return key;
    }
    public async Save(value: CreateRequest): Promise<RequestDetail>
    {
        const content = createRequestSchema.parse(value);
        const serialized = JSON.stringify(content);
        if (this.saved && this.savedContent === serialized) return this.saved;
        if (!this.saved) this.saved = await requestApi.create(content, this.Key("create", content));
        else
        {
            const previous = this.savedContent ? JSON.parse(this.savedContent) as CreateRequest : null;
            const { typeId: ignored, ...editable } = content;
            void ignored;
            const fields = Object.fromEntries(Object.entries(editable).filter(([key, value]) => !previous || JSON.stringify(previous[key as keyof CreateRequest]) !== JSON.stringify(value)));
            const body = { ...fields, expectedVersion: this.saved.version };
            this.saved = await requestApi.patch(this.saved.id, body, this.Key("patch", body));
        }
        this.savedContent = serialized;
        return this.saved;
    }
    public async Submit(content: CreateRequest): Promise<RequestDetail>
    {
        const draft = await this.Save(content);
        this.saved = await requestApi.submit(draft.id, draft.version, this.Key("submit", { id: draft.id, expectedVersion: draft.version }));
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
        this.savedContent = JSON.stringify(createRequestSchema.parse(result.content));
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
    const revision = detail.submittedRevision ?? detail.workingRevision;
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
    if (detail.status !== "DRAFT" || !detail.workingRevision || !definition || !detail.availableActions.includes("EDIT_DRAFT")) throw new Error("This draft cannot be edited.");
    const revision = detail.workingRevision;
    const content: CreateRequest = {
        typeId: detail.typeId, formDefinitionVersionId: revision.formDefinitionVersionId,
        title: detail.title, justification: detail.justification, priority: detail.priority, fields: revision.fields,
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
