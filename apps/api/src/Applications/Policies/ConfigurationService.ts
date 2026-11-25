import { z } from "zod";
import { createHash, randomUUID } from "node:crypto";
import { assignmentRuleSchema, budgetPolicySchema, createApprovalPolicySchema, createAssignmentRuleSchema, createBudgetPolicySchema, patchAssignmentRuleSchema, policyContentSchema, type ApprovalPolicyDTO, type ConfigurationKind, type ConfigurationSearch, type CreateApprovalPolicy, type CreateAssignmentRule, type CreateBudgetPolicy, type PatchApprovalPolicy, type PatchAssignmentRule, type PatchBudgetPolicy } from "@workflow/contracts";
import type { IActor } from "../../Domains/Identity/Identity";
import type { IConfigurationRepository, IConfigurationUnitOfWork, IPolicyRecord } from "../../Domains/Policies/Ports";
import { assertConfigurationVersion, policyDto } from "../../Domains/Policies/PolicyRules";
import { RequestError } from "../../Domains/Requests/RequestRules";

function validate<T>(schema: z.ZodType<T>, value: unknown): T
{
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new RequestError("VALIDATION_ERROR", parsed.error.issues.map((issue) => ({ field: issue.path.join(".") || "configuration", code: "VALIDATION_ERROR", message: issue.message })));
    return parsed.data;
}
export class ConfigurationService
{
    constructor(private readonly unit: IConfigurationUnitOfWork)
    {
    }

    public async Search(actor: IActor, kind: ConfigurationKind, query: ConfigurationSearch)
    {
        return this.unit.Run(async (repository) =>
        {
            await repository.Lock(false);
            await repository.CurrentAdmin(actor);
            switch (kind)
            {
                case "approval-policies": return repository.Search(kind, query);
                case "reviewer-assignments": return repository.Search(kind, query);
                case "budget-policies": return repository.Search(kind, query);
                case "reviewers": return repository.Search(kind, query);
                case "departments": return repository.Search(kind, query);
            }
        });
    }

    private async References(repository: IConfigurationRepository, typeId: string | null, departmentId: string | null, reviewerIds?: string[]): Promise<void>
    {
        if (!await repository.ValidateReferences(typeId, departmentId, reviewerIds)) throw new RequestError("VALIDATION_ERROR", [{ field: "configuration", code: "INVALID_REFERENCE", message: "Choose an existing type, active department and active eligible reviewers." }]);
    }

    public async CreatePolicy(actor: IActor, input: CreateApprovalPolicy): Promise<ApprovalPolicyDTO>
    {
        const body = validate(createApprovalPolicySchema, input);
        return this.unit.Run(async (repository) =>
        {
            await repository.Lock(true);
            const current = await repository.CurrentAdmin(actor);
            await this.References(repository, body.typeId, body.departmentId);
            const { code, ...content } = body;
            const record: IPolicyRecord = { id: randomUUID(), code, version: 0, isEnabled: true, draft: validate(policyContentSchema, content), published: null };
            await repository.SavePolicy(record);
            const result = policyDto(record);
            await repository.Audit(current.account.id, record.id, "POLICY_CREATED", null, result);
            return result;
        });
    }

    public async PolicyAction(actor: IActor, id: string, action: "patch" | "branch" | "publish" | "disable", body: PatchApprovalPolicy, key?: string): Promise<ApprovalPolicyDTO>
    {
        id = id.toLowerCase();
        return this.unit.Run(async (repository) =>
        {
            await repository.Lock(true);
            const current = await repository.CurrentAdmin(actor);
            const scope = `${action}:${id}`;
            const hash = createHash("sha256").update(JSON.stringify(Object.entries(body).sort(([a], [b]) => a.localeCompare(b)))).digest("hex");
            if (action === "publish")
            {
                if (!key) throw new RequestError("VALIDATION_ERROR");
                const replay = await repository.Replay(current.account.id, scope, key, hash);
                if (replay) return replay;
            }
            const record = await repository.Policy(id);
            if (!record) throw new RequestError("NOT_FOUND");
            assertConfigurationVersion(record.version, body.expectedVersion);
            const before = policyDto(record);
            const { expectedVersion: ignored, ...changes } = body;
            void ignored;
            if (action === "patch")
            {
                if (!record.draft) throw new RequestError("CONFLICT");
                record.draft = validate(policyContentSchema, { ...record.draft, ...changes });
                await this.References(repository, record.draft.typeId, record.draft.departmentId);
            }
            else if (action === "branch")
            {
                if (record.draft || !record.published) throw new RequestError("CONFLICT");
                const { priority, typeId, departmentId, minAmount, maxAmount, stages } = record.published;
                record.draft = validate(policyContentSchema, { priority, typeId, departmentId, minAmount, maxAmount, stages });
            }
            else if (action === "disable") record.isEnabled = false;
            else
            {
                if (!record.draft) throw new RequestError("CONFLICT");
                await this.References(repository, record.draft.typeId, record.draft.departmentId);
                const content = validate(policyContentSchema, record.draft);
                record.published = { ...content, id, code: record.code, versionId: randomUUID(), versionNumber: (record.published?.versionNumber ?? 0) + 1, isPublished: true, isEnabled: true, version: record.version + 1 };
                record.draft = null;
                record.isEnabled = true;
            }
            record.version++;
            const result = policyDto(record);
            if (action === "publish") await repository.Publish(record, result);
            else await repository.SavePolicy(record);
            await repository.Audit(current.account.id, id, `POLICY_${action.toUpperCase()}`, before, result);
            if (action === "publish") await repository.Complete(current.account.id, scope, key!, hash, result);
            return result;
        });
    }

    public async Assignment(actor: IActor, id: string | null, input: CreateAssignmentRule | PatchAssignmentRule)
    {
        return this.unit.Run(async (repository) =>
        {
            await repository.Lock(true);
            const current = await repository.CurrentAdmin(actor);
            const before = id ? await repository.Assignment(id.toLowerCase()) : null;
            if (id && !before) throw new RequestError("NOT_FOUND");
            let body: CreateAssignmentRule;
            if (before)
            {
                const { expectedVersion, ...changes } = validate(patchAssignmentRuleSchema, input);
                assertConfigurationVersion(before.version, expectedVersion);
                const merged = { ...before, ...changes };
                body = validate(createAssignmentRuleSchema, { key: before.key, departmentId: merged.departmentId, reviewerUserIds: merged.reviewerUserIds, isActive: merged.isActive });
            }
            else body = validate(createAssignmentRuleSchema, input);
            await this.References(repository, null, body.departmentId, body.reviewerUserIds);
            const result = assignmentRuleSchema.parse({ ...body, id: before?.id ?? randomUUID(), version: before ? before.version + 1 : 0 });
            await repository.SaveAssignment(result);
            await repository.Audit(current.account.id, result.id, before ? "ASSIGNMENT_UPDATED" : "ASSIGNMENT_CREATED", before, result);
            return result;
        });
    }

    public async Budget(actor: IActor, id: string | null, input: CreateBudgetPolicy | PatchBudgetPolicy)
    {
        return this.unit.Run(async (repository) =>
        {
            await repository.Lock(true);
            const current = await repository.CurrentAdmin(actor);
            const before = id ? await repository.Budget(id.toLowerCase()) : null;
            if (id && !before) throw new RequestError("NOT_FOUND");
            if (before) assertConfigurationVersion(before.version, (input as PatchBudgetPolicy).expectedVersion);
            const { expectedVersion: ignored, ...changes } = input as PatchBudgetPolicy;
            void ignored;
            const merged = { ...before, ...changes };
            const body = validate(createBudgetPolicySchema, { typeId: merged.typeId, departmentId: merged.departmentId, maxAmount: merged.maxAmount, isActive: merged.isActive });
            await this.References(repository, body.typeId, body.departmentId);
            const result = budgetPolicySchema.parse({ ...body, id: before?.id ?? randomUUID(), version: before ? before.version + 1 : 0 });
            await repository.SaveBudget(result);
            await repository.Audit(current.account.id, result.id, before ? "BUDGET_UPDATED" : "BUDGET_CREATED", before, result);
            return result;
        });
    }
}
