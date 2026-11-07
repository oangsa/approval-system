import { expect, test } from "vitest";
import { assertContent, businessDueAt, resolvePlan, type IConfiguration } from "../../src/Domains/Requests/RequestRules";
import { seededDefinition } from "../../src/Infrastructures/Database/seedRequests";
const department = { id: "department", code: "OPS", name: "Operations", isActive: true };
function config(): IConfiguration
{
    return { definition: seededDefinition, activeVersionId: seededDefinition.versionId, isEnabled: true, department,
        policies: [{ id: "policy", priority: 1, departmentId: null, minAmount: null, maxAmount: null, stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 480 }] }],
        assignments: [{ id: "mapping", assignmentKey: "review", reviewerId: "reviewer", displayName: "Reviewer", isEligible: true, version: 0 }], budgets: [] };
}
test("AC-004/015 incomplete drafts are allowed but complete submission validates all content", () =>
{
    const content = { typeId: seededDefinition.id, formDefinitionVersionId: seededDefinition.versionId };
    expect(assertContent(seededDefinition, content, false)).toBeNull();
    expect(() => assertContent(seededDefinition, content, true)).toThrowError("VALIDATION_ERROR");
    expect(() => assertContent(seededDefinition, { ...content, fields: { category: "OPERATIONS", reason: "injected" } }, false)).toThrowError("FORM_FIELD_NOT_APPLICABLE");
});
test("API-09 policy priority, ties, eligibility, self-approval and department are authoritative", () =>
{
    expect(resolvePlan(config(), "owner", null).policy.id).toBe("policy");
    const tied = config();
    tied.policies.push({ ...tied.policies[0]!, id: "tied" });
    expect(() => resolvePlan(tied, "owner", null)).toThrowError("AMBIGUOUS_APPROVAL_POLICY");
    for (const mutate of [(c: IConfiguration) => c.department = null, (c: IConfiguration) => c.assignments = [], (c: IConfiguration) => c.assignments[0]!.isEligible = false, (c: IConfiguration) => c.assignments[0]!.reviewerId = "owner"])
    {
        const value = config(); mutate(value);
        expect(() => resolvePlan(value, "owner", null)).toThrowError("CONFIGURATION_INCOMPLETE");
    }
    const budget = config();
    budget.budgets = [{ departmentId: null, maxAmount: "10" }, { departmentId: department.id, maxAmount: "20" }];
    expect(resolvePlan(budget, "owner", "15").policy.id).toBe("policy");
    expect(() => resolvePlan(budget, "owner", "20.01")).toThrowError("BUDGET_LIMIT_EXCEEDED");
});
test("business deadline skips Bangkok weekend and starts in working hours", () =>
{
    expect(businessDueAt(new Date("2026-11-06T09:00:00Z"), 480).toISOString()).toBe("2026-11-09T09:00:00.000Z");
});
