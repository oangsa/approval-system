import { z } from "zod";
import { configurationSearchSchema, createApprovalPolicySchema, createAssignmentRuleSchema, createBudgetPolicySchema, patchApprovalPolicySchema, patchAssignmentRuleSchema, patchBudgetPolicySchema, policyActionSchema, type ConfigurationKind, type ApprovalPolicyDTO, type AssignmentRuleDTO, type BudgetPolicyDTO, type DepartmentSummary, type EligibleReviewer, type CreateApprovalPolicy, type PatchApprovalPolicy, type CreateAssignmentRule, type PatchAssignmentRule, type CreateBudgetPolicy, type PatchBudgetPolicy } from "@workflow/contracts";
import { isApiFailure } from "~/api/errors";
import { configurationApi } from "~/api/configuration";
import { readAdminRequestType, searchAdminRequestTypes, type RequestTypeActionAttempt } from "./requestTypeService";
export type ConfigurationRow = ApprovalPolicyDTO | AssignmentRuleDTO | BudgetPolicyDTO | DepartmentSummary | EligibleReviewer;
export type LookupKind = "types" | "departments" | "reviewers" | "assignments";
export interface ISelection { id: string; label: string; }
export function searchConfiguration(kind: ConfigurationKind, query: unknown, signal?: AbortSignal, generation?: number)
{
    return configurationApi.search(kind, configurationSearchSchema(kind).parse(query), signal, generation);
}
export function createPolicy(body: CreateApprovalPolicy, generation: number)
{
    return configurationApi.createPolicy(createApprovalPolicySchema.parse(body), generation);
}
export function policyAction(id: string, action: "patch" | "branch" | "publish" | "disable", body: PatchApprovalPolicy, attempts: RequestTypeActionAttempt, generation: number)
{
    const parsed = action === "patch" ? patchApprovalPolicySchema.parse(body) : policyActionSchema.parse(body);
    return configurationApi.policyAction(id, action, parsed, attempts.Key(`${action}:${id}`, parsed), generation);
}
export function saveAssignment(id: null, body: CreateAssignmentRule, generation: number): Promise<AssignmentRuleDTO>;
export function saveAssignment(id: string, body: PatchAssignmentRule, generation: number): Promise<AssignmentRuleDTO>;
export function saveAssignment(id: string | null, body: CreateAssignmentRule | PatchAssignmentRule, generation: number)
{
    return configurationApi.assignment(id, id ? patchAssignmentRuleSchema.parse(body) : createAssignmentRuleSchema.parse(body), generation);
}
export function saveBudget(id: string | null, body: CreateBudgetPolicy | PatchBudgetPolicy, generation: number)
{
    return configurationApi.budget(id, id ? patchBudgetPolicySchema.parse(body) : createBudgetPolicySchema.parse(body), generation);
}
export async function lookupConfiguration(kind: LookupKind, term: string, pageNumber: number, signal?: AbortSignal, generation?: number)
{
    if (kind === "types")
    {
        const result = await searchAdminRequestTypes({ pageNumber, pageSize: 10, search: [], orderBy: "code asc", ...(term ? { searchTerm: { name: "code,name", value: term } } : {}) }, signal, generation);
        return { ...result, items: result.items.map((item) => ({ id: item.id, label: `${item.code} — ${item.name.en}` })) };
    }
    const collection = kind === "assignments" ? "reviewer-assignments" : kind;
    const field = kind === "assignments" ? "key" : kind === "reviewers" ? "displayName" : "code,name";
    const result = await searchConfiguration(collection, { pageNumber, pageSize: 10, search: kind === "assignments" || kind === "departments" ? [{ name: "isActive", condition: "EQUAL", value: true }] : [], ...(term ? { searchTerm: { name: field, value: term } } : {}) }, signal, generation);
    const items = result.items.map((item) => ({ id: "key" in item ? item.key : item.id, label: "key" in item ? item.key : "displayName" in item ? item.displayName : "name" in item ? `${item.code} — ${item.name}` : item.id }));
    return { ...result, items: [...new Map(items.map((item) => [item.id, item])).values()] };
}
export async function lookupSelection(kind: LookupKind, id: string, signal?: AbortSignal, generation?: number): Promise<ISelection>
{
    if (kind === "types")
    {
        const item = await readAdminRequestType(id, signal, generation);
        return { id, label: `${item.code} — ${item.draft?.name.en ?? item.publishedVersion?.name.en ?? item.code}` };
    }
    const result = await searchConfiguration(kind === "assignments" ? "reviewer-assignments" : kind, { search: [{ name: kind === "assignments" ? "key" : "id", condition: "EQUAL", value: id }], pageSize: 1 }, signal, generation);
    const item = result.items[0];
    return { id, label: item ? "key" in item ? item.key : "displayName" in item ? item.displayName : "name" in item ? `${item.code} — ${item.name}` : "Unavailable selection" : "Unavailable selection — choose again" };
}
export function configurationFailure(error: unknown): string
{
    if (error instanceof z.ZodError) return error.issues.map((issue) => `${issue.path.join(".") || "Form"}: ${issue.message}`).join(". ");
    if (isApiFailure(error) && error.status === 422) return error.details?.length ? error.details.map((issue) => `${issue.field}: ${issue.message}`).join(". ") : error.message;
    if (isApiFailure(error) && error.status === 409) return "Configuration changed or conflicts with an existing scope. Reload before editing; check duplicate codes, keys or active ceilings.";
    if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
    return "Unable to save configuration. Try again.";
}
