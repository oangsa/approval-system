import { z } from "zod";
import { departmentSummarySchema, userSummarySchema } from "./auth";

export const decimalSchema = z.string().max(24).regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,6})?$/);
export const moneySchema = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/);
export const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const requestStatusSchema = z.enum(["DRAFT", "PENDING", "RETURNED", "APPROVED", "REJECTED", "WITHDRAWN"]);
const localizedSchema = z.strictObject({ en: z.string().min(1), th: z.string().optional() });
const atomSchema = z.strictObject({
    fieldKey: z.string(), operator: z.enum(["EQ", "NE", "GT", "GTE", "LT", "LTE", "IN", "PRESENT"]),
    value: z.union([z.string(), z.boolean(), z.array(z.union([z.string(), z.boolean()]))]).optional(),
});
export const conditionSchema = z.strictObject({ all: z.array(atomSchema).min(1).max(16).optional(), any: z.array(atomSchema).min(1).max(16).optional() }).refine((value) => value.all || value.any);
export const requestFieldSchema = z.strictObject({
    key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,63}$/), kind: z.enum(["TEXT", "TEXTAREA", "DECIMAL", "DATE", "SELECT", "BOOLEAN"]),
    label: localizedSchema, description: localizedSchema.optional(), required: z.boolean(), defaultValue: z.unknown().optional(),
    constraints: z.strictObject({ min: z.string().optional(), max: z.string().optional(), minLength: z.number().int().nonnegative().optional(), maxLength: z.number().int().nonnegative().optional(), options: z.array(z.strictObject({ value: z.string(), label: localizedSchema })).max(20).optional() }).optional(),
    visibleWhen: conditionSchema.optional(), requiredWhen: conditionSchema.optional(),
});
export const publishedRequestTypeSchema = z.strictObject({
    id: z.uuid(), code: z.string().min(1), name: localizedSchema, description: localizedSchema.optional(), versionId: z.uuid(), versionNumber: z.number().int().positive(),
    isEnabled: z.boolean(), supportsLineItems: z.boolean(), monetary: z.boolean(), fields: z.array(requestFieldSchema).max(50), publishedAt: z.iso.datetime(),
});
export const editableLineItemSchema = z.strictObject({ description: z.string().trim().max(1000), quantity: decimalSchema.refine((value) => compareDecimals(value, "0") > 0 && value.split(".")[0]!.length <= 18), unitAmount: moneySchema });
const editable = {
    title: z.string().trim().max(200).optional(), justification: z.string().trim().max(10000).optional(), priority: prioritySchema.optional(),
    fields: z.record(z.string().max(64), z.unknown()).refine((fields) => Object.keys(fields).length <= 50).optional(), lineItems: z.array(editableLineItemSchema).max(100).optional(), monetaryAmount: moneySchema.nullable().optional(),
};
export const createRequestSchema = z.strictObject({ typeId: z.uuid(), formDefinitionVersionId: z.uuid(), ...editable });
export const patchDraftSchema = z.strictObject({ expectedVersion: z.number().int().nonnegative(), formDefinitionVersionId: z.uuid().optional(), ...editable });
export const submitRequestSchema = z.strictObject({ expectedVersion: z.number().int().nonnegative() });
export const requestRevisionSchema = z.strictObject({
    id: z.uuid(), revisionNumber: z.number().int().positive(), formDefinitionVersionId: z.uuid(), fields: z.record(z.string(), z.unknown()),
    lineItems: z.array(editableLineItemSchema.extend({ id: z.uuid(), totalAmount: moneySchema })), amount: moneySchema.nullable(), currency: z.string().nullable(), submittedAt: z.iso.datetime().nullable(), submittedBy: z.uuid().nullable(),
});
export const requestDetailSchema = z.strictObject({
    id: z.uuid(), requestNumber: z.string().nullable(), typeId: z.uuid(), typeCode: z.string(), title: z.string(), priority: prioritySchema, status: requestStatusSchema,
    requester: userSummarySchema, department: departmentSummarySchema.nullable(), revisionNumber: z.number().int().positive().nullable(), currentCycleId: z.uuid().nullable(),
    createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(), submittedAt: z.iso.datetime().nullable(), version: z.number().int().nonnegative(), justification: z.string(),
    workingRevision: requestRevisionSchema.nullable(), submittedRevision: requestRevisionSchema.nullable(), currentStageNumber: z.union([z.literal(1), z.literal(2)]).nullable(),
    currentApprovers: z.array(z.strictObject({ slotId: z.uuid(), stageNumber: z.union([z.literal(1), z.literal(2)]), reviewer: userSummarySchema.pick({ id: true, displayName: true }), status: z.enum(["WAITING", "ACTIONABLE", "APPROVED", "REJECTED", "RETURNED", "CANCELLED"]) })), availableActions: z.array(z.string()),
});
export const requestSummarySchema = requestDetailSchema.pick({ id: true, requestNumber: true, typeId: true, typeCode: true, title: true, priority: true, status: true, requester: true, department: true, revisionNumber: true, currentCycleId: true, createdAt: true, updatedAt: true, submittedAt: true, version: true });
export type RequestSummary = z.infer<typeof requestSummarySchema>;
export type PublishedRequestType = z.infer<typeof publishedRequestTypeSchema>;
export type RequestField = z.infer<typeof requestFieldSchema>;
export type Condition = z.infer<typeof conditionSchema>;
export type CreateRequest = z.infer<typeof createRequestSchema>;
export type PatchDraft = z.infer<typeof patchDraftSchema>;
export type RequestRevision = z.infer<typeof requestRevisionSchema>;
export type RequestDetail = z.infer<typeof requestDetailSchema>;
export interface IFieldIssue { field: string; code: string; message: string; }

function scaled(value: string): bigint
{
    const negative = value.startsWith("-");
    const [whole = "0", fraction = ""] = value.replace(/^-/, "").split(".");
    const result = BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"));
    return negative ? -result : result;
}
export function compareDecimals(left: string, right: string): number
{
    const difference = scaled(left) - scaled(right);
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}
export function itemTotal(quantity: string, unitAmount: string): string
{
    const cents = (scaled(quantity) * scaled(unitAmount) + 5000000000n) / 10000000000n;
    return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
export function sumAmounts(values: string[]): string
{
    const cents = values.reduce((sum, value) => sum + scaled(value) / 10000n, 0n);
    return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}
export function isPresent(value: unknown): boolean
{
    return value !== undefined && value !== null && value !== "";
}
export function matchesCondition(condition: Condition | undefined, values: Record<string, unknown>, fields: RequestField[]): boolean
{
    if (!condition) return true;
    const atom = (rule: z.infer<typeof atomSchema>): boolean =>
    {
        const value = values[rule.fieldKey];
        if (rule.operator === "PRESENT") return isPresent(value);
        if (!isPresent(value)) return false;
        const kind = fields.find((field) => field.key === rule.fieldKey)?.kind;
        const equal = (candidate: unknown) => kind === "DECIMAL" && typeof value === "string" && typeof candidate === "string" && decimalSchema.safeParse(value).success && decimalSchema.safeParse(candidate).success ? compareDecimals(value, candidate) === 0 : value === candidate;
        if (rule.operator === "EQ") return equal(rule.value);
        if (rule.operator === "NE") return !equal(rule.value);
        if (rule.operator === "IN") return Array.isArray(rule.value) && rule.value.some(equal);
        if (typeof value !== "string" || typeof rule.value !== "string") return false;
        const order = kind === "DECIMAL" && decimalSchema.safeParse(value).success && decimalSchema.safeParse(rule.value).success ? compareDecimals(value, rule.value) : kind === "DATE" ? value.localeCompare(rule.value) : NaN;
        return rule.operator === "GT" ? order > 0 : rule.operator === "GTE" ? order >= 0 : rule.operator === "LT" ? order < 0 : order <= 0;
    };
    return (condition.all?.every(atom) ?? true) && (condition.any?.some(atom) ?? true);
}
export function applicableFields(fields: RequestField[], values: Record<string, unknown>): RequestField[]
{
    const done = new Set<string>();
    const visiting = new Set<string>();
    const applicable: RequestField[] = [];
    const effective: Record<string, unknown> = {};
    const visit = (field: RequestField): void =>
    {
        if (done.has(field.key)) return;
        if (visiting.has(field.key)) throw new Error("Invalid cyclic published definition");
        visiting.add(field.key);
        for (const condition of [field.visibleWhen, field.requiredWhen])
        {
            for (const atom of [...condition?.all ?? [], ...condition?.any ?? []])
            {
                const dependency = fields.find((item) => item.key === atom.fieldKey);
                if (!dependency) throw new Error("Invalid published dependency");
                visit(dependency);
            }
        }
        if (matchesCondition(field.visibleWhen, effective, fields))
        {
            effective[field.key] = values[field.key];
            applicable.push({ ...field, required: field.required || !!field.requiredWhen && matchesCondition(field.requiredWhen, effective, fields) });
        }
        visiting.delete(field.key);
        done.add(field.key);
    };
    fields.forEach(visit);
    return applicable;
}
export function validateFields(definition: PublishedRequestType, values: Record<string, unknown>, complete: boolean): IFieldIssue[]
{
    const visible = applicableFields(definition.fields, values);
    const issues: IFieldIssue[] = [];
    const add = (key: string, code: string, message: string) => issues.push({ field: `fields.${key}`, code, message });
    for (const key of Object.keys(values))
    {
        if (!visible.some((field) => field.key === key)) add(key, "FORM_FIELD_NOT_APPLICABLE", "This field is not applicable.");
    }
    for (const field of visible)
    {
        const value = values[field.key];
        if (!isPresent(value))
        {
            if (complete && field.required) add(field.key, "REQUIRED", `${field.label.en} is required.`);
            continue;
        }
        const constraints = field.constraints;
        const valid = field.kind === "BOOLEAN" ? typeof value === "boolean" : typeof value === "string" && (
            field.kind === "DECIMAL" ? decimalSchema.safeParse(value).success : field.kind === "DATE" ? z.iso.date().safeParse(value).success : field.kind === "SELECT" ? !!constraints?.options?.some((option) => option.value === value) : true);
        if (!valid)
        {
            add(field.key, "INVALID_VALUE", `${field.label.en} has an invalid value.`);
            continue;
        }
        if (typeof value === "string")
        {
            if ((constraints?.minLength !== undefined && value.length < constraints.minLength) || (constraints?.maxLength !== undefined && value.length > constraints.maxLength)) add(field.key, "OUT_OF_RANGE", "Text length is outside the allowed range.");
            const compare = (bound: string) => field.kind === "DECIMAL" ? compareDecimals(value, bound) : value.localeCompare(bound);
            if ((constraints?.min !== undefined && compare(constraints.min) < 0) || (constraints?.max !== undefined && compare(constraints.max) > 0)) add(field.key, "OUT_OF_RANGE", "Value is outside the allowed range.");
        }
    }
    return issues;
}
