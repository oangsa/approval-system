import { Plus, Trash2 } from "lucide-react";
import type { Condition, ConditionAtom, RequestField } from "@workflow/contracts";
import { ActionButton } from "~/components/actions/ActionButton";
import { fieldClassName } from "~/components/forms/FieldRenderer";
import { Input } from "~/components/ui/input";

type ConditionGroup = "all" | "any";

const textOperators = ["EQ", "NE", "IN", "PRESENT"] as const;
const rangeOperators = ["EQ", "NE", "GT", "GTE", "LT", "LTE", "IN", "PRESENT"] as const;

function operatorsForKind(kind: RequestField["kind"] | undefined): readonly ConditionAtom["operator"][]
{
    if (kind === "DECIMAL" || kind === "DATE") return rangeOperators;
    return textOperators;
}

function defaultScalarValue(target: RequestField | undefined): string | boolean
{
    if (!target) return "";
    if (target.kind === "BOOLEAN") return true;
    if (target.kind === "SELECT") return target.constraints?.options?.[0]?.value ?? "";
    return "";
}

function defaultAtom(target: RequestField): ConditionAtom
{
    return {
        fieldKey: target.key,
        operator: "EQ",
        value: defaultScalarValue(target),
    };
}

interface IInValueControlProps
{
    baseId: string;
    title: string;
    group: ConditionGroup;
    index: number;
    target: RequestField | undefined;
    value: ConditionAtom["value"];
    disabled: boolean;
    onChange(next: (string | boolean)[]): void;
}

function InValueControl({ baseId, title, group, index, target, value, disabled, onChange }: IInValueControlProps)
{
    const entries = Array.isArray(value) ? value : value !== undefined ? [value] : [];

    if (target?.kind === "BOOLEAN")
    {
        const invalidEntries = entries.filter((entry) => typeof entry !== "boolean");
        const toggleBoolean = (literal: boolean, checked: boolean) =>
        {
            const remaining = entries.filter((entry) => entry !== literal);
            onChange(checked ? [...remaining, literal] : remaining);
        };
        return <div role="group" aria-labelledby={`${baseId}.value.label`} className="space-y-1.5 rounded-md border p-2">
            <label htmlFor={`${baseId}.value.true`} className="flex items-center gap-2 text-xs">
                <input
                    id={`${baseId}.value.true`}
                    type="checkbox"
                    className="size-4 rounded border"
                    disabled={disabled}
                    checked={entries.includes(true)}
                    onChange={(event) => toggleBoolean(true, event.target.checked)}
                />
                Yes (true)
            </label>
            <label htmlFor={`${baseId}.value.false`} className="flex items-center gap-2 text-xs">
                <input
                    id={`${baseId}.value.false`}
                    type="checkbox"
                    className="size-4 rounded border"
                    disabled={disabled}
                    checked={entries.includes(false)}
                    onChange={(event) => toggleBoolean(false, event.target.checked)}
                />
                No (false)
            </label>
            {invalidEntries.map((entry, invalidIndex) => <div key={`invalid-${invalidIndex}`} className="flex items-center justify-between gap-2 text-xs text-destructive">
                <span>{String(entry)} (incompatible)</span>
                <ActionButton
                    type="button"
                    size="small"
                    variant="danger"
                    disabled={disabled}
                    onClick={() => onChange(entries.filter((item) => item !== entry))}
                >
                    Remove
                </ActionButton>
            </div>)}
        </div>;
    }

    if (target?.kind === "SELECT")
    {
        const options = target.constraints?.options ?? [];
        const optionValues = new Set(options.map((option) => option.value));
        const unknownEntries = entries.filter((entry) => typeof entry !== "string" || !optionValues.has(entry));
        const toggleOption = (optionValue: string, checked: boolean) =>
        {
            const remaining = entries.filter((entry) => entry !== optionValue);
            onChange(checked ? [...remaining, optionValue] : remaining);
        };
        return <div role="group" aria-labelledby={`${baseId}.value.label`} className="space-y-1.5 rounded-md border p-2">
            {options.length === 0 ? <p className="text-xs text-muted-foreground">No options defined.</p> : options.map((option, optionIndex) => (
                <label key={option.value} htmlFor={`${baseId}.value.opt.${optionIndex}`} className="flex items-center gap-2 text-xs">
                    <input
                        id={`${baseId}.value.opt.${optionIndex}`}
                        type="checkbox"
                        className="size-4 rounded border"
                        disabled={disabled}
                        checked={entries.includes(option.value)}
                        onChange={(event) => toggleOption(option.value, event.target.checked)}
                    />
                    {option.label.en || option.value}
                </label>
            ))}
            {unknownEntries.map((entry, unknownIndex) => <div key={`unknown-${unknownIndex}`} className="flex items-center justify-between gap-2 text-xs text-destructive">
                <span>{String(entry)} (unknown option)</span>
                <ActionButton
                    type="button"
                    size="small"
                    variant="danger"
                    disabled={disabled}
                    onClick={() => onChange(entries.filter((item) => item !== entry))}
                >
                    Remove
                </ActionButton>
            </div>)}
        </div>;
    }

    const rows = entries.length > 0 ? entries : [""];
    return <div className="space-y-1.5">
        {rows.map((entry, valueIndex) => <div key={valueIndex} className="flex items-center gap-1.5">
            <Input
                id={valueIndex === 0 ? `${baseId}.value` : `${baseId}.value.${valueIndex}`}
                aria-label={valueIndex === 0 ? undefined : `${title} ${group} rule ${index + 1} value ${valueIndex + 1}`}
                disabled={disabled}
                type={target?.kind === "DATE" ? "date" : "text"}
                inputMode={target?.kind === "DECIMAL" ? "decimal" : undefined}
                value={typeof entry === "string" ? entry : String(entry)}
                onChange={(event) => onChange(rows.map((item, idx) => idx === valueIndex ? event.target.value : item))}
            />
            {typeof entry !== "string" && <span className="shrink-0 text-xs text-destructive">(incompatible)</span>}
            <ActionButton
                type="button"
                variant="danger"
                size="small"
                disabled={disabled || (rows.length <= 1 && typeof entry === "string")}
                aria-label={`Remove ${title} ${group} rule ${index + 1} value ${valueIndex + 1}`}
                onClick={() => onChange(rows.filter((_, idx) => idx !== valueIndex))}
            >
                <Trash2 aria-hidden="true" className="size-3.5" />
            </ActionButton>
        </div>)}
        <ActionButton
            type="button"
            size="small"
            disabled={disabled || rows.length >= 20}
            onClick={() => onChange([...rows, ""])}
        >
            <Plus aria-hidden="true" className="size-3.5" />Add value
        </ActionButton>
    </div>;
}

export interface IConditionBuilderProps
{
    idPrefix: string;
    title: string;
    condition: Condition | undefined;
    availableFields: RequestField[];
    disabled?: boolean;
    onChange(next: Condition | undefined): void;
}

export function ConditionBuilder({ idPrefix, title, condition, availableFields, disabled = false, onChange }: IConditionBuilderProps)
{
    const allAtoms = condition?.all ?? [];
    const anyAtoms = condition?.any ?? [];
    const totalAtoms = allAtoms.length + anyAtoms.length;
    const canAdd = !disabled && availableFields.length > 0 && totalAtoms < 16;

    function updateGroup(group: ConditionGroup, atoms: ConditionAtom[]): void
    {
        const nextAll = group === "all" ? atoms : allAtoms;
        const nextAny = group === "any" ? atoms : anyAtoms;
        if (!nextAll.length && !nextAny.length)
        {
            onChange(undefined);
            return;
        }
        onChange({
            ...(nextAll.length ? { all: nextAll } : {}),
            ...(nextAny.length ? { any: nextAny } : {}),
        });
    }

    function addAtom(group: ConditionGroup): void
    {
        if (!availableFields.length || totalAtoms >= 16) return;
        const existing = group === "all" ? allAtoms : anyAtoms;
        updateGroup(group, [...existing, defaultAtom(availableFields[0]!)]);
    }

    function updateAtom(group: ConditionGroup, index: number, nextAtom: ConditionAtom): void
    {
        const existing = group === "all" ? allAtoms : anyAtoms;
        updateGroup(group, existing.map((atom, atomIndex) => atomIndex === index ? nextAtom : atom));
    }

    function removeAtom(group: ConditionGroup, index: number): void
    {
        const existing = group === "all" ? allAtoms : anyAtoms;
        updateGroup(group, existing.filter((_, atomIndex) => atomIndex !== index));
    }

    function renderGroup(group: ConditionGroup, heading: string, atoms: ConditionAtom[])
    {
        return <div className="space-y-2 rounded-md border bg-muted/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">{heading}</p>
                <ActionButton type="button" size="small" disabled={!canAdd} onClick={() => addAtom(group)}>
                    <Plus aria-hidden="true" className="size-3.5" />{group === "all" ? "Add AND rule" : "Add OR rule"}
                </ActionButton>
            </div>
            {atoms.length === 0 ? <p className="text-xs text-muted-foreground">No rules in this group.</p> : <div className="space-y-2">
                {atoms.map((atom, index) =>
                {
                    const target = availableFields.find((field) => field.key === atom.fieldKey);
                    const allowedOperators = operatorsForKind(target?.kind);
                    const baseId = `${idPrefix}.${group}.${index}`;
                    return <div key={index} className="grid gap-2 rounded-md border bg-background p-2.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-end">
                        <div className="grid gap-1">
                            <label htmlFor={`${baseId}.field`} className="text-xs font-medium text-muted-foreground">Target field</label>
                            <select
                                id={`${baseId}.field`}
                                className={fieldClassName}
                                disabled={disabled}
                                value={atom.fieldKey}
                                onChange={(event) =>
                                {
                                    const nextTarget = availableFields.find((field) => field.key === event.target.value);
                                    if (!nextTarget) return;
                                    updateAtom(group, index, defaultAtom(nextTarget));
                                }}
                            >
                                {!target && <option value={atom.fieldKey}>{atom.fieldKey} (unknown)</option>}
                                {availableFields.map((field) => <option key={field.key} value={field.key}>{field.label.en || field.key} ({field.key})</option>)}
                            </select>
                        </div>
                        <div className="grid gap-1">
                            <label htmlFor={`${baseId}.operator`} className="text-xs font-medium text-muted-foreground">Operator</label>
                            <select
                                id={`${baseId}.operator`}
                                className={fieldClassName}
                                disabled={disabled}
                                value={atom.operator}
                                onChange={(event) =>
                                {
                                    const operator = event.target.value as ConditionAtom["operator"];
                                    if (operator === "PRESENT")
                                    {
                                        updateAtom(group, index, { fieldKey: atom.fieldKey, operator });
                                        return;
                                    }
                                    if (operator === "IN")
                                    {
                                        const initial = Array.isArray(atom.value)
                                            ? atom.value
                                            : atom.value !== undefined && atom.value !== ""
                                                ? [atom.value]
                                                : target?.kind === "SELECT" && target.constraints?.options?.[0]
                                                    ? [target.constraints.options[0].value]
                                                    : [defaultScalarValue(target)];
                                        updateAtom(group, index, { fieldKey: atom.fieldKey, operator, value: initial });
                                        return;
                                    }
                                    const scalar = Array.isArray(atom.value) || atom.value === undefined ? defaultScalarValue(target) : atom.value;
                                    updateAtom(group, index, { fieldKey: atom.fieldKey, operator, value: scalar });
                                }}
                            >
                                {!allowedOperators.includes(atom.operator) && <option value={atom.operator}>{atom.operator} (incompatible)</option>}
                                {allowedOperators.map((op) => <option key={op} value={op}>{op}</option>)}
                            </select>
                        </div>
                        <div className="grid gap-1">
                            {atom.operator === "PRESENT" ? (
                                <span className="text-xs font-medium text-muted-foreground">Value</span>
                            ) : atom.operator === "IN" && (target?.kind === "BOOLEAN" || target?.kind === "SELECT") ? (
                                <span id={`${baseId}.value.label`} className="text-xs font-medium text-muted-foreground">Values</span>
                            ) : (
                                <label htmlFor={`${baseId}.value`} className="text-xs font-medium text-muted-foreground">Value</label>
                            )}
                            {atom.operator === "PRESENT" ? (
                                <p id={`${baseId}.value`} className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">Checks non-empty value (false counts as present)</p>
                            ) : atom.operator === "IN" ? (
                                <InValueControl
                                    baseId={baseId}
                                    title={title}
                                    group={group}
                                    index={index}
                                    target={target}
                                    value={atom.value}
                                    disabled={disabled}
                                    onChange={(values) => updateAtom(group, index, { ...atom, value: values })}
                                />
                            ) : target?.kind === "BOOLEAN" ? (
                                <select
                                    id={`${baseId}.value`}
                                    className={fieldClassName}
                                    disabled={disabled}
                                    value={typeof atom.value === "boolean" ? String(atom.value) : ""}
                                    onChange={(event) =>
                                    {
                                        if (event.target.value === "") return;
                                        updateAtom(group, index, { ...atom, value: event.target.value === "true" });
                                    }}
                                >
                                    {typeof atom.value !== "boolean" && <option value="">Incompatible value</option>}
                                    <option value="true">Yes (true)</option>
                                    <option value="false">No (false)</option>
                                </select>
                            ) : target?.kind === "SELECT" ? (
                                <select
                                    id={`${baseId}.value`}
                                    className={fieldClassName}
                                    disabled={disabled}
                                    value={typeof atom.value === "string" ? atom.value : ""}
                                    onChange={(event) => updateAtom(group, index, { ...atom, value: event.target.value })}
                                >
                                    <option value="">Choose option</option>
                                    {typeof atom.value === "string" && atom.value !== "" && !(target.constraints?.options ?? []).some((option) => option.value === atom.value) && (
                                        <option value={atom.value}>{atom.value} (unknown option)</option>
                                    )}
                                    {(target.constraints?.options ?? []).map((option) => <option key={option.value} value={option.value}>{option.label.en || option.value}</option>)}
                                </select>
                            ) : (
                                <Input
                                    id={`${baseId}.value`}
                                    disabled={disabled}
                                    type={target?.kind === "DATE" ? "date" : "text"}
                                    inputMode={target?.kind === "DECIMAL" ? "decimal" : undefined}
                                    value={typeof atom.value === "string" ? atom.value : ""}
                                    onChange={(event) => updateAtom(group, index, { ...atom, value: event.target.value })}
                                />
                            )}
                        </div>
                        <ActionButton
                            type="button"
                            variant="danger"
                            size="small"
                            disabled={disabled}
                            aria-label={`Remove ${title} ${group} rule ${index + 1}`}
                            onClick={() => removeAtom(group, index)}
                        >
                            <Trash2 aria-hidden="true" className="size-3.5" />
                        </ActionButton>
                    </div>;
                })}
            </div>}
        </div>;
    }

    return <fieldset className="space-y-3 rounded-lg border p-3.5">
        <legend className="px-1 text-sm font-medium">{title}</legend>
        {availableFields.length === 0 ? <p className="text-xs text-muted-foreground">Add another field to reference it in rules.</p> : <>
            <p className="text-xs text-muted-foreground">When both groups have rules, both groups must match (AND). Maximum 16 rules per condition.</p>
            {renderGroup("all", "All conditions (AND)", allAtoms)}
            {renderGroup("any", "Any condition (OR)", anyAtoms)}
        </>}
    </fieldset>;
}
