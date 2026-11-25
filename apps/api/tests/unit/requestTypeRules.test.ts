import { expect, test } from "vitest";
import { resolvePlan, type IConfiguration } from "../../src/Domains/Requests/RequestRules";
import {
    assertExpectedVersion,
    assertValidDefinition,
    buildDraftFromPublished,
    mergeDraftPatch,
} from "../../src/Domains/RequestTypes/RequestTypeRules";
import { seededDefinition } from "../../src/Infrastructures/Database/seedRequests";

const department = { id: "dept-1", code: "OPS", name: "Operations", isActive: true };

function config(isEnabled: boolean): IConfiguration
{
    return {
        definition: seededDefinition,
        activeVersionId: seededDefinition.versionId,
        isEnabled,
        department,
        policies: [{ id: "pol-1", priority: 10, departmentId: null, minAmount: null, maxAmount: null, stages: [{ stageNumber: 1, reviewerAssignmentKeys: ["review"], slaBusinessMinutes: 480 }] }],
        assignments: [{ id: "assign-1", assignmentKey: "review", reviewerId: "reviewer-1", displayName: "Reviewer", isEligible: true, version: 0 }],
        budgets: [],
    };
}

test("request type domain rules merge patches, branch published versions, and enforce expectedVersion", () =>
{
    const base = {
        name: { en: "Travel", th: "เดินทาง" },
        description: { en: "Business travel" },
        monetary: true,
        supportsLineItems: true,
        fields: [{ key: "destination", kind: "TEXT" as const, label: { en: "Destination" }, required: true }],
    };
    assertValidDefinition(base);

    const patched = mergeDraftPatch(base, { expectedVersion: 0, description: null, name: { en: "Travel v2" } });
    expect(patched).toEqual({
        name: { en: "Travel v2" },
        monetary: true,
        supportsLineItems: true,
        fields: base.fields,
    });

    const branched = buildDraftFromPublished(seededDefinition);
    expect(branched.name).toEqual(seededDefinition.name);
    expect(branched.fields).toEqual(seededDefinition.fields);

    expect(() => assertExpectedVersion(2, 1)).toThrowError("CONFLICT");
    expect(() => assertValidDefinition({ ...base, monetary: false, supportsLineItems: true })).toThrowError("VALIDATION_ERROR");
});

test("resolvePlan blocks disabled types for new submissions while allowing pinned returned resubmission", () =>
{
    expect(() => resolvePlan(config(false), "owner-1", null)).toThrowError("CONFIGURATION_INCOMPLETE");
    expect(resolvePlan(config(false), "owner-1", null, { allowDisabledType: true }).policy.id).toBe("pol-1");
});
