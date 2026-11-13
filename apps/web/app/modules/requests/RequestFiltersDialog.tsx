import { useId, useRef, useState } from "react";
import { prioritySchema, requestStatusSchema } from "@workflow/contracts";
import { CollectionDialog } from "~/components/collections/CollectionDialog";
import { ActionButton } from "~/components/actions/ActionButton";
import { fieldClassName } from "~/components/forms/FieldRenderer";
import { Input } from "~/components/ui/input";
import { cn } from "~/lib/utils";
import { buildRequestQuery, emptyRequestFilters, requestDateRanges, writeRequestFilters, type IRequestFilterFailure, type RequestFilters } from "./requestListQuery";
import { requestPriorityLabel, requestStatusLabel } from "./requestPresentation";
import { RequestTypeFilter } from "./RequestTypeFilter";
import type { RequestTypeSelection } from "./useRequestTypeSelection";

interface IRequestFiltersDialogProps
{
    filters: RequestFilters;
    generation: number;
    selectedType?: RequestTypeSelection;
    onResolveType(type: RequestTypeSelection): void;
    onApply(filters: RequestFilters): void;
    onClose(): void;
}

const controlClass = `${fieldClassName} min-h-11 min-w-0 text-foreground aria-invalid:border-destructive dark:scheme-dark`;
export function RequestFiltersDialog({ filters, generation, selectedType, onResolveType, onApply, onClose }: IRequestFiltersDialogProps)
{
    const id = useId();
    const form = useRef<HTMLFormElement>(null);
    const [draft, setDraft] = useState({ ...filters });
    const [failure, setFailure] = useState<IRequestFilterFailure | null>(null);
    const [selection, setSelection] = useState(selectedType);
    function update(key: keyof RequestFilters, value: string)
    {
        setDraft((current) => ({ ...current, [key]: value }));
        setFailure(null);
    }
    function inputProps(key: keyof RequestFilters)
    {
        return {
            id: `${id}-${key}`, name: key, className: controlClass,
            "aria-invalid": failure?.fields?.includes(key) || undefined,
            "aria-describedby": failure?.fields?.includes(key) ? `${id}-error` : undefined,
        };
    }
    function renderError(keys: readonly (keyof RequestFilters)[])
    {
        const first = failure?.fields?.[0];
        if (!failure || !first || !keys.includes(first)) return null;
        return <p id={`${id}-error`} role="alert" className="col-span-full rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{failure.error}</p>;
    }
    return <CollectionDialog title="Advanced filters" description="Match all selected conditions. Changes apply when you choose Apply filters." onClose={onClose}>
        <form ref={form} noValidate onSubmit={(event) =>
        {
            event.preventDefault();
            const result = buildRequestQuery(writeRequestFilters(new URLSearchParams(), draft));
            if (result.error)
            {
                setFailure(result);
                requestAnimationFrame(() =>
                {
                    const control = form.current?.querySelector<HTMLElement>("[aria-invalid='true']");
                    control?.focus();
                    control?.scrollIntoView?.({ block: "center" });
                });
                return;
            }
            const appliedType = selection?.id === draft.typeId ? selection : selectedType?.id === draft.typeId ? selectedType : undefined;
            if (appliedType) onResolveType(appliedType);
            onApply(draft);
        }}>
            <div className="space-y-5 p-4 sm:p-6">
                <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2">
                    <legend className="mb-4 text-sm font-semibold">Request details</legend>
                    <fieldset className="min-w-0 space-y-2"><legend className="mb-2 text-xs font-medium text-muted-foreground">Status</legend><div className="flex min-w-0 gap-2"><select {...inputProps("statusCondition")} aria-label="Status condition" className={cn(controlClass, "w-24 shrink-0")} value={draft.statusCondition} onChange={(event) => update("statusCondition", event.target.value)}><option value="EQUAL">Is</option><option value="NOTEQUAL">Is not</option></select><select {...inputProps("status")} aria-label="Status" className={`${controlClass} min-w-0`} value={draft.status} onChange={(event) => update("status", event.target.value)}><option value="">All statuses</option>{requestStatusSchema.options.map((value) => <option key={value} value={value}>{requestStatusLabel(value)}</option>)}</select></div></fieldset>
                    <div className="grid content-start gap-2 text-xs font-medium text-muted-foreground"><label htmlFor={`${id}-priority`}>Priority</label><select {...inputProps("priority")} value={draft.priority} onChange={(event) => update("priority", event.target.value)}><option value="">All priorities</option>{prioritySchema.options.map((value) => <option key={value} value={value}>{requestPriorityLabel(value)}</option>)}</select></div>
                    <RequestTypeFilter value={draft.typeId} generation={generation} selectedType={selection?.id === draft.typeId ? selection : selectedType} onResolve={(type) => setSelection(type)} onChange={(value) => update("typeId", value)} invalid={failure?.fields?.includes("typeId")} describedBy={failure?.fields?.includes("typeId") ? `${id}-error` : undefined} />
                    <div className="grid content-start gap-2 text-xs font-medium text-muted-foreground"><label htmlFor={`${id}-submitted`}>Submission</label><select {...inputProps("submitted")} value={draft.submitted} onChange={(event) => update("submitted", event.target.value)}><option value="">Any submission state</option><option value="yes">Submitted</option><option value="no">Not submitted</option></select></div>
                    {renderError(["status", "statusCondition", "priority", "typeId", "submitted"])}
                </fieldset>
                <fieldset className="min-w-0 space-y-3 border-t pt-2">
                    <legend className="mb-2 text-sm font-semibold">Dates <span className="ml-1 text-xs font-normal text-muted-foreground">Bangkok time · inclusive days</span></legend>
                    <div className="hidden grid-cols-[5rem_1fr_1fr] gap-3 text-xs text-muted-foreground sm:grid"><span /><span>From</span><span>Through</span></div>
                    {requestDateRanges.map(([, label, from, to]) => <div role="group" aria-label={`${label} date range`} key={from} className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[5rem_1fr_1fr]">
                        <span className="text-sm">{label}</span>
                        <label className="grid min-w-0 gap-1"><span className="text-xs text-muted-foreground sm:sr-only">{label} from</span><Input {...inputProps(from)} type="date" value={draft[from]} onChange={(event) => update(from, event.target.value)} /></label>
                        <label className="grid min-w-0 gap-1"><span className="text-xs text-muted-foreground sm:sr-only">{label} through</span><Input {...inputProps(to)} type="date" value={draft[to]} onChange={(event) => update(to, event.target.value)} /></label>
                        {renderError([from, to])}
                    </div>)}
                </fieldset>
                <fieldset className="min-w-0 border-t pt-2">
                    <legend className="mb-2 text-sm font-semibold">Specific text</legend>
                    <div className="grid gap-4 sm:grid-cols-2">
                    {([["Request number", "number", "numberCondition", 100], ["Title", "title", "titleCondition", 200]] as const).map(([label, key, condition, max]) => <fieldset key={key} className="min-w-0 space-y-2"><legend className="mb-2 text-xs font-medium text-muted-foreground">{label}</legend><select {...inputProps(condition)} aria-label={`${label} condition`} value={draft[condition]} onChange={(event) => update(condition, event.target.value)}><option value="CONTAINS">Contains</option><option value="EQUAL">Equals</option><option value="STARTWITH">Starts with</option></select><Input {...inputProps(key)} aria-label={label} value={draft[key]} maxLength={max} onChange={(event) => update(key, event.target.value)} placeholder={`${label}…`} /></fieldset>)}
                    {renderError(["number", "numberCondition", "title", "titleCondition"])}
                    </div>
                </fieldset>
                {failure && !failure.fields?.length && <p id={`${id}-error`} role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{failure.error}</p>}
            </div>
            <div className="sticky bottom-0 grid grid-cols-2 gap-2 border-t bg-background p-4 sm:flex sm:items-center sm:px-6"><ActionButton variant="ghost" type="button" className="col-span-2 justify-self-start sm:mr-auto" onClick={() =>
            {
                setDraft({ ...emptyRequestFilters });
                setFailure(null);
            }}>Reset filters</ActionButton><ActionButton type="button" onClick={onClose}>Cancel</ActionButton><ActionButton variant="primary" type="submit">Apply filters</ActionButton></div>
        </form>
    </CollectionDialog>;
}
