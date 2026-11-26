import {
    adminRequestTypeSearchSchema,
    createRequestTypeSchema,
    patchRequestTypeDraftSchema,
    versionedRequestTypeActionSchema,
    type AdminRequestTypeSearch,
    type CreateRequestType,
    type PatchRequestTypeDraft,
    type VersionedRequestTypeAction,
} from "@workflow/contracts";
import { requestTypeApi } from "~/api/requestTypes";

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

export class RequestTypeActionAttempt
{
    private attempts = new Map<string, { payload: string; key: string }>();

    public Key(scope: string, body: unknown): string
    {
        const payload = canonical(body);
        const existing = this.attempts.get(scope);
        if (existing?.payload === payload) return existing.key;
        const key = crypto.randomUUID();
        this.attempts.set(scope, { payload, key });
        return key;
    }

    public Clear(scope?: string): void
    {
        if (scope) this.attempts.delete(scope);
        else this.attempts.clear();
    }
}

export function searchAdminRequestTypes(query: AdminRequestTypeSearch, signal?: AbortSignal, generation?: number)
{
    return requestTypeApi.searchAdmin(adminRequestTypeSearchSchema.parse(query), signal, generation);
}

export function readAdminRequestType(id: string, signal?: AbortSignal, generation?: number)
{
    return requestTypeApi.readAdmin(id, signal, generation);
}

export function readRequestTypeVersion(id: string, versionId: string, signal?: AbortSignal, generation?: number)
{
    return requestTypeApi.readVersion(id, versionId, signal, generation);
}

export function createAdminRequestType(body: CreateRequestType, attempts: RequestTypeActionAttempt, generation?: number)
{
    const parsed = createRequestTypeSchema.parse(body);
    return requestTypeApi.create(parsed, attempts.Key("create", parsed), generation);
}

export function patchAdminRequestTypeDraft(id: string, body: PatchRequestTypeDraft, attempts: RequestTypeActionAttempt, generation?: number)
{
    const parsed = patchRequestTypeDraftSchema.parse(body);
    return requestTypeApi.patchDraft(id, parsed, attempts.Key(`patch:${id}`, parsed), generation);
}

export function branchAdminRequestTypeDraft(id: string, body: VersionedRequestTypeAction, attempts: RequestTypeActionAttempt, generation?: number)
{
    const parsed = versionedRequestTypeActionSchema.parse(body);
    return requestTypeApi.branchDraft(id, parsed, attempts.Key(`branch:${id}`, parsed), generation);
}

export function publishAdminRequestType(id: string, body: VersionedRequestTypeAction, attempts: RequestTypeActionAttempt, generation?: number)
{
    const parsed = versionedRequestTypeActionSchema.parse(body);
    return requestTypeApi.publish(id, parsed, attempts.Key(`publish:${id}`, parsed), generation);
}

export function setAdminRequestTypeEnabled(id: string, enabled: boolean, body: VersionedRequestTypeAction, attempts: RequestTypeActionAttempt, generation?: number)
{
    const parsed = versionedRequestTypeActionSchema.parse(body);
    const key = attempts.Key(`${enabled ? "enable" : "disable"}:${id}`, parsed);
    return enabled ? requestTypeApi.enable(id, parsed, key, generation) : requestTypeApi.disable(id, parsed, key, generation);
}
