import { useEffect, useState } from "react";
import {
    applicableFields,
    createFieldRecord,
    getFieldValue,
    hasOwnField,
    isPresent,
    resolveLocalizedText,
    setFieldValue,
    validateFields,
    validateRequestTypeDefinition,
    type IFieldIssue,
    type PublishedRequestType,
    type RequestTypeDraftContent,
} from "@workflow/contracts";
import { ActionButton } from "~/components/actions/ActionButton";
import { FieldRenderer, fieldClassName } from "~/components/forms/FieldRenderer";
import { LineItemsEditor, type IEditableLineItem } from "~/components/forms/LineItemsEditor";
import { Input } from "~/components/ui/input";

export interface IRequestTypePreviewProps
{
    code: string;
    definition: RequestTypeDraftContent;
}

export function RequestTypePreview({ code, definition }: IRequestTypePreviewProps)
{
    const [locale, setLocale] = useState<"en" | "th">("en");
    const [values, setValues] = useState<Record<string, unknown>>(() => createFieldRecord());
    const [lineItems, setLineItems] = useState<IEditableLineItem[]>([]);
    const [monetaryAmount, setMonetaryAmount] = useState("");
    const [previewIssues, setPreviewIssues] = useState<IFieldIssue[]>([]);
    const [validated, setValidated] = useState(false);

    useEffect(() =>
    {
        setValues((current) =>
        {
            const next = createFieldRecord(current);
            for (const field of definition.fields)
            {
                if (!hasOwnField(next, field.key) && field.defaultValue !== undefined) next[field.key] = field.defaultValue;
            }
            return next;
        });
    }, [definition.fields]);

    const definitionIssues = validateRequestTypeDefinition(definition);
    const previewDefinition: PublishedRequestType = {
        id: "00000000-0000-4000-8000-000000000000",
        code: code || "PREVIEW",
        name: definition.name.en ? definition.name : { en: "Untitled type" },
        ...(definition.description?.en ? { description: definition.description } : {}),
        versionId: "00000000-0000-4000-8000-000000000001",
        versionNumber: 1,
        isEnabled: true,
        monetary: definition.monetary,
        supportsLineItems: definition.supportsLineItems,
        fields: definition.fields,
        publishedAt: "2026-11-25T00:00:00.000Z",
    };

    const visibleFields = definitionIssues.length === 0 ? applicableFields(definition.fields, values) : [];
    const effectiveKeys = visibleFields.filter((field) => isPresent(getFieldValue(values, field.key))).map((field) => field.key);
    const omittedKeys = Object.keys(values).filter((key) => isPresent(getFieldValue(values, key)) && !visibleFields.some((field) => field.key === key));

    function runPreviewValidation(): void
    {
        if (definitionIssues.length > 0) return;
        const payloadValues = createFieldRecord(effectiveKeys.map((key) => [key, getFieldValue(values, key)] as const));
        setPreviewIssues(validateFields(previewDefinition, payloadValues, true));
        setValidated(true);
    }

    return <aside aria-label="Live form preview" className="space-y-4 rounded-xl border bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <div>
                <h2 className="text-lg font-semibold">Live form preview</h2>
                <p className="text-xs text-muted-foreground">Evaluated with the shared runtime contract used by requesters.</p>
            </div>
            <div className="flex items-center gap-2">
                <label htmlFor="preview-locale" className="text-xs font-medium text-muted-foreground">Preview language</label>
                <select id="preview-locale" className={`${fieldClassName} w-auto py-1 text-xs`} value={locale} onChange={(event) => setLocale(event.target.value as "en" | "th")}>
                    <option value="en">English</option>
                    <option value="th">Thai (English fallback)</option>
                </select>
            </div>
        </div>

        <div className="space-y-1">
            <p className="text-sm font-medium">{resolveLocalizedText(definition.name, locale) || "Untitled request type"}</p>
            {definition.description && <p className="text-xs text-muted-foreground">{resolveLocalizedText(definition.description, locale)}</p>}
        </div>

        {definitionIssues.length > 0 ? <div role="alert" className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <p className="font-medium">Fix configuration errors to run live preview:</p>
            <ul className="list-disc space-y-1 pl-4">
                {definitionIssues.map((issue, index) => <li key={`${issue.field}-${index}`}>{issue.field}: {issue.message}</li>)}
            </ul>
        </div> : <div className="space-y-4">
            {visibleFields.length === 0 ? <p className="text-sm text-muted-foreground">No fields are currently visible.</p> : visibleFields.map((field) => (
                <FieldRenderer
                    key={field.key}
                    field={field}
                    locale={locale}
                    idPrefix="preview"
                    value={getFieldValue(values, field.key)}
                    error={previewIssues.find((issue) => issue.field === `fields.${field.key}`)?.message}
                    onChange={(nextValue) =>
                    {
                        setValidated(false);
                        setPreviewIssues([]);
                        setValues((current) => setFieldValue(current, field.key, nextValue));
                    }}
                />
            ))}

            {definition.monetary && definition.supportsLineItems && <div className="border-t pt-4">
                <LineItemsEditor items={lineItems} onChange={setLineItems} errorFor={() => undefined} locale={locale} />
            </div>}
            {definition.monetary && !definition.supportsLineItems && <div className="grid gap-1.5 border-t pt-4">
                <label htmlFor="preview.monetaryAmount" className="text-sm font-medium">Amount (THB, required)</label>
                <Input id="preview.monetaryAmount" inputMode="decimal" value={monetaryAmount} onChange={(event) => setMonetaryAmount(event.target.value)} />
            </div>}

            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <ActionButton type="button" size="small" onClick={runPreviewValidation}>Validate preview</ActionButton>
                <ActionButton type="button" size="small" variant="ghost" onClick={() =>
                {
                    setValues(createFieldRecord());
                    setLineItems([]);
                    setMonetaryAmount("");
                    setPreviewIssues([]);
                    setValidated(false);
                }}>Reset preview</ActionButton>
            </div>

            {validated && previewIssues.length === 0 && <p role="status" className="text-xs font-medium text-foreground">All visible preview inputs satisfy the shared evaluator.</p>}
            <dl className="space-y-1 rounded-md bg-muted/40 p-3 text-xs">
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Submitted payload keys</dt><dd className="font-mono">{effectiveKeys.join(", ") || "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Omitted hidden keys</dt><dd className="font-mono">{omittedKeys.join(", ") || "—"}</dd></div>
            </dl>
        </div>}
    </aside>;
}
