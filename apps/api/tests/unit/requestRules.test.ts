import { expect, test } from "vitest";
import { assertContent, assertPublishedDefinition, businessDueAt, editableContent, resolvePlan, validateContent, type IConfiguration } from "../../src/Domains/Requests/RequestRules";
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

test("B06 validateContent emits canonical bracket-form line-item error paths", () =>
{
    const itemDefinition = { ...seededDefinition, monetary: true, supportsLineItems: true, fields: [] };
    const missingDescription = validateContent(itemDefinition, {
        typeId: itemDefinition.id,
        formDefinitionVersionId: itemDefinition.versionId,
        title: "Items",
        justification: "Needed",
        lineItems: [{ description: " ", quantity: "1", unitAmount: "10.00" }],
    }, true);
    expect(missingDescription.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "lineItems[0].description", code: "VALIDATION_ERROR" }),
    ]));
    const overflow = validateContent(itemDefinition, {
        typeId: itemDefinition.id,
        formDefinitionVersionId: itemDefinition.versionId,
        lineItems: [{ description: "Item", quantity: "9999999999999999", unitAmount: "100.00" }],
    }, false);
    expect(overflow.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "lineItems[0].quantity", code: "VALIDATION_ERROR" }),
    ]));
});

test("B01 assertPublishedDefinition rejects Zod-invalid and cyclic stored definitions with CONFIGURATION_INCOMPLETE", () =>
{
    const malformed = { ...seededDefinition, fields: [{ key: "123_invalid", kind: "TEXT", label: { en: "Bad" }, required: false }] };
    const cyclic = {
        ...seededDefinition,
        fields: [
            { key: "alpha", kind: "TEXT" as const, label: { en: "Alpha" }, required: false, visibleWhen: { all: [{ fieldKey: "beta", operator: "PRESENT" as const }] } },
            { key: "beta", kind: "TEXT" as const, label: { en: "Beta" }, required: false, requiredWhen: { all: [{ fieldKey: "alpha", operator: "PRESENT" as const }] } },
        ],
    };
    const conflictingMonetary = { ...seededDefinition, monetary: false, supportsLineItems: true };

    for (const invalid of [malformed, cyclic, conflictingMonetary])
    {
        expect(() => assertPublishedDefinition(invalid)).toThrowError("CONFIGURATION_INCOMPLETE");
        expect(() => assertContent(invalid as typeof seededDefinition, { typeId: seededDefinition.id, formDefinitionVersionId: seededDefinition.versionId }, false)).toThrowError("CONFIGURATION_INCOMPLETE");
        const cfg = config();
        cfg.definition = invalid as typeof seededDefinition;
        expect(() => resolvePlan(cfg, "owner", null)).toThrowError("CONFIGURATION_INCOMPLETE");
    }

    const detail = {
        id: seededDefinition.id,
        requestNumber: null,
        typeId: seededDefinition.id,
        typeCode: seededDefinition.code,
        title: "Draft",
        justification: "",
        priority: "MEDIUM" as const,
        status: "DRAFT" as const,
        requester: { id: "owner", displayName: "Owner", email: "owner@example.test", roles: ["REQUESTER" as const], isActive: true, department: null },
        department: null,
        revisionNumber: null,
        currentCycleId: null,
        createdAt: "2026-11-06T00:00:00.000Z",
        updatedAt: "2026-11-06T00:00:00.000Z",
        submittedAt: null,
        version: 0,
        workingRevision: { id: seededDefinition.id, revisionNumber: 1, formDefinitionVersionId: seededDefinition.versionId, fields: {}, lineItems: [], amount: null, currency: null, submittedAt: null, submittedBy: null },
        submittedRevision: null,
        currentStageNumber: null,
        currentApprovers: [],
        availableActions: ["EDIT_DRAFT", "SUBMIT"],
    };
    expect(() => editableContent(detail, cyclic as typeof seededDefinition)).toThrowError("CONFIGURATION_INCOMPLETE");
    expect(Object.getPrototypeOf(editableContent(detail, seededDefinition).fields)).toBeNull();
});

test("PRB-AC-03/06 amount boundaries, department override, highest priority and nonmonetary predicates", () =>
{
    const value = config();
    value.policies.push({ ...value.policies[0]!, id: "higher", priority: 20, minAmount: "10.10", maxAmount: "20.20" });
    for (const amount of ["10.10", "20.20"]) expect(resolvePlan(value, "owner", amount).policy.id).toBe("higher");
    for (const amount of ["10.09", "20.21", null]) expect(resolvePlan(value, "owner", amount).policy.id).toBe("policy");
    value.budgets = [{ departmentId: null, maxAmount: "5" }, { departmentId: department.id, maxAmount: "20.20" }];
    expect(resolvePlan(value, "owner", "20.20").policy.id).toBe("higher");
    expect(() => resolvePlan(value, "owner", "20.21")).toThrow("BUDGET_LIMIT_EXCEEDED");
    value.policies = [{ ...value.policies[1]!, departmentId: "other" }];
    expect(() => resolvePlan(value, "owner", "10.10")).toThrow("CONFIGURATION_INCOMPLETE");
});
test("PRB-AC-04/07 all reviewers and later stages validated; department mapping overrides global", () =>
{
    const value = config();
    const original = value.assignments[0]!;
    value.assignments.push({ ...original, reviewerId: "peer", id: "peer" });
    expect(resolvePlan(value, "owner", null).assignments).toHaveLength(2);
    value.policies[0]!.stages.push({ stageNumber: 2, reviewerAssignmentKeys: ["later"], slaBusinessMinutes: 480 });
    expect(() => resolvePlan(value, "owner", null)).toThrow("CONFIGURATION_INCOMPLETE");
    value.assignments.push({ ...original, assignmentKey: "later", reviewerId: "owner" });
    expect(() => resolvePlan(value, "owner", null)).toThrow("CONFIGURATION_INCOMPLETE");
    value.assignments.at(-1)!.reviewerId = "later-reviewer";
    value.assignments.at(-1)!.isEligible = false;
    expect(() => resolvePlan(value, "owner", null)).toThrow("CONFIGURATION_INCOMPLETE");
    value.assignments.at(-1)!.isEligible = true;
    value.assignments.push({ ...original, id: "scoped", departmentId: department.id, reviewerId: "scoped-reviewer" });
    expect(resolvePlan(value, "owner", null).assignments.map((item) => item.reviewerId)).toEqual(["scoped-reviewer", "later-reviewer"]);
});
