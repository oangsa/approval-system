import { createHash, randomUUID } from "node:crypto";
import {
    adminRequestTypeDetailSchema,
    adminRequestTypeSummarySchema,
    publishedRequestTypeSchema,
    requestTypeDraftDtoSchema,
    type AdminRequestTypeDetail,
    type AdminRequestTypeSearch,
    type AdminRequestTypeSummary,
    type CreateRequestType,
    type IPageResult,
    type PatchRequestTypeDraft,
    type PublishedRequestType,
    type RequestTypeDraftContent,
    type RequestTypeDraftDto,
    type VersionedRequestTypeAction,
} from "@workflow/contracts";
import type { IActor } from "../../Domains/Identity/Identity";
import type { IRequestTypeRecord, IRequestTypeRepository, IRequestTypeUnitOfWork } from "../../Domains/RequestTypes/Ports";
import {
    assertExpectedVersion,
    assertValidDefinition,
    buildDraftFromPublished,
    mergeDraftPatch,
    RequestTypeError,
} from "../../Domains/RequestTypes/RequestTypeRules";

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

function toDraftDto(record: IRequestTypeRecord): RequestTypeDraftDto
{
    if (!record.draft) throw new RequestTypeError("CONFLICT", [{ field: "draft", code: "NO_ACTIVE_DRAFT", message: "No active draft exists for this request type." }]);
    return requestTypeDraftDtoSchema.parse({
        id: record.id,
        code: record.code,
        name: record.draft.name,
        ...(record.draft.description ? { description: record.draft.description } : {}),
        isEnabled: record.isEnabled,
        monetary: record.draft.monetary,
        supportsLineItems: record.draft.supportsLineItems,
        fields: record.draft.fields,
        version: record.version,
        publishedVersionId: record.publishedVersionId,
        publishedVersionNumber: record.publishedVersion?.versionNumber ?? null,
        updatedAt: record.updatedAt.toISOString(),
    });
}

function toAdminSummary(record: IRequestTypeRecord): AdminRequestTypeSummary
{
    const source = record.draft ?? record.publishedVersion;
    if (!source) throw new RequestTypeError("NOT_FOUND");
    return adminRequestTypeSummarySchema.parse({
        id: record.id,
        code: record.code,
        name: source.name,
        ...(source.description ? { description: source.description } : {}),
        isEnabled: record.isEnabled,
        monetary: source.monetary,
        supportsLineItems: source.supportsLineItems,
        version: record.version,
        publishedVersionId: record.publishedVersionId,
        publishedVersionNumber: record.publishedVersion?.versionNumber ?? null,
        publishedAt: record.publishedVersion?.publishedAt ?? null,
        hasDraft: record.draft !== null,
        updatedAt: record.updatedAt.toISOString(),
    });
}

function toAdminDetail(record: IRequestTypeRecord): AdminRequestTypeDetail
{
    return adminRequestTypeDetailSchema.parse({
        id: record.id,
        code: record.code,
        isEnabled: record.isEnabled,
        version: record.version,
        publishedVersion: record.publishedVersion,
        draft: record.draft,
        versions: record.versions,
        createdAt: record.createdAt.toISOString(),
        updatedAt: record.updatedAt.toISOString(),
    });
}

export class RequestTypeService
{
    constructor(private readonly unit: IRequestTypeUnitOfWork)
    {
    }

    private RequireAdmin(actor: IActor): void
    {
        if (!actor.roles.includes("ADMINISTRATOR")) throw new RequestTypeError("FORBIDDEN");
    }

    private async RequireAdminActor(repository: IRequestTypeRepository, actor: IActor): Promise<IActor>
    {
        const current = await repository.CurrentActor(actor);
        this.RequireAdmin(current);
        return current;
    }

    public async SearchAdmin(actor: IActor, query: AdminRequestTypeSearch): Promise<IPageResult<AdminRequestTypeSummary>>
    {
        return this.unit.Run(async (repository) =>
        {
            await this.RequireAdminActor(repository, actor);
            return repository.SearchAdmin(query);
        });
    }

    public async ReadAdmin(actor: IActor, id: string): Promise<AdminRequestTypeDetail>
    {
        const normalizedId = id.toLowerCase();
        return this.unit.Run(async (repository) =>
        {
            await this.RequireAdminActor(repository, actor);
            const record = await repository.Read(normalizedId);
            if (!record) throw new RequestTypeError("NOT_FOUND");
            return toAdminDetail(record);
        });
    }

    public async Create(actor: IActor, body: CreateRequestType, key?: string): Promise<RequestTypeDraftDto>
    {
        return this.unit.Run(async (repository) =>
        {
            const current = await this.RequireAdminActor(repository, actor);
            const scope = "POST /api/v1/admin/request-types";
            const bodyHash = createHash("sha256").update(canonical(body)).digest("hex");
            if (key)
            {
                const replay = await repository.Replay<RequestTypeDraftDto>(current.account.id, scope, key, bodyHash);
                if (replay) return requestTypeDraftDtoSchema.parse(replay);
            }
            const { code, ...draftContent } = body;
            const draft: RequestTypeDraftContent = {
                name: draftContent.name,
                ...(draftContent.description ? { description: draftContent.description } : {}),
                monetary: draftContent.monetary,
                supportsLineItems: draftContent.supportsLineItems,
                fields: draftContent.fields,
            };
            assertValidDefinition(draft);
            const id = randomUUID();
            const now = new Date();
            await repository.Create(id, code, draft, now);
            const created = await repository.Read(id);
            const result = toDraftDto(created!);
            if (key) await repository.Complete(current.account.id, scope, key, bodyHash, result);
            return result;
        });
    }

    public async PatchDraft(actor: IActor, id: string, body: PatchRequestTypeDraft, key?: string): Promise<RequestTypeDraftDto>
    {
        const normalizedId = id.toLowerCase();
        return this.unit.Run(async (repository) =>
        {
            const current = await this.RequireAdminActor(repository, actor);
            const scope = `PATCH /api/v1/admin/request-types/${normalizedId}/draft`;
            const bodyHash = createHash("sha256").update(canonical(body)).digest("hex");
            if (key)
            {
                const replay = await repository.Replay<RequestTypeDraftDto>(current.account.id, scope, key, bodyHash);
                if (replay) return requestTypeDraftDtoSchema.parse(replay);
            }
            const record = await repository.Read(normalizedId, true);
            if (!record) throw new RequestTypeError("NOT_FOUND");
            assertExpectedVersion(record.version, body.expectedVersion);
            if (!record.draft)
            {
                throw new RequestTypeError("CONFLICT", [{ field: "draft", code: "NO_ACTIVE_DRAFT", message: "Create a new draft before editing this published request type." }]);
            }
            const merged = mergeDraftPatch(record.draft, body);
            assertValidDefinition(merged);
            const now = new Date();
            await repository.SaveDraft(normalizedId, merged, record.version + 1, now);
            const updated = await repository.Read(normalizedId);
            const result = toDraftDto(updated!);
            if (key) await repository.Complete(current.account.id, scope, key, bodyHash, result);
            return result;
        });
    }

    public async BranchDraft(actor: IActor, id: string, body: VersionedRequestTypeAction, key?: string): Promise<RequestTypeDraftDto>
    {
        const normalizedId = id.toLowerCase();
        return this.unit.Run(async (repository) =>
        {
            const current = await this.RequireAdminActor(repository, actor);
            const scope = `POST /api/v1/admin/request-types/${normalizedId}/draft`;
            const bodyHash = createHash("sha256").update(canonical(body)).digest("hex");
            if (key)
            {
                const replay = await repository.Replay<RequestTypeDraftDto>(current.account.id, scope, key, bodyHash);
                if (replay) return requestTypeDraftDtoSchema.parse(replay);
            }
            const record = await repository.Read(normalizedId, true);
            if (!record) throw new RequestTypeError("NOT_FOUND");
            assertExpectedVersion(record.version, body.expectedVersion);
            if (record.draft)
            {
                throw new RequestTypeError("CONFLICT", [{ field: "draft", code: "DRAFT_ALREADY_EXISTS", message: "An active draft already exists for this request type." }]);
            }
            if (!record.publishedVersion)
            {
                throw new RequestTypeError("CONFLICT", [{ field: "publishedVersion", code: "NO_PUBLISHED_VERSION", message: "No published version exists to branch." }]);
            }
            const draft = buildDraftFromPublished(record.publishedVersion);
            const now = new Date();
            await repository.SaveDraft(normalizedId, draft, record.version + 1, now);
            const updated = await repository.Read(normalizedId);
            const result = toDraftDto(updated!);
            if (key) await repository.Complete(current.account.id, scope, key, bodyHash, result);
            return result;
        });
    }

    public async Publish(actor: IActor, id: string, body: VersionedRequestTypeAction, key: string): Promise<PublishedRequestType>
    {
        const normalizedId = id.toLowerCase();
        return this.unit.Run(async (repository) =>
        {
            const current = await this.RequireAdminActor(repository, actor);
            const scope = `POST /api/v1/admin/request-types/${normalizedId}/publish`;
            const bodyHash = createHash("sha256").update(canonical(body)).digest("hex");
            const replay = await repository.Replay<PublishedRequestType>(current.account.id, scope, key, bodyHash);
            if (replay) return publishedRequestTypeSchema.parse(replay);

            const record = await repository.Read(normalizedId, true);
            if (!record) throw new RequestTypeError("NOT_FOUND");
            assertExpectedVersion(record.version, body.expectedVersion);
            if (!record.draft)
            {
                throw new RequestTypeError("CONFLICT", [{ field: "draft", code: "NO_ACTIVE_DRAFT", message: "No active draft exists to publish." }]);
            }
            assertValidDefinition(record.draft);
            const now = new Date();
            const published = publishedRequestTypeSchema.parse({
                id: record.id,
                code: record.code,
                name: record.draft.name,
                ...(record.draft.description ? { description: record.draft.description } : {}),
                versionId: randomUUID(),
                versionNumber: (record.publishedVersion?.versionNumber ?? 0) + 1,
                isEnabled: record.isEnabled,
                supportsLineItems: record.draft.supportsLineItems,
                monetary: record.draft.monetary,
                fields: record.draft.fields,
                publishedAt: now.toISOString(),
            });
            await repository.Publish(normalizedId, published, record.version + 1, now);
            await repository.Complete(current.account.id, scope, key, bodyHash, published);
            return published;
        });
    }

    public async SetEnabled(actor: IActor, id: string, enabled: boolean, body: VersionedRequestTypeAction, key?: string): Promise<AdminRequestTypeSummary>
    {
        const normalizedId = id.toLowerCase();
        return this.unit.Run(async (repository) =>
        {
            const current = await this.RequireAdminActor(repository, actor);
            const scope = `POST /api/v1/admin/request-types/${normalizedId}/${enabled ? "enable" : "disable"}`;
            const bodyHash = createHash("sha256").update(canonical(body)).digest("hex");
            if (key)
            {
                const replay = await repository.Replay<AdminRequestTypeSummary>(current.account.id, scope, key, bodyHash);
                if (replay) return adminRequestTypeSummarySchema.parse(replay);
            }
            const record = await repository.Read(normalizedId, true);
            if (!record) throw new RequestTypeError("NOT_FOUND");
            assertExpectedVersion(record.version, body.expectedVersion);
            const now = new Date();
            await repository.SetEnabled(normalizedId, enabled, record.version + 1, now);
            const updated = await repository.Read(normalizedId);
            const result = toAdminSummary(updated!);
            if (key) await repository.Complete(current.account.id, scope, key, bodyHash, result);
            return result;
        });
    }
}
