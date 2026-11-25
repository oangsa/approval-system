import { z } from "zod";

export const decimalSchema = z.string().max(24).regex(/^-?(?:0|[1-9]\d*)(?:\.\d{1,6})?$/);
export const moneySchema = z.string().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/);

export interface IFieldIssue
{
    field: string;
    code: string;
    message: string;
}

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

export function safeItemTotal(quantity: string, unitAmount: string): string | null
{
    if (!decimalSchema.safeParse(quantity).success || compareDecimals(quantity, "0") <= 0 || !moneySchema.safeParse(unitAmount).success) return null;
    const total = itemTotal(quantity, unitAmount);
    return moneySchema.safeParse(total).success ? total : null;
}

export function sumAmounts(values: string[]): string
{
    const cents = values.reduce((sum, value) => sum + scaled(value) / 10000n, 0n);
    return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

export function normalizeMoney(value: string): string
{
    if (!moneySchema.safeParse(value).success) return value;
    const cents = scaled(value) / 10000n;
    return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
}

export const localizedTextSchema = z.strictObject({
    en: z.string().trim().min(1, "English label is required.").max(200),
    th: z.string().trim().min(1).max(200).optional(),
});

export const localizedDescriptionSchema = z.strictObject({
    en: z.string().trim().min(1, "English description is required.").max(1000),
    th: z.string().trim().min(1).max(1000).optional(),
});

export type LocalizedText = z.infer<typeof localizedTextSchema>;

export function resolveLocalizedText(value: { en: string; th?: string } | undefined, locale: "en" | "th" = "en"): string
{
    if (!value) return "";
    if (locale === "th" && value.th?.trim()) return value.th.trim();
    return value.en;
}

export const conditionOperatorSchema = z.enum(["EQ", "NE", "GT", "GTE", "LT", "LTE", "IN", "PRESENT"]);
export type ConditionOperator = z.infer<typeof conditionOperatorSchema>;

export const conditionAtomSchema = z.strictObject({
    fieldKey: z.string().min(1).max(64),
    operator: conditionOperatorSchema,
    value: z.union([z.string(), z.boolean(), z.array(z.union([z.string(), z.boolean()]))]).optional(),
});
export type ConditionAtom = z.infer<typeof conditionAtomSchema>;

export const conditionSchema = z.strictObject({
    all: z.array(conditionAtomSchema).min(1).max(16).optional(),
    any: z.array(conditionAtomSchema).min(1).max(16).optional(),
}).refine(
    (value) => (value.all !== undefined || value.any !== undefined) && (value.all?.length ?? 0) + (value.any?.length ?? 0) <= 16,
    "Condition must include at least one non-empty group and at most 16 rules total.",
);
export type Condition = z.infer<typeof conditionSchema>;

export const fieldKindSchema = z.enum(["TEXT", "TEXTAREA", "DECIMAL", "DATE", "SELECT", "BOOLEAN"]);
export type FieldKind = z.infer<typeof fieldKindSchema>;

export const requestFieldSchema = z.strictObject({
    key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,63}$/, "Field key must start with a lowercase letter and use letters, numbers, or underscores."),
    kind: fieldKindSchema,
    label: localizedTextSchema,
    description: localizedDescriptionSchema.optional(),
    required: z.boolean(),
    defaultValue: z.unknown().optional(),
    constraints: z.strictObject({
        min: z.string().optional(),
        max: z.string().optional(),
        minLength: z.number().int().nonnegative().optional(),
        maxLength: z.number().int().nonnegative().optional(),
        options: z.array(z.strictObject({ value: z.string().trim().min(1).max(100), label: localizedTextSchema })).max(20).optional(),
    }).optional(),
    visibleWhen: conditionSchema.optional(),
    requiredWhen: conditionSchema.optional(),
});
export type RequestField = z.infer<typeof requestFieldSchema>;

export const publishedRequestTypeSchema = z.strictObject({
    id: z.uuid(),
    code: z.string().min(1),
    name: localizedTextSchema,
    description: localizedDescriptionSchema.optional(),
    versionId: z.uuid(),
    versionNumber: z.number().int().positive(),
    isEnabled: z.boolean(),
    supportsLineItems: z.boolean(),
    monetary: z.boolean(),
    fields: z.array(requestFieldSchema).max(50),
    publishedAt: z.iso.datetime(),
});
export type PublishedRequestType = z.infer<typeof publishedRequestTypeSchema>;

export const requestTypeCodeSchema = z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/, "Code must start with a letter and use letters, numbers, hyphens, or underscores.");

export const requestTypeDraftContentSchema = z.strictObject({
    name: localizedTextSchema,
    description: localizedDescriptionSchema.optional(),
    monetary: z.boolean(),
    supportsLineItems: z.boolean(),
    fields: z.array(requestFieldSchema).max(50),
});
export type RequestTypeDraftContent = z.infer<typeof requestTypeDraftContentSchema>;

export const createRequestTypeSchema = requestTypeDraftContentSchema.extend({
    code: requestTypeCodeSchema,
});
export type CreateRequestType = z.infer<typeof createRequestTypeSchema>;

export const patchRequestTypeDraftSchema = z.strictObject({
    expectedVersion: z.number().int().nonnegative(),
    name: localizedTextSchema.optional(),
    description: localizedDescriptionSchema.nullable().optional(),
    monetary: z.boolean().optional(),
    supportsLineItems: z.boolean().optional(),
    fields: z.array(requestFieldSchema).max(50).optional(),
});
export type PatchRequestTypeDraft = z.infer<typeof patchRequestTypeDraftSchema>;

export const versionedRequestTypeActionSchema = z.strictObject({
    expectedVersion: z.number().int().nonnegative(),
});
export type VersionedRequestTypeAction = z.infer<typeof versionedRequestTypeActionSchema>;

export const requestTypeDraftDtoSchema = z.strictObject({
    id: z.uuid(),
    code: z.string().min(1),
    name: localizedTextSchema,
    description: localizedDescriptionSchema.optional(),
    isEnabled: z.boolean(),
    monetary: z.boolean(),
    supportsLineItems: z.boolean(),
    fields: z.array(requestFieldSchema).max(50),
    version: z.number().int().nonnegative(),
    publishedVersionId: z.uuid().nullable(),
    publishedVersionNumber: z.number().int().positive().nullable(),
    updatedAt: z.iso.datetime(),
});
export type RequestTypeDraftDto = z.infer<typeof requestTypeDraftDtoSchema>;

export const adminRequestTypeSummarySchema = z.strictObject({
    id: z.uuid(),
    code: z.string().min(1),
    name: localizedTextSchema,
    description: localizedDescriptionSchema.optional(),
    isEnabled: z.boolean(),
    monetary: z.boolean(),
    supportsLineItems: z.boolean(),
    version: z.number().int().nonnegative(),
    publishedVersionId: z.uuid().nullable(),
    publishedVersionNumber: z.number().int().positive().nullable(),
    publishedAt: z.iso.datetime().nullable(),
    hasDraft: z.boolean(),
    updatedAt: z.iso.datetime(),
});
export type AdminRequestTypeSummary = z.infer<typeof adminRequestTypeSummarySchema>;

export const adminRequestTypeVersionSummarySchema = z.strictObject({
    versionId: z.uuid(),
    versionNumber: z.number().int().positive(),
    publishedAt: z.iso.datetime(),
});
export type AdminRequestTypeVersionSummary = z.infer<typeof adminRequestTypeVersionSummarySchema>;

export const adminRequestTypeDetailSchema = z.strictObject({
    id: z.uuid(),
    code: z.string().min(1),
    isEnabled: z.boolean(),
    version: z.number().int().nonnegative(),
    publishedVersion: publishedRequestTypeSchema.nullable(),
    draft: requestTypeDraftContentSchema.nullable(),
    versions: z.array(adminRequestTypeVersionSummarySchema),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
});
export type AdminRequestTypeDetail = z.infer<typeof adminRequestTypeDetailSchema>;

function matchesTypedScalar(target: RequestField, value: unknown): boolean
{
    if (target.kind === "BOOLEAN") return typeof value === "boolean";
    if (typeof value !== "string") return false;
    if (target.kind === "DECIMAL") return decimalSchema.safeParse(value).success;
    if (target.kind === "DATE") return z.iso.date().safeParse(value).success;
    if (target.kind === "SELECT") return !!target.constraints?.options?.some((option) => option.value === value);
    return true;
}

function literalSignature(target: RequestField, value: unknown): string
{
    if (target.kind === "DECIMAL" && typeof value === "string" && decimalSchema.safeParse(value).success)
    {
        const negative = value.startsWith("-");
        const [whole = "0", fraction = ""] = value.replace(/^-/, "").split(".");
        const normalizedFraction = fraction.replace(/0+$/, "");
        const canonical = normalizedFraction ? `${whole}.${normalizedFraction}` : whole;
        return negative && canonical !== "0" ? `-${canonical}` : canonical;
    }
    return JSON.stringify(value);
}

export function validateRequestTypeDefinition(content: RequestTypeDraftContent): IFieldIssue[]
{
    const issues: IFieldIssue[] = [];
    const add = (field: string, message: string) => issues.push({ field, code: "VALIDATION_ERROR", message });

    if (content.supportsLineItems && !content.monetary)
    {
        add("supportsLineItems", "Line items require monetary support to be enabled.");
    }

    const byKey = new Map<string, RequestField>();
    const duplicateKeys = new Set<string>();

    content.fields.forEach((field, index) =>
    {
        if (byKey.has(field.key))
        {
            duplicateKeys.add(field.key);
            add(`fields[${index}].key`, `Duplicate field key "${field.key}".`);
        }
        else
        {
            byKey.set(field.key, field);
        }

        const constraints = field.constraints;
        if (field.kind === "TEXT" || field.kind === "TEXTAREA")
        {
            if (constraints && (constraints.min !== undefined || constraints.max !== undefined || constraints.options !== undefined))
            {
                add(`fields[${index}].constraints`, "Only text length bounds are allowed for text fields.");
            }
            if (constraints?.minLength !== undefined && constraints?.maxLength !== undefined && constraints.minLength > constraints.maxLength)
            {
                add(`fields[${index}].constraints.minLength`, "Minimum length cannot exceed maximum length.");
            }
        }
        else if (field.kind === "DECIMAL")
        {
            if (constraints && (constraints.minLength !== undefined || constraints.maxLength !== undefined || constraints.options !== undefined))
            {
                add(`fields[${index}].constraints`, "Only decimal min and max bounds are allowed for decimal fields.");
            }
            const minValid = constraints?.min === undefined || decimalSchema.safeParse(constraints.min).success;
            const maxValid = constraints?.max === undefined || decimalSchema.safeParse(constraints.max).success;
            if (!minValid) add(`fields[${index}].constraints.min`, "Minimum bound must be a valid decimal string.");
            if (!maxValid) add(`fields[${index}].constraints.max`, "Maximum bound must be a valid decimal string.");
            if (constraints?.min !== undefined && constraints?.max !== undefined && minValid && maxValid && compareDecimals(constraints.min, constraints.max) > 0)
            {
                add(`fields[${index}].constraints.min`, "Minimum bound cannot exceed maximum bound.");
            }
        }
        else if (field.kind === "DATE")
        {
            if (constraints && (constraints.minLength !== undefined || constraints.maxLength !== undefined || constraints.options !== undefined))
            {
                add(`fields[${index}].constraints`, "Only date min and max bounds are allowed for date fields.");
            }
            const minValid = constraints?.min === undefined || z.iso.date().safeParse(constraints.min).success;
            const maxValid = constraints?.max === undefined || z.iso.date().safeParse(constraints.max).success;
            if (!minValid) add(`fields[${index}].constraints.min`, "Minimum date must use YYYY-MM-DD format.");
            if (!maxValid) add(`fields[${index}].constraints.max`, "Maximum date must use YYYY-MM-DD format.");
            if (constraints?.min !== undefined && constraints?.max !== undefined && minValid && maxValid && constraints.min > constraints.max)
            {
                add(`fields[${index}].constraints.min`, "Minimum date cannot be after maximum date.");
            }
        }
        else if (field.kind === "SELECT")
        {
            if (constraints && (constraints.min !== undefined || constraints.max !== undefined || constraints.minLength !== undefined || constraints.maxLength !== undefined))
            {
                add(`fields[${index}].constraints`, "Select fields support options only.");
            }
            if (!constraints?.options?.length)
            {
                add(`fields[${index}].constraints.options`, "Select fields require at least one option.");
            }
            else
            {
                const seenValues = new Set<string>();
                constraints.options.forEach((option, optionIndex) =>
                {
                    if (seenValues.has(option.value))
                    {
                        add(`fields[${index}].constraints.options[${optionIndex}].value`, `Duplicate option value "${option.value}".`);
                    }
                    seenValues.add(option.value);
                });
            }
        }
        else if (field.kind === "BOOLEAN")
        {
            if (constraints && (constraints.min !== undefined || constraints.max !== undefined || constraints.minLength !== undefined || constraints.maxLength !== undefined || constraints.options !== undefined))
            {
                add(`fields[${index}].constraints`, "Boolean fields do not accept value constraints or options.");
            }
        }

        if (field.defaultValue !== undefined)
        {
            if (!matchesTypedScalar(field, field.defaultValue))
            {
                add(`fields[${index}].defaultValue`, "Default value does not match field kind or options.");
            }
            else if (typeof field.defaultValue === "string")
            {
                if ((constraints?.minLength !== undefined && field.defaultValue.length < constraints.minLength) || (constraints?.maxLength !== undefined && field.defaultValue.length > constraints.maxLength))
                {
                    add(`fields[${index}].defaultValue`, "Default value length is outside allowed bounds.");
                }
                if (field.kind === "DECIMAL" && decimalSchema.safeParse(field.defaultValue).success)
                {
                    if (constraints?.min !== undefined && decimalSchema.safeParse(constraints.min).success && compareDecimals(field.defaultValue, constraints.min) < 0)
                    {
                        add(`fields[${index}].defaultValue`, "Default value is below minimum bound.");
                    }
                    if (constraints?.max !== undefined && decimalSchema.safeParse(constraints.max).success && compareDecimals(field.defaultValue, constraints.max) > 0)
                    {
                        add(`fields[${index}].defaultValue`, "Default value exceeds maximum bound.");
                    }
                }
                if (field.kind === "DATE" && z.iso.date().safeParse(field.defaultValue).success)
                {
                    if (constraints?.min !== undefined && z.iso.date().safeParse(constraints.min).success && field.defaultValue < constraints.min)
                    {
                        add(`fields[${index}].defaultValue`, "Default value is before minimum date.");
                    }
                    if (constraints?.max !== undefined && z.iso.date().safeParse(constraints.max).success && field.defaultValue > constraints.max)
                    {
                        add(`fields[${index}].defaultValue`, "Default value is after maximum date.");
                    }
                }
            }
        }
    });

    const dependencies = new Map<string, Set<string>>();
    for (const key of byKey.keys()) dependencies.set(key, new Set());

    content.fields.forEach((field, index) =>
    {
        for (const conditionName of ["visibleWhen", "requiredWhen"] as const)
        {
            const condition = field[conditionName];
            if (!condition) continue;
            for (const group of ["all", "any"] as const)
            {
                const atoms = condition[group];
                if (!atoms) continue;
                const seenAtoms = new Set<string>();
                atoms.forEach((atom, atomIndex) =>
                {
                    const basePath = `fields[${index}].${conditionName}.${group}[${atomIndex}]`;
                    if (atom.fieldKey === field.key)
                    {
                        add(`${basePath}.fieldKey`, `Field "${field.key}" cannot reference itself.`);
                        return;
                    }
                    const target = byKey.get(atom.fieldKey);
                    if (!target)
                    {
                        add(`${basePath}.fieldKey`, `Referenced field "${atom.fieldKey}" does not exist.`);
                        return;
                    }
                    dependencies.get(field.key)!.add(target.key);

                    if (atom.operator === "PRESENT")
                    {
                        if (atom.value !== undefined)
                        {
                            add(`${basePath}.value`, "PRESENT conditions must not provide a comparison value.");
                        }
                    }
                    else if (atom.operator === "IN")
                    {
                        if (!Array.isArray(atom.value) || atom.value.length < 1 || atom.value.length > 20)
                        {
                            add(`${basePath}.value`, "IN conditions require a non-empty list of up to 20 values.");
                        }
                        else
                        {
                            const seenValues = new Set<string>();
                            atom.value.forEach((entry, valueIndex) =>
                            {
                                if (!matchesTypedScalar(target, entry))
                                {
                                    add(`${basePath}.value[${valueIndex}]`, `Comparison value is incompatible with "${target.key}" (${target.kind}).`);
                                    return;
                                }
                                const signature = literalSignature(target, entry);
                                if (seenValues.has(signature))
                                {
                                    add(`${basePath}.value[${valueIndex}]`, "Duplicate value in IN condition.");
                                }
                                seenValues.add(signature);
                            });
                        }
                    }
                    else if (atom.operator === "GT" || atom.operator === "GTE" || atom.operator === "LT" || atom.operator === "LTE")
                    {
                        if (target.kind !== "DECIMAL" && target.kind !== "DATE")
                        {
                            add(`${basePath}.operator`, `Operator "${atom.operator}" is only supported for DECIMAL and DATE fields.`);
                        }
                        else if (!matchesTypedScalar(target, atom.value))
                        {
                            add(`${basePath}.value`, `Comparison value is incompatible with "${target.key}" (${target.kind}).`);
                        }
                    }
                    else
                    {
                        if (!matchesTypedScalar(target, atom.value))
                        {
                            add(`${basePath}.value`, `Comparison value is incompatible with "${target.key}" (${target.kind}).`);
                        }
                    }

                    const atomSignature = `${atom.fieldKey}|${atom.operator}|${Array.isArray(atom.value) ? atom.value.map((entry) => literalSignature(target, entry)).join(",") : literalSignature(target, atom.value)}`;
                    if (seenAtoms.has(atomSignature))
                    {
                        add(basePath, "Duplicate condition rule in the same group.");
                    }
                    seenAtoms.add(atomSignature);
                });
            }
        }
    });

    if (!duplicateKeys.size)
    {
        const state = new Map<string, 0 | 1 | 2>();
        const stack: string[] = [];
        const cyclic = new Set<string>();
        const visit = (key: string): void =>
        {
            const current = state.get(key) ?? 0;
            if (current === 2) return;
            state.set(key, 1);
            stack.push(key);
            for (const dependency of dependencies.get(key) ?? [])
            {
                const depState = state.get(dependency) ?? 0;
                if (depState === 1)
                {
                    const start = stack.indexOf(dependency);
                    for (const member of stack.slice(start)) cyclic.add(member);
                }
                else if (depState === 0)
                {
                    visit(dependency);
                }
            }
            stack.pop();
            state.set(key, 2);
        };
        for (const key of byKey.keys()) visit(key);
        content.fields.forEach((field, index) =>
        {
            if (cyclic.has(field.key))
            {
                add(`fields[${index}].key`, `Cyclic dependency detected involving "${field.key}".`);
            }
        });
    }

    return issues;
}
