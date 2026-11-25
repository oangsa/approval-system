import { expect, test } from "vitest";
import {
    adminRequestTypeSearchSchema,
    applicableFields,
    compareDecimals,
    conditionSchema,
    createRequestSchema,
    createRequestTypeSchema,
    itemTotal,
    matchesCondition,
    normalizeMoney,
    patchRequestTypeDraftSchema,
    prioritySchema,
    requestRevisionSchema,
    resolveLocalizedText,
    safeItemTotal,
    sumAmounts,
    validateFields,
    validateRequestTypeDefinition,
    type PublishedRequestType,
    type RequestTypeDraftContent,
} from "../src/index";

function validDraft(overrides: Partial<RequestTypeDraftContent> = {}): RequestTypeDraftContent
{
    return {
        name: { en: "Procurement", th: "จัดซื้อจัดจ้าง" },
        description: { en: "Equipment procurement" },
        monetary: true,
        supportsLineItems: true,
        fields: [
            {
                key: "category",
                kind: "SELECT",
                label: { en: "Category", th: "หมวดหมู่" },
                required: true,
                constraints: {
                    options: [
                        { value: "IT", label: { en: "IT Hardware" } },
                        { value: "OTHER", label: { en: "Other", th: "อื่น ๆ" } },
                    ],
                },
            },
            {
                key: "urgentFlag",
                kind: "BOOLEAN",
                label: { en: "Urgent Flag" },
                required: false,
            },
            {
                key: "neededBy",
                kind: "DATE",
                label: { en: "Needed by" },
                required: false,
                constraints: { min: "2026-01-01", max: "2027-12-31" },
                visibleWhen: { all: [{ fieldKey: "urgentFlag", operator: "PRESENT" }] },
                requiredWhen: { all: [{ fieldKey: "urgentFlag", operator: "EQ", value: true }] },
            },
            {
                key: "budgetEstimate",
                kind: "DECIMAL",
                label: { en: "Budget estimate" },
                required: false,
                constraints: { min: "0.01", max: "500000.00" },
            },
            {
                key: "justificationNote",
                kind: "TEXTAREA",
                label: { en: "Extra note" },
                required: false,
                constraints: { minLength: 5, maxLength: 500 },
                visibleWhen: {
                    all: [{ fieldKey: "category", operator: "IN", value: ["IT", "OTHER"] }],
                    any: [
                        { fieldKey: "budgetEstimate", operator: "GTE", value: "1000.00" },
                        { fieldKey: "neededBy", operator: "LT", value: "2026-06-01" },
                    ],
                },
                requiredWhen: { all: [{ fieldKey: "budgetEstimate", operator: "GT", value: "10000.00" }] },
            },
        ],
        ...overrides,
    };
}

test("UT-03/04 bounded condition groups, operators, boolean false PRESENT, and diamond DAG preserve display order", () =>
{
    const draft = validDraft();
    expect(validateRequestTypeDefinition(draft)).toEqual([]);

    expect(conditionSchema.safeParse({}).success).toBe(false);
    expect(conditionSchema.safeParse({ all: [] }).success).toBe(false);
    expect(conditionSchema.safeParse({ any: [] }).success).toBe(false);

    // Boolean false is PRESENT and satisfies EQ false / NE true.
    expect(matchesCondition({ all: [{ fieldKey: "urgentFlag", operator: "PRESENT" }] }, { urgentFlag: false }, draft.fields)).toBe(true);
    expect(matchesCondition({ all: [{ fieldKey: "urgentFlag", operator: "EQ", value: false }] }, { urgentFlag: false }, draft.fields)).toBe(true);
    expect(matchesCondition({ all: [{ fieldKey: "urgentFlag", operator: "NE", value: true }] }, { urgentFlag: false }, draft.fields)).toBe(true);
    expect(matchesCondition({ all: [{ fieldKey: "urgentFlag", operator: "PRESENT" }] }, {}, draft.fields)).toBe(false);

    // Malformed DECIMAL or DATE values must not satisfy range or NE comparisons.
    expect(matchesCondition({ all: [{ fieldKey: "budgetEstimate", operator: "NE", value: "100.00" }] }, { budgetEstimate: "not-a-number" }, draft.fields)).toBe(false);
    expect(matchesCondition({ all: [{ fieldKey: "neededBy", operator: "LT", value: "2026-06-01" }] }, { neededBy: "invalid-date" }, draft.fields)).toBe(false);

    // Diamond DAG declared in reverse order evaluates in topological order while keeping declared display order.
    const diamond: RequestTypeDraftContent = {
        name: { en: "Diamond" },
        monetary: false,
        supportsLineItems: false,
        fields: [
            {
                key: "summary",
                kind: "TEXT",
                label: { en: "Summary" },
                required: false,
                visibleWhen: { all: [{ fieldKey: "left", operator: "PRESENT" }, { fieldKey: "right", operator: "PRESENT" }] },
            },
            {
                key: "left",
                kind: "TEXT",
                label: { en: "Left" },
                required: false,
                visibleWhen: { all: [{ fieldKey: "root", operator: "EQ", value: "OPEN" }] },
            },
            {
                key: "right",
                kind: "TEXT",
                label: { en: "Right" },
                required: false,
                visibleWhen: { all: [{ fieldKey: "root", operator: "NE", value: "CLOSED" }] },
            },
            {
                key: "root",
                kind: "SELECT",
                label: { en: "Root" },
                required: true,
                constraints: { options: [{ value: "OPEN", label: { en: "Open" } }, { value: "CLOSED", label: { en: "Closed" } }] },
            },
        ],
    };
    expect(validateRequestTypeDefinition(diamond)).toEqual([]);
    const visibleOpen = applicableFields(diamond.fields, { root: "OPEN", left: "L", right: "R" });
    expect(visibleOpen.map((field) => field.key)).toEqual(["summary", "left", "right", "root"]);

    // Hidden parent ("left" hidden when root is CLOSED) becomes unset for "summary" even if caller passes left.
    const visibleClosed = applicableFields(diamond.fields, { root: "CLOSED", left: "stale", right: "R" });
    expect(visibleClosed.map((field) => field.key)).toEqual(["root"]);
});

test("UT-04/CT-03 graph validator rejects cycles, self-references, unknown keys, duplicate keys/options, and bad operator/value pairs", () =>
{
    expect(validateRequestTypeDefinition(validDraft({ monetary: false, supportsLineItems: true }))).toEqual([
        expect.objectContaining({ field: "supportsLineItems" }),
    ]);

    const duplicateKey = validDraft({
        fields: [
            { key: "dup", kind: "TEXT", label: { en: "First" }, required: false },
            { key: "dup", kind: "TEXT", label: { en: "Second" }, required: false },
        ],
    });
    expect(validateRequestTypeDefinition(duplicateKey)).toEqual([expect.objectContaining({ field: "fields[1].key" })]);

    const selfRef = validDraft({
        fields: [{ key: "self", kind: "TEXT", label: { en: "Self" }, required: false, visibleWhen: { all: [{ fieldKey: "self", operator: "PRESENT" }] } }],
    });
    expect(validateRequestTypeDefinition(selfRef)).toEqual([expect.objectContaining({ field: "fields[0].visibleWhen.all[0].fieldKey" })]);

    const mixedCycle = validDraft({
        fields: [
            { key: "alpha", kind: "TEXT", label: { en: "Alpha" }, required: false, visibleWhen: { all: [{ fieldKey: "beta", operator: "PRESENT" }] } },
            { key: "beta", kind: "TEXT", label: { en: "Beta" }, required: false, requiredWhen: { all: [{ fieldKey: "alpha", operator: "PRESENT" }] } },
        ],
    });
    expect(validateRequestTypeDefinition(mixedCycle).map((issue) => issue.field)).toEqual(["fields[0].key", "fields[1].key"]);

    const threeNodeCycle = validDraft({
        fields: [
            { key: "alpha", kind: "TEXT", label: { en: "Alpha" }, required: false, visibleWhen: { all: [{ fieldKey: "beta", operator: "PRESENT" }] } },
            { key: "beta", kind: "TEXT", label: { en: "Beta" }, required: false, visibleWhen: { all: [{ fieldKey: "gamma", operator: "PRESENT" }] } },
            { key: "gamma", kind: "TEXT", label: { en: "Gamma" }, required: false, requiredWhen: { all: [{ fieldKey: "alpha", operator: "PRESENT" }] } },
        ],
    });
    expect(validateRequestTypeDefinition(threeNodeCycle).map((issue) => issue.field)).toEqual(["fields[0].key", "fields[1].key", "fields[2].key"]);

    const badOperatorAndOption = validDraft({
        fields: [
            { key: "choice", kind: "SELECT", label: { en: "Choice" }, required: false, constraints: { options: [{ value: "A", label: { en: "A" } }, { value: "A", label: { en: "Dup" } }] } },
            { key: "note", kind: "TEXT", label: { en: "Note" }, required: false, visibleWhen: { any: [{ fieldKey: "choice", operator: "GT", value: "A" }] } },
            { key: "unknownRef", kind: "TEXT", label: { en: "Unknown" }, required: false, visibleWhen: { all: [{ fieldKey: "missing", operator: "PRESENT" }] } },
            { key: "badIn", kind: "DECIMAL", label: { en: "Bad IN" }, required: false, visibleWhen: { all: [{ fieldKey: "choice", operator: "IN", value: ["UNKNOWN"] }] } },
            { key: "badBounds", kind: "DECIMAL", label: { en: "Bad bounds" }, required: false, constraints: { min: "10", max: "5" }, defaultValue: "abc" },
        ],
    });
    const issues = validateRequestTypeDefinition(badOperatorAndOption);
    expect(issues).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "fields[0].constraints.options[1].value" }),
        expect.objectContaining({ field: "fields[1].visibleWhen.any[0].operator" }),
        expect.objectContaining({ field: "fields[2].visibleWhen.all[0].fieldKey" }),
        expect.objectContaining({ field: "fields[3].visibleWhen.all[0].value[0]" }),
        expect.objectContaining({ field: "fields[4].constraints.min" }),
        expect.objectContaining({ field: "fields[4].defaultValue" }),
    ]));
});

test("UT-05/06/CT-02 decimal precision, priority bounds, localized fallback, and admin write contracts", () =>
{
    expect(sumAmounts(["0.10", "0.20"])).toBe("0.30");
    expect(itemTotal("3", "0.10")).toBe("0.30");
    expect(safeItemTotal("0", "10.00")).toBeNull();
    expect(safeItemTotal("2", "bad")).toBeNull();
    expect(safeItemTotal("2", "10.50")).toBe("21.00");
    expect(normalizeMoney("12")).toBe("12.00");
    expect(compareDecimals("10.5", "10.500000")).toBe(0);

    expect(resolveLocalizedText({ en: "Category", th: "ประเภท" }, "th")).toBe("ประเภท");
    expect(resolveLocalizedText({ en: "Category" }, "th")).toBe("Category");
    expect(resolveLocalizedText({ en: "Category", th: "ประเภท" }, "en")).toBe("Category");

    for (const p of ["LOW", "MEDIUM", "HIGH", "URGENT"] as const) expect(prioritySchema.safeParse(p).success).toBe(true);
    for (const bad of ["NORMAL", "CRITICAL", "", 1]) expect(prioritySchema.safeParse(bad).success).toBe(false);

    expect(createRequestTypeSchema.safeParse({ code: "PROCURE_1", ...validDraft() }).success).toBe(true);
    expect(createRequestTypeSchema.safeParse({ code: "1BAD", ...validDraft() }).success).toBe(false);
    expect(patchRequestTypeDraftSchema.safeParse({ expectedVersion: 0, unknownKey: true }).success).toBe(false);
    expect(adminRequestTypeSearchSchema.safeParse({ orderBy: "updatedAt desc", search: [{ name: "hasDraft", condition: "EQUAL", value: true }] }).success).toBe(true);
    expect(adminRequestTypeSearchSchema.safeParse({ orderBy: "password_hash asc" }).success).toBe(false);

    const published: PublishedRequestType = {
        id: "30000000-0000-4000-8000-000000000001",
        versionId: "30000000-0000-4000-8000-000000000002",
        code: "PROC",
        versionNumber: 1,
        isEnabled: true,
        publishedAt: "2026-11-25T00:00:00.000Z",
        ...validDraft(),
    };
    expect(validateFields(published, { category: "IT", urgentFlag: false, neededBy: "2026-05-01" }, true)).toEqual([]);
    expect(validateFields(published, { category: "IT", neededBy: "2026-05-01" }, false)).toEqual([
        expect.objectContaining({ field: "fields.neededBy", code: "FORM_FIELD_NOT_APPLICABLE" }),
    ]);

    expect(createRequestSchema.safeParse({
        typeId: published.id,
        formDefinitionVersionId: published.versionId,
        lineItems: [{ id: published.id, description: "Laptop", quantity: "1", unitAmount: "100.00", totalAmount: "100.00" }],
    }).success).toBe(false);

    expect(createRequestSchema.safeParse({
        typeId: published.id,
        formDefinitionVersionId: published.versionId,
        lineItems: [{ description: "Too large qty", quantity: "100000000000000000", unitAmount: "0.00" }],
    }).success).toBe(false);
    expect(createRequestSchema.safeParse({
        typeId: published.id,
        formDefinitionVersionId: published.versionId,
        lineItems: [{ description: "Max 17-digit qty", quantity: "10000000000000000", unitAmount: "0.00" }],
    }).success).toBe(true);
    expect(requestRevisionSchema.safeParse({
        id: published.id,
        revisionNumber: 1,
        formDefinitionVersionId: published.versionId,
        fields: {},
        lineItems: [{ id: published.id, description: "Max 17-digit qty", quantity: "10000000000000000.000000", unitAmount: "0.00", totalAmount: "0.00" }],
        amount: "0.00",
        currency: "THB",
        submittedAt: null,
        submittedBy: null,
    }).success).toBe(true);
});
