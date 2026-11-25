import { expect, test } from "vitest";
import { createApprovalPolicySchema, createBudgetPolicySchema, patchApprovalPolicySchema, patchAssignmentRuleSchema, patchBudgetPolicySchema, configurationSearchSchema } from "../src/policies";
const typeId = "30000000-0000-4000-8000-000000000001";
const policy = { code: "TEST", priority: 10, typeId, stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["DEPT_REVIEW"] }] };
test("PRB-AC-02 strict bounded ALL policy, default SLA, exact inclusive bounds", () =>
{
    expect(createApprovalPolicySchema.parse(policy).stages[0]!.slaBusinessMinutes).toBe(480);
    expect(createApprovalPolicySchema.safeParse({ ...policy, stages: [{ ...policy.stages[0], slaBusinessMinutes: 600000 }] }).success).toBe(true);
    expect(createApprovalPolicySchema.safeParse({ ...policy, minAmount: "10.10", maxAmount: "10.10" }).success).toBe(true);
    for (const changes of [
        { minAmount: "10.11", maxAmount: "10.10" }, { minAmount: 1 }, { maxAmount: "1e3" },
        { stages: [...policy.stages, { stageNumber: 3, reviewerAssignmentKeys: ["review"] }] },
        { stages: [{ stageNumber: 2, reviewerAssignmentKeys: ["review"] }] },
        { stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review", "review"] }] },
        { stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review"], policy: "ANY" }] },
        { stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review"], quorum: 1 }] },
        { stages: [] }, { priority: 1.5 },
    ]) expect(createApprovalPolicySchema.safeParse({ ...policy, ...changes }).success).toBe(false);
});
test("PRB-AC-01/04/06 partial patches preserve omitted optional scopes and bounds", () =>
{
    expect(patchApprovalPolicySchema.parse({ expectedVersion: 0, priority: 20 })).toEqual({ expectedVersion: 0, priority: 20 });
    expect(patchAssignmentRuleSchema.parse({ expectedVersion: 0, isActive: false })).toEqual({ expectedVersion: 0, isActive: false });
    expect(patchBudgetPolicySchema.parse({ expectedVersion: 0, maxAmount: "10.10" })).toEqual({ expectedVersion: 0, maxAmount: "10.10" });
    expect(patchApprovalPolicySchema.parse({ expectedVersion: 0, departmentId: null })).toHaveProperty("departmentId", null);
});
test("PRB-AC-05 search bounds and endpoint field allowlists reject SQL-like fields and unsupported sort", () =>
{
    for (const query of [{ pageSize: 101 }, { pageNumber: 0 }, { orderBy: "priority desc" }, { search: [{ name: "isEnabled", condition: "EQUAL", value: true }] }, { searchTerm: { name: "code", value: "x" } }])
        expect(configurationSearchSchema("reviewers").safeParse(query).success).toBe(false);
    expect(configurationSearchSchema("reviewers").parse({}).orderBy).toBe("displayName asc");
    expect(createBudgetPolicySchema.safeParse({ typeId, maxAmount: "0", isActive: true }).success).toBe(false);
    expect(createBudgetPolicySchema.safeParse({ typeId, maxAmount: "0.01", isActive: true }).success).toBe(true);
});
