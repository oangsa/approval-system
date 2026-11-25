import { z } from "zod";
import { compareDecimals } from "./requestTypes";
import { moneySchema } from "./requests";

const identity = z.uuid().transform((value) => value.toLowerCase());
const key = z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/);
const version = z.number().int().min(0).max(2147483647);
const uniqueKeys = z.array(key).min(1).max(50).refine((values) => new Set(values).size === values.length, "Duplicate assignment keys");
export const policyStageSchema = z.strictObject({
    stageNumber: z.union([z.literal(1), z.literal(2)]),
    reviewerAssignmentKeys: uniqueKeys,
    slaBusinessMinutes: z.number().int().positive().max(2147483647).default(480),
});
export const policyContentSchema = z.strictObject({
    priority: z.number().int().min(-2147483648).max(2147483647), typeId: identity,
    departmentId: identity.nullable().default(null), minAmount: moneySchema.nullable().default(null), maxAmount: moneySchema.nullable().default(null),
    stages: z.array(policyStageSchema).min(1).max(2),
}).superRefine((value, context) =>
{
    if (value.minAmount !== null && value.maxAmount !== null && compareDecimals(value.minAmount, value.maxAmount) > 0)
        context.addIssue({ code: "custom", path: ["maxAmount"], message: "Maximum amount must be at least minimum amount" });
    value.stages.forEach((stage, index) =>
    {
        if (stage.stageNumber !== index + 1) context.addIssue({ code: "custom", path: ["stages", index, "stageNumber"], message: "Stages must be ordered 1 then 2" });
    });
});
export const createApprovalPolicySchema = policyContentSchema.safeExtend({ code: key });
export const patchApprovalPolicySchema = z.strictObject(policyContentSchema.shape).partial().extend({ expectedVersion: version, departmentId: identity.nullable().optional(), minAmount: moneySchema.nullable().optional(), maxAmount: moneySchema.nullable().optional() });
export const policyActionSchema = z.strictObject({ expectedVersion: version });
export const approvalPolicySchema = policyContentSchema.safeExtend({
    id: identity, code: key, versionId: identity.nullable(), versionNumber: z.number().int().positive().nullable(),
    isPublished: z.boolean(), isEnabled: z.boolean(), version,
});
const reviewerIds = z.array(identity).min(1).max(50).refine((values) => new Set(values).size === values.length, "Duplicate reviewer IDs");
export const createAssignmentRuleSchema = z.strictObject({ key, departmentId: identity.nullable().default(null), reviewerUserIds: reviewerIds, isActive: z.boolean() });
export const patchAssignmentRuleSchema = createAssignmentRuleSchema.partial().extend({ expectedVersion: version, departmentId: identity.nullable().optional() });
export const assignmentRuleSchema = createAssignmentRuleSchema.extend({ id: identity, version });
const positiveMoney = moneySchema.refine((value) => compareDecimals(value, "0.00") > 0, "Ceiling must be positive");
export const createBudgetPolicySchema = z.strictObject({ typeId: identity, departmentId: identity.nullable().default(null), maxAmount: positiveMoney, isActive: z.boolean() });
export const patchBudgetPolicySchema = createBudgetPolicySchema.partial().extend({ expectedVersion: version, departmentId: identity.nullable().optional() });
export const budgetPolicySchema = createBudgetPolicySchema.extend({ id: identity, version });
export const eligibleReviewerSchema = z.strictObject({ id: identity, displayName: z.string().min(1), departmentId: identity.nullable() });

const equalityFilter = z.union([
    z.strictObject({ name: z.enum(["id", "typeId", "departmentId"]), condition: z.literal("EQUAL"), value: identity }),
    z.strictObject({ name: z.enum(["isActive", "isEnabled", "isPublished"]), condition: z.literal("EQUAL"), value: z.boolean() }),
    z.strictObject({ name: z.enum(["code", "key"]), condition: z.enum(["EQUAL", "CONTAINS", "STARTWITH"]), value: z.string().trim().min(1).max(100) }),
]);
const page = {
    pageNumber: z.number().int().min(1).max(10000).default(1), pageSize: z.number().int().min(1).max(100).default(20),
    search: z.array(equalityFilter).max(20).default([]),
    searchTerm: z.strictObject({ name: z.enum(["code", "key", "displayName", "name", "code,name"]), value: z.string().trim().min(1).max(100) }).optional(),
    orderBy: z.enum(["code asc", "code desc", "priority asc", "priority desc", "key asc", "key desc", "maxAmount asc", "maxAmount desc", "displayName asc", "displayName desc", "name asc", "name desc"]).default("code asc"),
};
export type ConfigurationKind = "approval-policies" | "reviewer-assignments" | "budget-policies" | "reviewers" | "departments";
const allowed = {
    "approval-policies": { filters: ["id", "typeId", "departmentId", "code", "isEnabled", "isPublished"], terms: ["code"], sort: ["code", "priority"] },
    "reviewer-assignments": { filters: ["id", "departmentId", "key", "isActive"], terms: ["key"], sort: ["key"] },
    "budget-policies": { filters: ["id", "typeId", "departmentId", "isActive"], terms: [], sort: ["maxAmount"] },
    reviewers: { filters: ["id", "departmentId"], terms: ["displayName"], sort: ["displayName"] },
    departments: { filters: ["id", "isActive", "code"], terms: ["code", "name", "code,name"], sort: ["code", "name"] },
};
export function configurationSearchSchema(kind: ConfigurationKind)
{
    const fields: { filters: string[]; terms: string[]; sort: string[] } = allowed[kind];
    return z.strictObject({ ...page, orderBy: page.orderBy.default(`${fields.sort[0]} asc` as z.infer<typeof page.orderBy>) }).superRefine((value, context) =>
    {
        for (const [index, filter] of value.search.entries())
            if (!fields.filters.includes(filter.name)) context.addIssue({ code: "custom", path: ["search", index], message: "Unsupported filter" });
        if (value.searchTerm && !fields.terms.includes(value.searchTerm.name)) context.addIssue({ code: "custom", path: ["searchTerm"], message: "Unsupported text field" });
        if (!fields.sort.includes(value.orderBy.split(" ")[0]!)) context.addIssue({ code: "custom", path: ["orderBy"], message: "Unsupported sort" });
    });
}
export type PolicyContent = z.infer<typeof policyContentSchema>;
export type CreateApprovalPolicy = z.infer<typeof createApprovalPolicySchema>;
export type PatchApprovalPolicy = z.infer<typeof patchApprovalPolicySchema>;
export type ApprovalPolicyDTO = z.infer<typeof approvalPolicySchema>;
export type CreateAssignmentRule = z.infer<typeof createAssignmentRuleSchema>;
export type PatchAssignmentRule = z.infer<typeof patchAssignmentRuleSchema>;
export type AssignmentRuleDTO = z.infer<typeof assignmentRuleSchema>;
export type CreateBudgetPolicy = z.infer<typeof createBudgetPolicySchema>;
export type PatchBudgetPolicy = z.infer<typeof patchBudgetPolicySchema>;
export type BudgetPolicyDTO = z.infer<typeof budgetPolicySchema>;
export type EligibleReviewer = z.infer<typeof eligibleReviewerSchema>;
export type ConfigurationSearch = z.infer<ReturnType<typeof configurationSearchSchema>>;
