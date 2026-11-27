import { z } from "zod";
import { approvalPolicySchema, assignmentRuleSchema, budgetPolicySchema, departmentSummarySchema, eligibleReviewerSchema, type ConfigurationKind, type ConfigurationSearch, type CreateApprovalPolicy, type PatchApprovalPolicy, type CreateAssignmentRule, type PatchAssignmentRule, type CreateBudgetPolicy, type PatchBudgetPolicy } from "@workflow/contracts";
import { httpFor, httpPageFor } from "./http";
const schemas = { "approval-policies": approvalPolicySchema, "reviewer-assignments": assignmentRuleSchema, "budget-policies": budgetPolicySchema, reviewers: eligibleReviewerSchema, departments: departmentSummarySchema };
const paths = { "approval-policies": "/v1/admin/approval-policies", "reviewer-assignments": "/v1/admin/reviewer-assignments", "budget-policies": "/v1/admin/budget-policies", reviewers: "/v1/reviewers/eligible", departments: "/v1/departments" };
export const configurationApi = {
    search: (kind: ConfigurationKind, query: ConfigurationSearch, signal?: AbortSignal, generation?: number) => httpPageFor(`${paths[kind]}/search`, z.array(schemas[kind]), { method: "POST", body: query, signal, generation }),
    createPolicy: (body: CreateApprovalPolicy, generation: number) => httpFor(paths["approval-policies"], approvalPolicySchema, { method: "POST", body, generation }),
    policyAction: (id: string, action: "patch" | "branch" | "publish" | "disable", body: PatchApprovalPolicy, key: string, generation: number) => httpFor(`${paths["approval-policies"]}/${id}/${action === "patch" || action === "branch" ? "draft" : action}`, approvalPolicySchema, { method: action === "patch" ? "PATCH" : "POST", body, headers: { "Idempotency-Key": key }, generation }),
    assignment: (id: string | null, body: CreateAssignmentRule | PatchAssignmentRule, generation: number) => httpFor(`${paths["reviewer-assignments"]}${id ? `/${id}` : ""}`, schemas["reviewer-assignments"], { method: id ? "PATCH" : "POST", body, generation }),
    budget: (id: string | null, body: CreateBudgetPolicy | PatchBudgetPolicy, generation: number) => httpFor(`${paths["budget-policies"]}${id ? `/${id}` : ""}`, schemas["budget-policies"], { method: id ? "PATCH" : "POST", body, generation }),
};
