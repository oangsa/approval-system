import { createHash } from "node:crypto";
import type { CreateRequest, PatchDraft, RequestDetail, RequestTypeSearch, RequestSearchQuery } from "@workflow/contracts";
import type { IActor } from "../../Domains/Identity/Identity";
import type { IRequestRepository, IRequestUnitOfWork, RequestMutation } from "../../Domains/Requests/Ports";
import { RequestAccessPolicy, ToRequestAccessContext } from "../../Domains/Requests/RequestAccessPolicy";
import { assertContent, assertPublishedDefinition, assertWithdrawal, editableContent, RequestError, resolvePlan } from "../../Domains/Requests/RequestRules";

function canonical(value: unknown): string
{
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
    return JSON.stringify(value);
}
export class RequestService
{
    constructor(private readonly unit: IRequestUnitOfWork)
    {
    }

    private async Owner(repository: IRequestRepository, actor: IActor, id: string, lock = false): Promise<RequestDetail>
    {
        const detail = await repository.Read(id, lock);
        if (!detail || detail.requester.id !== actor.account.id) throw new RequestError("NOT_FOUND");
        return detail;
    }
    private RequireRequester(actor: IActor): void
    {
        if (!actor.roles.includes("REQUESTER")) throw new RequestError("FORBIDDEN");
    }
    public async Mutate(actor: IActor, operation: "create" | "patch" | "submit" | "resubmit" | "withdraw", id: string | null, body: RequestMutation, key?: string): Promise<RequestDetail>
    {
        id = id?.toLowerCase() ?? null;
        return this.unit.Run(async (repository) =>
        {
            actor = await repository.CurrentActor(actor);
            this.RequireRequester(actor);
            const scope = operation === "create" ? "POST /api/v1/requests" : `${operation === "patch" ? "PATCH" : "POST"} /api/v1/requests/${id}/${operation === "patch" ? "draft" : operation}`;
            const bodyHash = createHash("sha256").update(canonical(body)).digest("hex");
            if (key)
            {
                const replay = await repository.Replay(actor.account.id, scope, key, bodyHash);
                if (replay) return replay;
            }
            let resultId: string;
            if (operation === "create")
            {
                const content = body as CreateRequest;
                const config = await repository.Configuration(content.typeId, content.formDefinitionVersionId, actor.account.id);
                const definition = assertPublishedDefinition(config.definition, { typeId: content.typeId, versionId: content.formDefinitionVersionId });
                if (!config.isEnabled) throw new RequestError("CONFIGURATION_INCOMPLETE");
                resultId = await repository.Create(actor, content, assertContent(definition, content, false));
            }
            else if (operation === "withdraw")
            {
                const detail = await this.Owner(repository, actor, id!, true);
                const withdrawal = body as import("@workflow/contracts").WithdrawRequest;
                assertWithdrawal(detail, withdrawal.expectedVersion);
                await repository.Withdraw(detail, actor.account.id, withdrawal.reason);
                resultId = id!;
            }
            else
            {
                const detail = await this.Owner(repository, actor, id!, true);
                const allowedStatus = operation === "patch" ? detail.status === "DRAFT" || detail.status === "RETURNED" : operation === "resubmit" ? detail.status === "RETURNED" : detail.status === "DRAFT";
                if (!allowedStatus || !detail.workingRevision) throw new RequestError("INVALID_REQUEST_TRANSITION");
                if (!("expectedVersion" in body) || detail.version !== body.expectedVersion) throw new RequestError("REQUEST_STALE");
                if (detail.status === "RETURNED" && operation === "patch" && (body as PatchDraft).formDefinitionVersionId !== undefined && (body as PatchDraft).formDefinitionVersionId!.toLowerCase() !== detail.workingRevision.formDefinitionVersionId.toLowerCase())
                {
                    throw new RequestError("FORM_DEFINITION_CHANGED");
                }
                if (operation === "resubmit" && !detail.department) throw new RequestError("CONFIGURATION_INCOMPLETE");
                const selectedVersionId = operation === "patch" ? (body as PatchDraft).formDefinitionVersionId?.toLowerCase() ?? detail.workingRevision.formDefinitionVersionId : detail.workingRevision.formDefinitionVersionId;
                const config = await repository.Configuration(detail.typeId, selectedVersionId, actor.account.id, operation === "resubmit" ? detail.department ?? undefined : undefined);
                const targetDefinition = assertPublishedDefinition(config.definition, { typeId: detail.typeId, versionId: selectedVersionId });
                const originalRaw = selectedVersionId === detail.workingRevision.formDefinitionVersionId ? targetDefinition : await repository.TypeVersion(detail.typeId, detail.workingRevision.formDefinitionVersionId);
                if (!originalRaw) throw new RequestError("NOT_FOUND");
                const originalDefinition = selectedVersionId === detail.workingRevision.formDefinitionVersionId ? targetDefinition : assertPublishedDefinition(originalRaw, { typeId: detail.typeId, versionId: detail.workingRevision.formDefinitionVersionId });
                let content = editableContent(detail, originalDefinition);
                if (operation === "patch")
                {
                    const { expectedVersion: ignored, ...changes } = body as PatchDraft;
                    void ignored;
                    content = { ...content, ...changes };
                }
                if (operation === "submit" && content.formDefinitionVersionId !== config.activeVersionId) throw new RequestError("FORM_DEFINITION_CHANGED");
                const amount = assertContent(targetDefinition, content, operation === "submit" || operation === "resubmit");
                if (operation === "patch") await repository.Patch(id!, actor.account.id, content, amount, "lineItems" in body);
                else await repository.Submit(id!, actor.account.id, resolvePlan({ ...config, definition: targetDefinition }, actor.account.id, amount, { allowDisabledType: operation === "resubmit" }));
                resultId = id!;
            }
            const result = (await repository.Read(resultId))!;
            if (key) await repository.Complete(actor.account.id, scope, key, bodyHash, result);
            return result;
        });
    }
    private async Readable(repository: IRequestRepository, actor: IActor, id: string, lock = false): Promise<RequestDetail>
    {
        const detail = await repository.Read(id, lock);
        if (!detail || detail.requester.id !== actor.account.id && !(actor.roles.includes("REVIEWER") && detail.status === "PENDING" && detail.currentApprovers.some((slot) => slot.reviewer.id === actor.account.id && ["ACTIONABLE", "WAITING"].includes(slot.status)))) throw new RequestError("NOT_FOUND");
        return detail;
    }
    public async Revisions(actor: IActor, id: string, query: import("@workflow/contracts").RevisionQuery)
    {
        return this.unit.Run(async (repository) =>
        {
            actor = await repository.CurrentActor(actor);
            await repository.Read(id, true);
            await this.Readable(repository, actor, id);
            return repository.Revisions(id, query);
        });
    }
    public async Revision(actor: IActor, id: string, revisionId: string)
    {
        return this.unit.Run(async (repository) =>
        {
            actor = await repository.CurrentActor(actor);
            const detail = await repository.Read(id, true);
            if (!detail) throw new RequestError("NOT_FOUND");
            const current = detail.requester.id === actor.account.id || actor.roles.includes("REVIEWER") && detail.status === "PENDING" && detail.currentApprovers.some((slot) => slot.reviewer.id === actor.account.id && ["ACTIONABLE", "WAITING"].includes(slot.status));
            const revision = await repository.SubmittedRevision(id, revisionId, actor.account.id, current);
            if (!revision) throw new RequestError("NOT_FOUND");
            return revision;
        });
    }
    public async TypeVersion(actor: IActor, id: string, versionId: string, requestId?: string)
    {
        id = id.toLowerCase();
        versionId = versionId.toLowerCase();
        requestId = requestId?.toLowerCase();
        return this.unit.Run(async (repository) =>
        {
            actor = await repository.CurrentActor(actor);
            if (!actor.roles.includes("ADMINISTRATOR"))
            {
                if (!requestId) throw new RequestError("NOT_FOUND");
                const detail = await this.Readable(repository, actor, requestId);
                if (detail.typeId !== id || ![detail.submittedRevision, detail.workingRevision].some((revision) => revision?.formDefinitionVersionId === versionId)) throw new RequestError("NOT_FOUND");
            }
            const definition = await repository.TypeVersion(id, versionId);
            if (!definition) throw new RequestError("NOT_FOUND");
            return assertPublishedDefinition(definition, { typeId: id, versionId });
        });
    }
    public async Read(actor: IActor, id: string): Promise<RequestDetail>
    {
        return this.unit.Run(async (repository) =>
        {
            actor = await repository.CurrentActor(actor);
            const detail = await repository.Read(id, false);
            if (!detail) throw new RequestError("NOT_FOUND");
            RequestAccessPolicy.AssertCanReadCurrentRequest(actor, ToRequestAccessContext(detail));
            return { ...detail, availableActions: detail.requester.id === actor.account.id && actor.roles.includes("REQUESTER") ? detail.availableActions : [] };
        });
    }
    public async Approvers(actor: IActor, id: string)
    {
        return this.unit.Run(async (repository) =>
        {
            actor = await repository.CurrentActor(actor);
            return (await this.Readable(repository, actor, id.toLowerCase(), true)).currentApprovers;
        });
    }
    public async Search(actor: IActor, query: RequestSearchQuery)
    {
        return this.unit.Run(async (repository) =>
        {
            actor = await repository.CurrentActor(actor);
            this.RequireRequester(actor);
            return repository.Search(actor.account.id, query);
        });
    }
    public async Type(actor: IActor, id: string)
    {
        return this.unit.Run(async (repository) =>
        {
            await repository.CurrentActor(actor);
            const type = await repository.Type(id);
            if (!type) throw new RequestError("NOT_FOUND");
            return assertPublishedDefinition(type, { typeId: id });
        });
    }
    public async Types(actor: IActor, query: RequestTypeSearch)
    {
        return this.unit.Run(async (repository) =>
        {
            const current = await repository.CurrentActor(actor);
            const allowDisabled = current.roles.includes("ADMINISTRATOR") && query.search.some((filter) => filter.name === "isEnabled");
            const result = await repository.Types(query, allowDisabled);
            return { ...result, items: result.items.map((item) => assertPublishedDefinition(item, { typeId: item.id })) };
        });
    }
}
