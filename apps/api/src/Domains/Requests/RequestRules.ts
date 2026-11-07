import { compareDecimals, itemTotal, moneySchema, sumAmounts, validateFields, type CreateRequest, type DepartmentSummary, type IFieldIssue, type PublishedRequestType, type RequestDetail, type RequestRevision } from "@workflow/contracts";

export type RequestErrorCode = "VALIDATION_ERROR" | "FORM_FIELD_NOT_APPLICABLE" | "FORM_DEFINITION_CHANGED" | "CONFIGURATION_INCOMPLETE" | "AMBIGUOUS_APPROVAL_POLICY" | "BUDGET_LIMIT_EXCEEDED" | "INVALID_REQUEST_TRANSITION" | "REQUEST_STALE" | "IDEMPOTENCY_CONFLICT" | "NOT_FOUND" | "FORBIDDEN" | "UNAUTHENTICATED";
export class RequestError extends Error
{
    constructor(public readonly code: RequestErrorCode, public readonly details: IFieldIssue[] = [])
    {
        super(code);
    }
}
export interface IStageDefinition { stageNumber: 1 | 2; reviewerAssignmentKeys: string[]; slaBusinessMinutes: number; }
export interface IPolicy { id: string; priority: number; departmentId: string | null; minAmount: string | null; maxAmount: string | null; stages: IStageDefinition[]; }
export interface IAssignment { id: string; assignmentKey: string; reviewerId: string; displayName: string; isEligible: boolean; version: number; }
export interface IConfiguration
{
    definition: PublishedRequestType;
    activeVersionId: string | null;
    isEnabled: boolean;
    department: DepartmentSummary | null;
    policies: IPolicy[];
    assignments: IAssignment[];
    budgets: { departmentId: string | null; maxAmount: string }[];
}
export interface IPlan { policy: IPolicy; assignments: IAssignment[]; department: DepartmentSummary; }
export function validateContent(definition: PublishedRequestType, content: CreateRequest, complete: boolean): { amount: string | null; issues: IFieldIssue[] }
{
    const issues = validateFields(definition, content.fields ?? {}, complete);
    const add = (field: string, message: string) => issues.push({ field, code: "VALIDATION_ERROR", message });
    if (complete && !content.title?.trim()) add("title", "Title is required.");
    if (complete && !content.justification?.trim()) add("justification", "Justification is required.");
    if ((!definition.monetary || definition.supportsLineItems) && content.monetaryAmount != null) add("monetaryAmount", "This amount is not applicable to this type.");
    if (!definition.supportsLineItems && content.lineItems?.length) add("lineItems", "Line items are not applicable to this type.");
    if (complete && definition.supportsLineItems && !content.lineItems?.length) add("lineItems", "At least one item is required.");
    for (const [index, item] of (content.lineItems ?? []).entries())
    {
        if (complete && !item.description.trim()) add(`lineItems.${index}.description`, "Item description is required.");
    }
    if (complete && definition.monetary && !definition.supportsLineItems && content.monetaryAmount == null) add("monetaryAmount", "Amount is required.");
    const amount = !definition.monetary ? null : definition.supportsLineItems ? sumAmounts((content.lineItems ?? []).map((item) => itemTotal(item.quantity, item.unitAmount))) : content.monetaryAmount ?? null;
    if (amount !== null && !moneySchema.safeParse(amount).success) add(definition.supportsLineItems ? "lineItems" : "monetaryAmount", "The total exceeds the supported amount range.");
    for (const [index, item] of (content.lineItems ?? []).entries())
    {
        if (!moneySchema.safeParse(itemTotal(item.quantity, item.unitAmount)).success) add(`lineItems.${index}.quantity`, "The item total exceeds the supported amount range.");
    }
    return { amount, issues };
}
export function assertContent(definition: PublishedRequestType, content: CreateRequest, complete: boolean): string | null
{
    const { amount, issues } = validateContent(definition, content, complete);
    if (issues.length) throw new RequestError(issues.some((issue) => issue.code === "FORM_FIELD_NOT_APPLICABLE") ? "FORM_FIELD_NOT_APPLICABLE" : "VALIDATION_ERROR", issues);
    return amount;
}
export function resolvePlan(config: IConfiguration, ownerId: string, amount: string | null): IPlan
{
    if (!config.isEnabled || !config.department?.isActive) throw new RequestError("CONFIGURATION_INCOMPLETE");
    const department = config.department;
    const budgets = config.budgets.filter((budget) => budget.departmentId === null || budget.departmentId === department.id).sort((a, b) => Number(b.departmentId !== null) - Number(a.departmentId !== null));
    if (amount !== null && budgets[0] && compareDecimals(amount, budgets[0].maxAmount) > 0) throw new RequestError("BUDGET_LIMIT_EXCEEDED", [{ field: "monetaryAmount", code: "BUDGET_LIMIT_EXCEEDED", message: "Amount exceeds the configured limit." }]);
    const candidates = config.policies.filter((policy) => (policy.departmentId === null || policy.departmentId === department.id)
        && (policy.minAmount === null || amount !== null && compareDecimals(amount, policy.minAmount) >= 0)
        && (policy.maxAmount === null || amount !== null && compareDecimals(amount, policy.maxAmount) <= 0)).sort((a, b) => b.priority - a.priority);
    const policy = candidates[0];
    if (!policy) throw new RequestError("CONFIGURATION_INCOMPLETE");
    if (candidates[1]?.priority === policy.priority) throw new RequestError("AMBIGUOUS_APPROVAL_POLICY");
    if (policy.stages.length < 1 || policy.stages.length > 2) throw new RequestError("CONFIGURATION_INCOMPLETE");
    const assignments: IAssignment[] = [];
    for (const [index, stage] of policy.stages.entries())
    {
        if (stage.stageNumber !== index + 1 || !stage.reviewerAssignmentKeys.length || new Set(stage.reviewerAssignmentKeys).size !== stage.reviewerAssignmentKeys.length) throw new RequestError("CONFIGURATION_INCOMPLETE");
        for (const key of stage.reviewerAssignmentKeys)
        {
            const assignment = config.assignments.find((item) => item.assignmentKey === key);
            if (!assignment?.isEligible || assignment.reviewerId === ownerId) throw new RequestError("CONFIGURATION_INCOMPLETE");
            assignments.push(assignment);
        }
    }
    return { policy, assignments, department };
}
export function editableContent(detail: RequestDetail, definition: PublishedRequestType): CreateRequest
{
    const revision: RequestRevision | null = detail.workingRevision;
    if (!revision) throw new RequestError("INVALID_REQUEST_TRANSITION");
    return { typeId: detail.typeId, formDefinitionVersionId: revision.formDefinitionVersionId, title: detail.title, justification: detail.justification, priority: detail.priority, fields: revision.fields,
        lineItems: revision.lineItems.map(({ description, quantity, unitAmount }) => ({ description, quantity, unitAmount })), monetaryAmount: definition.supportsLineItems ? null : revision.amount };
}
// Pure calendar seam shared by later activation/SLA features; Bangkok has no DST.
export function businessDueAt(start: Date, minutes: number): Date
{
    const date = new Date(start.getTime() + 7 * 3600000);
    let remaining = minutes;
    while (remaining > 0)
    {
        const day = date.getUTCDay();
        if (day === 0 || day === 6 || date.getUTCHours() >= 17)
        {
            date.setUTCDate(date.getUTCDate() + 1);
            date.setUTCHours(9, 0, 0, 0);
            continue;
        }
        if (date.getUTCHours() < 9) date.setUTCHours(9, 0, 0, 0);
        const end = new Date(date);
        end.setUTCHours(17, 0, 0, 0);
        const available = (end.getTime() - date.getTime()) / 60000;
        const consumed = Math.min(remaining, available);
        date.setTime(date.getTime() + consumed * 60000);
        remaining -= consumed;
    }
    return new Date(date.getTime() - 7 * 3600000);
}
