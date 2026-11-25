import { z } from "zod";
import { departmentSummarySchema, userSummarySchema } from "./auth";
import {
    compareDecimals,
    conditionAtomSchema,
    conditionSchema,
    decimalSchema,
    formatMoney,
    itemTotal,
    moneySchema,
    normalizeMoney,
    publishedRequestTypeSchema,
    requestFieldSchema,
    safeItemTotal,
    sumAmounts,
    type Condition,
    type IFieldIssue,
    type PublishedRequestType,
    type RequestField,
} from "./requestTypes";

export {
    compareDecimals,
    conditionSchema,
    decimalSchema,
    formatMoney,
    itemTotal,
    moneySchema,
    normalizeMoney,
    publishedRequestTypeSchema,
    requestFieldSchema,
    safeItemTotal,
    sumAmounts,
    type Condition,
    type IFieldIssue,
    type PublishedRequestType,
    type RequestField,
};

export const prioritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);
export const requestStatusSchema = z.enum(["DRAFT", "PENDING", "RETURNED", "APPROVED", "REJECTED", "WITHDRAWN"]);
export const editableLineItemSchema = z.strictObject({ description: z.string().trim().max(1000), quantity: decimalSchema.refine((value) => decimalSchema.safeParse(value).success && compareDecimals(value, "0") > 0 && value.split(".")[0]!.length <= 17), unitAmount: moneySchema });
const editable = {
    title: z.string().trim().max(200, "Title must be 200 characters or fewer.").optional(), justification: z.string().trim().max(10000).optional(), priority: prioritySchema.optional(),
    fields: z.record(z.string().max(64), z.unknown()).refine((fields) => Object.keys(fields).length <= 50).optional(), lineItems: z.array(editableLineItemSchema).max(100).optional(), monetaryAmount: moneySchema.nullable().optional(),
};
export const createRequestSchema = z.strictObject({ typeId: z.uuid(), formDefinitionVersionId: z.uuid(), ...editable });
export const patchDraftSchema = z.strictObject({ expectedVersion: z.number().int().nonnegative(), formDefinitionVersionId: z.uuid().optional(), ...editable });
export const withdrawRequestSchema = z.strictObject({ expectedVersion: z.number().int().nonnegative(), reason: z.string().optional() });
export type WithdrawRequest = z.infer<typeof withdrawRequestSchema>;
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
export type CreateRequest = z.infer<typeof createRequestSchema>;
export type PatchDraft = z.infer<typeof patchDraftSchema>;
export type RequestRevision = z.infer<typeof requestRevisionSchema>;
export type RequestDetail = z.infer<typeof requestDetailSchema>;

export function hasOwnField(values: Record<string, unknown> | null | undefined, key: string): boolean
{
    return Boolean(values) && Object.prototype.hasOwnProperty.call(values, key);
}

export function getFieldValue(values: Record<string, unknown> | null | undefined, key: string): unknown
{
    return hasOwnField(values, key) ? values![key] : undefined;
}

export function createFieldRecord(source?: Iterable<readonly [string, unknown]> | Record<string, unknown> | null): Record<string, unknown>
{
    const record = Object.create(null) as Record<string, unknown>;
    if (!source) return record;
    const entries = Symbol.iterator in Object(source)
        ? (source as Iterable<readonly [string, unknown]>)
        : Object.entries(source as Record<string, unknown>);
    for (const [key, value] of entries)
    {
        if (value !== undefined) record[key] = value;
    }
    return record;
}

export function setFieldValue(values: Record<string, unknown> | null | undefined, key: string, value: unknown): Record<string, unknown>
{
    const next = createFieldRecord(values);
    if (value === undefined) delete next[key];
    else next[key] = value;
    return next;
}

export function isPresent(value: unknown): boolean
{
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim() !== "";
    return true;
}

function isTypedValue(kind: RequestField["kind"] | undefined, value: unknown): boolean
{
    if (kind === "BOOLEAN") return typeof value === "boolean";
    if (typeof value !== "string") return false;
    if (kind === "DECIMAL") return decimalSchema.safeParse(value).success;
    if (kind === "DATE") return z.iso.date().safeParse(value).success;
    return true;
}

export function matchesCondition(condition: Condition | undefined, values: Record<string, unknown>, fields: RequestField[]): boolean
{
    if (!condition) return true;
    const atom = (rule: z.infer<typeof conditionAtomSchema>): boolean =>
    {
        const value = getFieldValue(values, rule.fieldKey);
        if (rule.operator === "PRESENT") return isPresent(value);
        if (!isPresent(value)) return false;
        const kind = fields.find((field) => field.key === rule.fieldKey)?.kind;
        if (!isTypedValue(kind, value)) return false;
        const equal = (candidate: unknown) =>
        {
            if (!isTypedValue(kind, candidate)) return false;
            return kind === "DECIMAL" && typeof value === "string" && typeof candidate === "string"
                ? compareDecimals(value, candidate) === 0
                : value === candidate;
        };
        if (rule.operator === "EQ") return equal(rule.value);
        if (rule.operator === "NE") return isTypedValue(kind, rule.value) && !equal(rule.value);
        if (rule.operator === "IN") return Array.isArray(rule.value) && rule.value.some(equal);
        if (typeof value !== "string" || typeof rule.value !== "string" || !isTypedValue(kind, rule.value)) return false;
        if (kind !== "DECIMAL" && kind !== "DATE") return false;
        const order = kind === "DECIMAL" ? compareDecimals(value, rule.value) : value.localeCompare(rule.value);
        return rule.operator === "GT" ? order > 0 : rule.operator === "GTE" ? order >= 0 : rule.operator === "LT" ? order < 0 : order <= 0;
    };
    return (condition.all?.every(atom) ?? true) && (condition.any?.some(atom) ?? true);
}

export function applicableFields(fields: RequestField[], values: Record<string, unknown>): RequestField[]
{
    const done = new Set<string>();
    const visiting = new Set<string>();
    const resolved = new Map<string, RequestField>();
    const effective = createFieldRecord();
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
            const rawValue = getFieldValue(values, field.key);
            if (rawValue !== undefined) effective[field.key] = rawValue;
            resolved.set(field.key, { ...field, required: field.required || !!field.requiredWhen && matchesCondition(field.requiredWhen, effective, fields) });
        }
        visiting.delete(field.key);
        done.add(field.key);
    };
    fields.forEach(visit);
    return fields.flatMap((field) =>
    {
        const resolvedField = resolved.get(field.key);
        return resolvedField ? [resolvedField] : [];
    });
}

export function validateFields(definition: PublishedRequestType, values: Record<string, unknown>, complete: boolean): IFieldIssue[]
{
    const visible = applicableFields(definition.fields, values);
    const issues: IFieldIssue[] = [];
    const add = (key: string, code: string, message: string) => issues.push({ field: `fields.${key}`, code, message });
    for (const key of Object.keys(values))
    {
        if (getFieldValue(values, key) !== undefined && !visible.some((field) => field.key === key))
        {
            add(key, "FORM_FIELD_NOT_APPLICABLE", "This field is not applicable.");
        }
    }
    for (const field of visible)
    {
        const supplied = hasOwnField(values, field.key) && values[field.key] !== undefined;
        if (!supplied)
        {
            if (complete && field.required) add(field.key, "REQUIRED", `${field.label.en} is required.`);
            continue;
        }
        const value = values[field.key];
        const constraints = field.constraints;
        const valid = field.kind === "BOOLEAN"
            ? typeof value === "boolean"
            : typeof value === "string" && (
                field.kind === "DECIMAL"
                    ? decimalSchema.safeParse(value).success
                    : field.kind === "DATE"
                        ? z.iso.date().safeParse(value).success
                        : field.kind === "SELECT"
                            ? !!constraints?.options?.some((option) => option.value === value)
                            : value.trim().length > 0
            );
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
