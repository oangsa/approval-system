import { resolveLocalizedText, type RequestField } from "@workflow/contracts";
import { Input } from "~/components/ui/input";

export const fieldClassName = "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors motion-reduce:transition-none";
export interface IFieldRendererProps
{
    field: RequestField;
    value: unknown;
    onChange(value: unknown): void;
    error?: string;
    locale?: "en" | "th";
    idPrefix?: string;
}
export function FieldRenderer({ field, value, onChange, error, locale = "en", idPrefix = "fields" }: IFieldRendererProps)
{
    const id = `${idPrefix}.${field.key}`;
    const labelText = resolveLocalizedText(field.label, locale);
    const descriptionText = resolveLocalizedText(field.description, locale);
    const props = { id, name: id, required: field.required, "aria-invalid": !!error, "aria-describedby": `${id}.help ${id}.error`, className: fieldClassName };
    return <div className="space-y-2">
        <label htmlFor={id} className="block text-sm font-medium">{labelText}{field.required && " (required)"}</label>
        {field.kind === "SELECT" ? <select {...props} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}><option value="">Choose an option</option>{field.constraints?.options?.map((option) => <option key={option.value} value={option.value}>{resolveLocalizedText(option.label, locale)}</option>)}</select>
            : field.kind === "TEXTAREA" ? <textarea {...props} rows={4} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />
                : field.kind === "BOOLEAN" ? <select {...props} value={typeof value === "boolean" ? String(value) : ""} onChange={(event) => onChange(event.target.value === "" ? undefined : event.target.value === "true")}><option value="">Choose an option</option><option value="true">Yes</option><option value="false">No</option></select>
                    : <Input {...props} type={field.kind === "DATE" ? "date" : "text"} inputMode={field.kind === "DECIMAL" ? "decimal" : undefined} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />}
        <p id={`${id}.help`} className="text-sm text-muted-foreground">{descriptionText}</p>
        <p id={`${id}.error`} className="text-sm text-destructive">{error}</p>
    </div>;
}
