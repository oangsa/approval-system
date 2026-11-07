import { createHash } from "node:crypto";
import type { CreateRequest, PatchDraft, RequestDetail, RequestTypeSearch, RequestSearchQuery } from "@workflow/contracts";
import type { IActor } from "../../Domains/Identity/Identity";
import type { IRequestRepository, IRequestUnitOfWork, RequestMutation } from "../../Domains/Requests/Ports";
import { assertContent, editableContent, RequestError, resolvePlan } from "../../Domains/Requests/RequestRules";

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
    public async Mutate(actor: IActor, operation: "create" | "patch" | "submit", id: string | null, body: RequestMutation, key?: string): Promise<RequestDetail>
    {
        return this.unit.Run(async (repository) =>
        {
            actor = await repository.CurrentActor(actor);
            this.RequireRequester(actor);
            const scope = operation === "create" ? "POST /api/v1/requests" : `${operation === "patch" ? "PATCH" : "POST"} /api/v1/requests/${id}/${operation === "patch" ? "draft" : "submit"}`;
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
                if (!config.isEnabled) throw new RequestError("CONFIGURATION_INCOMPLETE");
                resultId = await repository.Create(actor, content, assertContent(config.definition, content, false));
            }
            else
            {
                const detail = await this.Owner(repository, actor, id!, true);
                if (detail.status !== "DRAFT" || !detail.workingRevision) throw new RequestError("INVALID_REQUEST_TRANSITION");
                if (!("expectedVersion" in body) || detail.version !== body.expectedVersion) throw new RequestError("REQUEST_STALE");
                const selectedVersionId = operation === "patch" ? (body as PatchDraft).formDefinitionVersionId ?? detail.workingRevision.formDefinitionVersionId : detail.workingRevision.formDefinitionVersionId;
                const config = await repository.Configuration(detail.typeId, selectedVersionId, actor.account.id);
                let content = editableContent(detail, config.definition);
                if (operation === "patch")
                {
                    const { expectedVersion: ignored, ...changes } = body as PatchDraft;
                    void ignored;
                    content = { ...content, ...changes };
                }
                if (operation === "submit" && content.formDefinitionVersionId !== config.activeVersionId) throw new RequestError("FORM_DEFINITION_CHANGED");
                const amount = assertContent(config.definition, content, operation === "submit");
                if (operation === "patch") await repository.Patch(id!, actor.account.id, content, amount);
                else await repository.Submit(id!, actor.account.id, resolvePlan(config, actor.account.id, amount));
                resultId = id!;
            }
            const result = (await repository.Read(resultId))!;
            if (key) await repository.Complete(actor.account.id, scope, key, bodyHash, result);
            return result;
        });
    }
    private async Readable(repository: IRequestRepository, actor: IActor, id: string): Promise<RequestDetail>
    {
        const detail = await repository.Read(id);
        if (!detail || detail.requester.id !== actor.account.id && !(actor.roles.includes("REVIEWER") && detail.status === "PENDING" && detail.currentApprovers.some((slot) => slot.reviewer.id === actor.account.id && ["ACTIONABLE", "WAITING"].includes(slot.status)))) throw new RequestError("NOT_FOUND");
        return detail;
    }
    public async TypeVersion(actor: IActor, id: string, versionId: string, requestId?: string)
    {
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
            return definition;
        });
    }
    public async Read(actor: IActor, id: string): Promise<RequestDetail>
    {
        return this.unit.Run(async (repository) =>
        {
            actor = await repository.CurrentActor(actor);
            const detail = await this.Readable(repository, actor, id);
            return { ...detail, availableActions: detail.requester.id === actor.account.id && actor.roles.includes("REQUESTER") ? detail.availableActions : [] };
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
            return type;
        });
    }
    public async Types(actor: IActor, query: RequestTypeSearch)
    {
        return this.unit.Run(async (repository) =>
        {
            await repository.CurrentActor(actor);
            return repository.Types(query);
        });
    }
}
