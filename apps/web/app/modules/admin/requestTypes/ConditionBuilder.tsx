import { useEffect, useRef, useState } from "react";
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

interface IInValueInputProps
{
    id: string;
    target: RequestField | undefined;
    value: ConditionAtom["value"];
    disabled: boolean;
    onChange(next: (string | boolean)[]): void;
}

function formatInValue(value: ConditionAtom["value"]): string
{
    return Array.isArray(value) ? value.map(String).join(", ") : "";
}

function InValueInput({ id, target, value, disabled, onChange }: IInValueInputProps)
{
    const [text, setText] = useState(() => formatInValue(value));
    const lastEmitted = useRef(JSON.stringify(value));

    useEffect(() =>
    {
        const serialized = JSON.stringify(value);
        if (serialized !== lastEmitted.current)
        {
            lastEmitted.current = serialized;
            setText(formatInValue(value));
        }
    }, [value]);

    return <Input
        id={id}
        disabled={disabled}
        placeholder={target?.kind === "BOOLEAN" ? "true, false" : "Comma-separated values"}
        value={text}
        onChange={(event) =>
        {
            const raw = event.target.value;
            setText(raw);
            const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
            const values: (string | boolean)[] = target?.kind === "BOOLEAN"
                ? parts.map((part) => part === "true" ? true : part === "false" ? false : part)
                : parts;
            lastEmitted.current = JSON.stringify(values);
            onChange(values);
        }}
    />;
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
                            <label htmlFor={`${baseId}.value`} className="text-xs font-medium text-muted-foreground">Value</label>
                            {atom.operator === "PRESENT" ? (
                                <p id={`${baseId}.value`} className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">Checks non-empty value (false counts as present)</p>
                            ) : atom.operator === "IN" ? (
                                <InValueInput
                                    id={`${baseId}.value`}
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
