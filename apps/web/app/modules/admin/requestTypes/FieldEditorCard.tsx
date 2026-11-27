import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import type { IFieldIssue, RequestField } from "@workflow/contracts";
import { ActionButton } from "~/components/actions/ActionButton";
import { fieldClassName } from "~/components/forms/FieldRenderer";
import { Input } from "~/components/ui/input";
import { ConditionBuilder } from "./ConditionBuilder";

const fieldKinds: RequestField["kind"][] = ["TEXT", "TEXTAREA", "DECIMAL", "DATE", "SELECT", "BOOLEAN"];

export interface IFieldEditorCardProps
{
    field: RequestField;
    index: number;
    totalFields: number;
    otherFields: RequestField[];
    disabled: boolean;
    issues: IFieldIssue[];
    onChange(next: RequestField): void;
    onMoveUp(): void;
    onMoveDown(): void;
    onRemove(): void;
}

export function FieldEditorCard({ field, index, totalFields, otherFields, disabled, issues, onChange, onMoveUp, onMoveDown, onRemove }: IFieldEditorCardProps)
{
    const [expanded, setExpanded] = useState(true);
    const prefix = `fields[${index}]`;
    const fieldIssues = issues.filter((issue) => issue.field === prefix || issue.field.startsWith(`${prefix}.`));
    const errorFor = (path: string) => fieldIssues.find((issue) => issue.field === `${prefix}.${path}`)?.message;

    function updateKind(kind: RequestField["kind"]): void
    {
        const nextConstraints = kind === "SELECT"
            ? { options: [{ value: "OPTION_1", label: { en: "Option 1" } }] }
            : undefined;
        onChange({
            ...field,
            kind,
            defaultValue: undefined,
            constraints: nextConstraints,
        });
    }

    const options = field.constraints?.options ?? [];

    return <section aria-label={`Field ${index + 1}: ${field.label.en || field.key}`} className="space-y-4 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold">{index + 1}. {field.label.en || "Untitled field"} <span className="font-normal text-muted-foreground">({field.key || "unset"} · {field.kind}{field.required ? " · Required" : ""})</span></p>
                {fieldIssues.length > 0 && <p className="text-xs text-destructive">{fieldIssues.length} validation issue(s)</p>}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
                <ActionButton type="button" size="small" disabled={disabled || index === 0} aria-label={`Move ${field.label.en || field.key} up`} onClick={onMoveUp}>
                    <ArrowUp aria-hidden="true" className="size-3.5" />Up
                </ActionButton>
                <ActionButton type="button" size="small" disabled={disabled || index === totalFields - 1} aria-label={`Move ${field.label.en || field.key} down`} onClick={onMoveDown}>
                    <ArrowDown aria-hidden="true" className="size-3.5" />Down
                </ActionButton>
                <ActionButton type="button" size="small" variant="ghost" aria-expanded={expanded} onClick={() => setExpanded((current) => !current)}>
                    {expanded ? <ChevronUp aria-hidden="true" className="size-3.5" /> : <ChevronDown aria-hidden="true" className="size-3.5" />}
                    {expanded ? "Collapse" : "Edit"}
                </ActionButton>
                <ActionButton type="button" size="small" variant="danger" disabled={disabled} aria-label={`Remove ${field.label.en || field.key}`} onClick={onRemove}>
                    <Trash2 aria-hidden="true" className="size-3.5" />Remove
                </ActionButton>
            </div>
        </div>

        {expanded && <div className="space-y-4 border-t pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                    <label htmlFor={`${prefix}.key`} className="text-sm font-medium">Field key (required)</label>
                    <Input
                        id={`${prefix}.key`}
                        disabled={disabled}
                        value={field.key}
                        aria-invalid={!!errorFor("key")}
                        onChange={(event) => onChange({ ...field, key: event.target.value })}
                    />
                    {errorFor("key") && <p className="text-xs text-destructive">{errorFor("key")}</p>}
                </div>
                <div className="grid gap-1.5">
                    <label htmlFor={`${prefix}.kind`} className="text-sm font-medium">Field type</label>
                    <select id={`${prefix}.kind`} className={fieldClassName} disabled={disabled} value={field.kind} onChange={(event) => updateKind(event.target.value as RequestField["kind"])}>
                        {fieldKinds.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                    </select>
                </div>
                <div className="grid gap-1.5">
                    <label htmlFor={`${prefix}.label.en`} className="text-sm font-medium">English label (required)</label>
                    <Input
                        id={`${prefix}.label.en`}
                        disabled={disabled}
                        value={field.label.en}
                        aria-invalid={!!errorFor("label.en")}
                        onChange={(event) => onChange({ ...field, label: { ...field.label, en: event.target.value } })}
                    />
                    {errorFor("label.en") && <p className="text-xs text-destructive">{errorFor("label.en")}</p>}
                </div>
                <div className="grid gap-1.5">
                    <label htmlFor={`${prefix}.label.th`} className="text-sm font-medium">Thai label (optional)</label>
                    <Input
                        id={`${prefix}.label.th`}
                        disabled={disabled}
                        value={field.label.th ?? ""}
                        onChange={(event) =>
                        {
                            const th = event.target.value;
                            onChange({ ...field, label: th ? { en: field.label.en, th } : { en: field.label.en } });
                        }}
                    />
                </div>
                <div className="grid gap-1.5">
                    <label htmlFor={`${prefix}.description.en`} className="text-sm font-medium">English help text (optional)</label>
                    <Input
                        id={`${prefix}.description.en`}
                        disabled={disabled}
                        value={field.description?.en ?? ""}
                        onChange={(event) =>
                        {
                            const en = event.target.value;
                            const th = field.description?.th;
                            onChange({ ...field, description: en ? { en, ...(th ? { th } : {}) } : undefined });
                        }}
                    />
                </div>
                <div className="grid gap-1.5">
                    <label htmlFor={`${prefix}.description.th`} className="text-sm font-medium">Thai help text (optional)</label>
                    <Input
                        id={`${prefix}.description.th`}
                        disabled={disabled || !field.description?.en.trim()}
                        placeholder={!field.description?.en.trim() ? "Add English description first" : undefined}
                        value={field.description?.th ?? ""}
                        onChange={(event) =>
                        {
                            const th = event.target.value;
                            if (!field.description?.en.trim()) return;
                            onChange({ ...field, description: th ? { en: field.description.en, th } : { en: field.description.en } });
                        }}
                    />
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-6">
                <label className="inline-flex items-center gap-2 text-sm font-medium">
                    <input
                        type="checkbox"
                        className="size-4 rounded border"
                        disabled={disabled}
                        checked={field.required}
                        onChange={(event) => onChange({ ...field, required: event.target.checked })}
                    />
                    Required by default
                </label>
            </div>

            {(field.kind === "TEXT" || field.kind === "TEXTAREA") && <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                    <label htmlFor={`${prefix}.minLength`} className="text-sm font-medium">Min length</label>
                    <Input
                        id={`${prefix}.minLength`}
                        type="number"
                        min={0}
                        disabled={disabled}
                        value={field.constraints?.minLength ?? ""}
                        onChange={(event) =>
                        {
                            const raw = event.target.value;
                            onChange({ ...field, constraints: { ...field.constraints, minLength: raw === "" ? undefined : Number(raw) } });
                        }}
                    />
                </div>
                <div className="grid gap-1.5">
                    <label htmlFor={`${prefix}.maxLength`} className="text-sm font-medium">Max length</label>
                    <Input
                        id={`${prefix}.maxLength`}
                        type="number"
                        min={0}
                        disabled={disabled}
                        value={field.constraints?.maxLength ?? ""}
                        onChange={(event) =>
                        {
                            const raw = event.target.value;
                            onChange({ ...field, constraints: { ...field.constraints, maxLength: raw === "" ? undefined : Number(raw) } });
                        }}
                    />
                </div>
            </div>}

            {(field.kind === "DECIMAL" || field.kind === "DATE") && <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                    <label htmlFor={`${prefix}.min`} className="text-sm font-medium">{field.kind === "DATE" ? "Minimum date" : "Minimum value"}</label>
                    <Input
                        id={`${prefix}.min`}
                        type={field.kind === "DATE" ? "date" : "text"}
                        inputMode={field.kind === "DECIMAL" ? "decimal" : undefined}
                        disabled={disabled}
                        value={field.constraints?.min ?? ""}
                        onChange={(event) => onChange({ ...field, constraints: { ...field.constraints, min: event.target.value || undefined } })}
                    />
                </div>
                <div className="grid gap-1.5">
                    <label htmlFor={`${prefix}.max`} className="text-sm font-medium">{field.kind === "DATE" ? "Maximum date" : "Maximum value"}</label>
                    <Input
                        id={`${prefix}.max`}
                        type={field.kind === "DATE" ? "date" : "text"}
                        inputMode={field.kind === "DECIMAL" ? "decimal" : undefined}
                        disabled={disabled}
                        value={field.constraints?.max ?? ""}
                        onChange={(event) => onChange({ ...field, constraints: { ...field.constraints, max: event.target.value || undefined } })}
                    />
                </div>
            </div>}

            {field.kind === "SELECT" && <div className="space-y-3 rounded-lg border p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">Select options</p>
                    <ActionButton
                        type="button"
                        size="small"
                        disabled={disabled || options.length >= 20}
                        onClick={() => onChange({
                            ...field,
                            constraints: { ...field.constraints, options: [...options, { value: `OPT_${options.length + 1}`, label: { en: `Option ${options.length + 1}` } }] },
                        })}
                    >
                        <Plus aria-hidden="true" className="size-3.5" />Add option
                    </ActionButton>
                </div>
                {options.map((option, optionIndex) => <div key={optionIndex} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                    <div className="grid gap-1">
                        <label htmlFor={`${prefix}.options.${optionIndex}.value`} className="text-xs font-medium text-muted-foreground">Value</label>
                        <Input
                            id={`${prefix}.options.${optionIndex}.value`}
                            disabled={disabled}
                            value={option.value}
                            onChange={(event) =>
                            {
                                const next = options.map((row, rowIndex) => rowIndex === optionIndex ? { ...row, value: event.target.value } : row);
                                onChange({ ...field, constraints: { ...field.constraints, options: next } });
                            }}
                        />
                    </div>
                    <div className="grid gap-1">
                        <label htmlFor={`${prefix}.options.${optionIndex}.en`} className="text-xs font-medium text-muted-foreground">English label</label>
                        <Input
                            id={`${prefix}.options.${optionIndex}.en`}
                            disabled={disabled}
                            value={option.label.en}
                            onChange={(event) =>
                            {
                                const next = options.map((row, rowIndex) => rowIndex === optionIndex ? { ...row, label: { ...row.label, en: event.target.value } } : row);
                                onChange({ ...field, constraints: { ...field.constraints, options: next } });
                            }}
                        />
                    </div>
                    <div className="grid gap-1">
                        <label htmlFor={`${prefix}.options.${optionIndex}.th`} className="text-xs font-medium text-muted-foreground">Thai label</label>
                        <Input
                            id={`${prefix}.options.${optionIndex}.th`}
                            disabled={disabled}
                            value={option.label.th ?? ""}
                            onChange={(event) =>
                            {
                                const th = event.target.value;
                                const next = options.map((row, rowIndex) => rowIndex === optionIndex ? { ...row, label: th ? { en: row.label.en, th } : { en: row.label.en } } : row);
                                onChange({ ...field, constraints: { ...field.constraints, options: next } });
                            }}
                        />
                    </div>
                    <ActionButton
                        type="button"
                        size="small"
                        variant="danger"
                        disabled={disabled || options.length <= 1}
                        aria-label={`Remove option ${optionIndex + 1} from ${field.label.en || field.key}`}
                        onClick={() => onChange({ ...field, constraints: { ...field.constraints, options: options.filter((_, rowIndex) => rowIndex !== optionIndex) } })}
                    >
                        <Trash2 aria-hidden="true" className="size-3.5" />
                    </ActionButton>
                </div>)}
            </div>}

            <div className="grid gap-1.5 sm:max-w-sm">
                <label htmlFor={`${prefix}.defaultValue`} className="text-sm font-medium">Default value (optional)</label>
                {field.kind === "BOOLEAN" ? (
                    <select
                        id={`${prefix}.defaultValue`}
                        className={fieldClassName}
                        disabled={disabled}
                        value={typeof field.defaultValue === "boolean" ? String(field.defaultValue) : ""}
                        onChange={(event) => onChange({ ...field, defaultValue: event.target.value === "" ? undefined : event.target.value === "true" })}
                    >
                        <option value="">None</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                    </select>
                ) : field.kind === "SELECT" ? (
                    <select
                        id={`${prefix}.defaultValue`}
                        className={fieldClassName}
                        disabled={disabled}
                        value={typeof field.defaultValue === "string" ? field.defaultValue : ""}
                        onChange={(event) => onChange({ ...field, defaultValue: event.target.value || undefined })}
                    >
                        <option value="">None</option>
                        {options.map((option) => <option key={option.value} value={option.value}>{option.label.en || option.value}</option>)}
                    </select>
                ) : (
                    <Input
                        id={`${prefix}.defaultValue`}
                        type={field.kind === "DATE" ? "date" : "text"}
                        inputMode={field.kind === "DECIMAL" ? "decimal" : undefined}
                        disabled={disabled}
                        value={typeof field.defaultValue === "string" ? field.defaultValue : ""}
                        onChange={(event) => onChange({ ...field, defaultValue: event.target.value || undefined })}
                    />
                )}
            </div>

            <ConditionBuilder
                idPrefix={`${prefix}.visibleWhen`}
                title="Visible when"
                condition={field.visibleWhen}
                availableFields={otherFields}
                disabled={disabled}
                onChange={(visibleWhen) => onChange({ ...field, visibleWhen })}
            />
            <ConditionBuilder
                idPrefix={`${prefix}.requiredWhen`}
                title="Required when"
                condition={field.requiredWhen}
                availableFields={otherFields}
                disabled={disabled}
                onChange={(requiredWhen) => onChange({ ...field, requiredWhen })}
            />

            {fieldIssues.length > 0 && <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                {fieldIssues.map((issue, issueIndex) => <li key={`${issue.field}-${issueIndex}`}>{issue.field}: {issue.message}</li>)}
            </ul>}
        </div>}
    </section>;
}
