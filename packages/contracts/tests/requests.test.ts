import { expect, test } from "vitest";
import { applicableFields, compareDecimals, createFieldRecord, createRequestSchema, itemTotal, matchesCondition, patchDraftSchema, resubmitRequestSchema, revisionMetadataSchema, revisionQuerySchema, sumAmounts, validateFields, type PublishedRequestType } from "../src/requests";

const definition: PublishedRequestType = {
    id: "30000000-0000-4000-8000-000000000001", versionId: "30000000-0000-4000-8000-000000000002", code: "TEST", name: { en: "Test" }, versionNumber: 1, isEnabled: true, monetary: false, supportsLineItems: false, publishedAt: "2026-11-06T00:00:00Z",
    fields: [
        { key: "downstream", kind: "TEXT", label: { en: "Downstream" }, required: true, visibleWhen: { all: [{ fieldKey: "reason", operator: "PRESENT" }] } },
        { key: "reason", kind: "TEXT", label: { en: "Reason" }, required: true, visibleWhen: { all: [{ fieldKey: "flag", operator: "EQ", value: false }] } },
        { key: "flag", kind: "BOOLEAN", label: { en: "Flag" }, required: true },
        { key: "amount", kind: "DECIMAL", label: { en: "Amount" }, required: false, constraints: { min: "0.10", max: "10" } },
        { key: "day", kind: "DATE", label: { en: "Day" }, required: false },
    ],
};
test("CT-01/02 strict write boundary rejects authority and invalid decimals", () =>
{
    const base = { typeId: definition.id, formDefinitionVersionId: definition.versionId };
    expect(createRequestSchema.safeParse(base).success).toBe(true);
    for (const name of ["ownerId", "requesterId", "departmentId", "requestNumber", "status", "amount", "version"])
    {
        expect(createRequestSchema.safeParse({ ...base, [name]: "untrusted" }).success).toBe(false);
    }
    for (const monetaryAmount of [1.1, "NaN", "Infinity", "1e2", "-1", "01.00", "1.001"])
    {
        expect(createRequestSchema.safeParse({ ...base, monetaryAmount }).success).toBe(false);
    }
    expect(createRequestSchema.safeParse({ ...base, priority: "NORMAL" }).success).toBe(false);
});
test("FT-015 typed false is present; hidden upstream is unset downstream regardless of declaration order", () =>
{
    expect(applicableFields(definition.fields, { flag: true, reason: "hidden" }).map((field) => field.key)).toEqual(["flag", "amount", "day"]);
    expect(validateFields(definition, { flag: false }, true)).toEqual([{ field: "fields.reason", code: "REQUIRED", message: "Reason is required." }]);
    expect(validateFields(definition, { flag: true, reason: "hidden", downstream: "injected" }, false).map((issue) => issue.code)).toEqual(["FORM_FIELD_NOT_APPLICABLE", "FORM_FIELD_NOT_APPLICABLE"]);
    expect(validateFields(definition, { flag: false, reason: "shown", downstream: "valid" }, true)).toEqual([]);
    expect(validateFields(definition, { flag: true, amount: "0.09", day: "2026-02-30" }, true).map((issue) => issue.field)).toEqual(["fields.amount", "fields.day"]);
});
test("FT-015 exact decimal quantities and money have no binary floating-point loss", () =>
{
    expect(itemTotal("0.1", "0.20")).toBe("0.02");
    expect(itemTotal("1.5", "0.01")).toBe("0.02");
    expect(sumAmounts(["90071992547409.91", "0.01"])).toBe("90071992547409.92");
    expect(compareDecimals("1.0", "1.000000")).toBe(0);
});

test("BUG-B02 title limits give specific feedback for create and draft updates", () =>
{
    const boundaries = [
        { schema: createRequestSchema, base: { typeId: definition.id, formDefinitionVersionId: definition.versionId } },
        { schema: patchDraftSchema, base: { expectedVersion: 0 } },
    ];
    for (const { schema, base } of boundaries)
    {
        for (const title of [undefined, "", "W".repeat(200), `  ${"W".repeat(200)}  `])
        {
            expect(schema.safeParse({ ...base, title }).success).toBe(true);
        }
        for (const length of [201, 255, 256, 300, 367])
        {
            const result = schema.safeParse({ ...base, title: "W".repeat(length) });
            expect(result.success).toBe(false);
            if (!result.success)
            {
                expect(result.error.issues).toEqual([expect.objectContaining({ path: ["title"], message: "Title must be 200 characters or fewer." })]);
            }
        }
    }
});

test("withdrawal reason stays optional; version and strict authority are required", async () =>
{
    const { withdrawRequestSchema } = await import("../src/requests");
    expect(withdrawRequestSchema.parse({ expectedVersion: 1 })).toEqual({ expectedVersion: 1 });
    expect(withdrawRequestSchema.parse({ expectedVersion: 1, reason: "" }).reason).toBe("");
    expect(withdrawRequestSchema.parse({ expectedVersion: 1, reason: "Changed plans" }).reason).toBe("Changed plans");
    for (const body of [{}, { expectedVersion: -1 }, { expectedVersion: 1.5 }, { expectedVersion: 1, reason: null }, { expectedVersion: 1, actorId: "injected" }]) expect(withdrawRequestSchema.safeParse(body).success).toBe(false);
});

test.each(["invalid", "", "1e2", "NaN", "1.2.3"])("review: invalid item quantity %s returns validation issues instead of throwing", (quantity) =>
{
    const content = { typeId: definition.id, formDefinitionVersionId: definition.versionId, lineItems: [{ description: "Part", quantity, unitAmount: "1.00" }] };
    expect(createRequestSchema.safeParse(content).success).toBe(false);
    expect(patchDraftSchema.safeParse({ expectedVersion: 0, lineItems: content.lineItems }).success).toBe(false);
});

test("B02 explicit null, empty, or whitespace values fail validation while omitted draft keys remain valid", () =>
{
    const allKinds: PublishedRequestType = {
        ...definition,
        fields: [
            { key: "shortText", kind: "TEXT", label: { en: "Short text" }, required: false },
            { key: "longText", kind: "TEXTAREA", label: { en: "Long text" }, required: false },
            { key: "amount", kind: "DECIMAL", label: { en: "Amount" }, required: false },
            { key: "day", kind: "DATE", label: { en: "Day" }, required: false },
            { key: "choice", kind: "SELECT", label: { en: "Choice" }, required: false, constraints: { options: [{ value: "A", label: { en: "A" } }] } },
            { key: "flag", kind: "BOOLEAN", label: { en: "Flag" }, required: false },
            { key: "hiddenNote", kind: "TEXT", label: { en: "Hidden note" }, required: false, visibleWhen: { all: [{ fieldKey: "flag", operator: "EQ", value: true }] } },
        ],
    };
    expect(validateFields(allKinds, {}, false)).toEqual([]);
    for (const key of ["shortText", "longText", "amount", "day", "choice", "flag"])
    {
        for (const badValue of [null, "", "   "])
        {
            for (const complete of [false, true])
            {
                expect(validateFields(allKinds, { [key]: badValue }, complete)).toEqual([
                    expect.objectContaining({ field: `fields.${key}`, code: "INVALID_VALUE" }),
                ]);
            }
        }
    }
    for (const badValue of [null, "", "   "])
    {
        expect(validateFields(allKinds, { flag: false, hiddenNote: badValue }, false)).toEqual([
            expect.objectContaining({ field: "fields.hiddenNote", code: "FORM_FIELD_NOT_APPLICABLE" }),
        ]);
    }
});

test("B03 inherited Object.prototype keys never trigger conditions and field storage is prototype-free", () =>
{
    const protoDefinition: PublishedRequestType = {
        ...definition,
        fields: [
            { key: "constructor", kind: "TEXT", label: { en: "Constructor" }, required: false },
            { key: "toString", kind: "TEXT", label: { en: "To String" }, required: false },
            { key: "valueOf", kind: "TEXT", label: { en: "Value Of" }, required: false },
            { key: "hasOwnProperty", kind: "TEXT", label: { en: "Has Own" }, required: false },
            { key: "dependent", kind: "TEXT", label: { en: "Dependent" }, required: true, visibleWhen: { any: [{ fieldKey: "constructor", operator: "PRESENT" }, { fieldKey: "toString", operator: "PRESENT" }, { fieldKey: "valueOf", operator: "PRESENT" }, { fieldKey: "hasOwnProperty", operator: "PRESENT" }] } },
            { key: "hiddenParent", kind: "TEXT", label: { en: "Hidden parent" }, required: false, visibleWhen: { all: [{ fieldKey: "constructor", operator: "EQ", value: "activate" }] } },
            { key: "downstream", kind: "TEXT", label: { en: "Downstream" }, required: true, visibleWhen: { all: [{ fieldKey: "hiddenParent", operator: "PRESENT" }] } },
        ],
    };

    expect(Object.getPrototypeOf(createFieldRecord({ constructor: "ok" }))).toBeNull();
    expect(matchesCondition({ any: [{ fieldKey: "constructor", operator: "PRESENT" }, { fieldKey: "toString", operator: "NE", value: "x" }] }, {}, protoDefinition.fields)).toBe(false);
    expect(applicableFields(protoDefinition.fields, {}).map((field) => field.key)).toEqual(["constructor", "toString", "valueOf", "hasOwnProperty"]);
    expect(validateFields(protoDefinition, {}, true)).toEqual([]);
    expect(validateFields(protoDefinition, { hiddenParent: "injected" }, false)).toEqual([
        expect.objectContaining({ field: "fields.hiddenParent", code: "FORM_FIELD_NOT_APPLICABLE" }),
    ]);
    expect(applicableFields(protoDefinition.fields, { constructor: "activate", hiddenParent: "ok" }).map((field) => field.key)).toEqual([
        "constructor",
        "toString",
        "valueOf",
        "hasOwnProperty",
        "dependent",
        "hiddenParent",
        "downstream",
    ]);
});

test("RR-AC-03/04 resubmit and revision list inputs are strict and bounded", () =>
{
    expect(resubmitRequestSchema.parse({ expectedVersion: 2 })).toEqual({ expectedVersion: 2 });
    for (const value of [{}, { expectedVersion: null }, { expectedVersion: 1, extra: true }]) expect(resubmitRequestSchema.safeParse(value).success).toBe(false);
    expect(revisionQuerySchema.parse({})).toEqual({ pageNumber: 1, pageSize: 20 });
    for (const value of [{ pageNumber: 0 }, { pageNumber: 10001 }, { pageSize: 101 }, { extra: "x" }]) expect(revisionQuerySchema.safeParse(value).success).toBe(false);
    expect(revisionMetadataSchema.safeParse({ id: definition.id, revisionNumber: 1, formDefinitionVersionId: definition.versionId, submittedAt: "2026-11-06T00:00:00Z", submittedBy: definition.id, cycleId: definition.versionId }).success).toBe(true);
});
