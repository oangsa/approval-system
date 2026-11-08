import { createRequestSchema, type CreateRequest, type RequestDetail, type RequestSearchQuery } from "@workflow/contracts";
import { requestApi } from "~/api/requests";

/** One in-memory editing session; no request content or action key is persisted in browser storage. */
export class RequestEditingSession
{
    private saved: RequestDetail | null = null;
    private savedContent = "";
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
            const { typeId: ignored, ...fields } = content;
            void ignored;
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
    public HasSaved(): boolean
    {
        return this.saved !== null;
    }
}

export function searchRequests(query: RequestSearchQuery, signal?: AbortSignal, generation?: number)
{
    return requestApi.search(query, signal, generation);
}

export async function readRequestResult(id: string, signal?: AbortSignal, generation?: number)
{
    const detail = await requestApi.read(id, signal, generation);
    const revision = detail.submittedRevision ?? detail.workingRevision;
    const definition = revision ? await requestApi.version(detail.typeId, revision.formDefinitionVersionId, detail.id, signal, generation) : null;
    return { detail, definition };
}
