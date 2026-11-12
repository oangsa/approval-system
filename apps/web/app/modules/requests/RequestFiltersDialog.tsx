import { useRef, useState } from "react";
import { prioritySchema, requestStatusSchema } from "@workflow/contracts";
import { CollectionDialog } from "~/components/collections/CollectionDialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { buildRequestQuery, emptyRequestFilters, writeRequestFilters, type RequestFilters } from "./requestListQuery";
import { requestPriorityLabel, requestStatusLabel } from "./requestPresentation";
import { RequestTypeFilter } from "./RequestTypeFilter";

interface IRequestFiltersDialogProps
{
    filters: RequestFilters;
    generation: number;
    onApply(filters: RequestFilters): void;
    onClose(): void;
}

const selectClass = "min-h-11 w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring";
export function RequestFiltersDialog({ filters, generation, onApply, onClose }: IRequestFiltersDialogProps)
{
    const [draft, setDraft] = useState({ ...filters });
    const [error, setError] = useState("");
    const errorRef = useRef<HTMLParagraphElement>(null);
    function update(key: keyof RequestFilters, value: string)
    {
        setDraft((current) => ({ ...current, [key]: value }));
        setError("");
    }
    return <CollectionDialog title="Advanced filters" description="Match all selected conditions. Dates use Bangkok time." onClose={onClose}>
        <form noValidate onSubmit={(event) =>
        {
            event.preventDefault();
            const result = buildRequestQuery(writeRequestFilters(new URLSearchParams(), draft));
            if (result.error)
            {
                setError(result.error);
                requestAnimationFrame(() => errorRef.current?.focus());
                return;
            }
            onApply(draft);
        }}>
            <div className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
                <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Status</legend><select aria-label="Status condition" className={selectClass} value={draft.statusCondition} onChange={(event) => update("statusCondition", event.target.value)}><option value="EQUAL">Is</option><option value="NOTEQUAL">Is not</option></select><select aria-label="Status" className={selectClass} value={draft.status} onChange={(event) => update("status", event.target.value)}><option value="">All statuses</option>{requestStatusSchema.options.map((value) => <option key={value} value={value}>{requestStatusLabel(value)}</option>)}</select></fieldset>
                <div className="grid content-start gap-2 text-sm font-medium"><label htmlFor="request-filter-priority">Priority</label><select id="request-filter-priority" className={selectClass} value={draft.priority} onChange={(event) => update("priority", event.target.value)}><option value="">All priorities</option>{prioritySchema.options.map((value) => <option key={value} value={value}>{requestPriorityLabel(value)}</option>)}</select></div>
                <RequestTypeFilter value={draft.typeId} generation={generation} onChange={(value) => update("typeId", value)} />
                {([ ["Created", "createdFrom", "createdTo"], ["Updated", "updatedFrom", "updatedTo"], ["Submitted", "submittedFrom", "submittedTo"] ] as const).map(([label, from, to]) => <fieldset key={from} className="grid gap-3 sm:col-span-2 sm:grid-cols-2"><legend className="mb-2 text-sm font-medium">{label} date range</legend><label className="grid gap-1 text-xs text-muted-foreground">{label} from<Input type="date" value={draft[from]} onChange={(event) => update(from, event.target.value)} /></label><label className="grid gap-1 text-xs text-muted-foreground">{label} through<Input type="date" value={draft[to]} onChange={(event) => update(to, event.target.value)} /></label></fieldset>)}
                <div className="grid gap-2 text-sm font-medium sm:col-span-2"><label htmlFor="request-filter-submission">Submission</label><select id="request-filter-submission" className={selectClass} value={draft.submitted} onChange={(event) => update("submitted", event.target.value)}><option value="">Any submission state</option><option value="yes">Submitted</option><option value="no">Not submitted</option></select></div>
                {([ ["Request number", "number", "numberCondition", 100], ["Title", "title", "titleCondition", 200] ] as const).map(([label, key, condition, max]) => <fieldset key={key} className="space-y-2"><legend className="mb-2 text-sm font-medium">{label}</legend><select className={selectClass} aria-label={`${label} condition`} value={draft[condition]} onChange={(event) => update(condition, event.target.value)}><option value="CONTAINS">Contains</option><option value="EQUAL">Equals</option><option value="STARTWITH">Starts with</option></select><Input aria-label={label} value={draft[key]} maxLength={max} onChange={(event) => update(key, event.target.value)} placeholder={`${label}…`} /></fieldset>)}
                {error && <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-md border border-destructive p-3 text-sm sm:col-span-2">{error}</p>}
            </div>
            <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t bg-background p-5 sm:px-6"><Button type="button" className="min-h-11 px-3 hover:bg-secondary" onClick={() =>
            {
                setDraft({ ...emptyRequestFilters });
                setError("");
            }}>Reset filters</Button><Button type="button" className="ml-auto min-h-11 border px-4 hover:bg-secondary" onClick={onClose}>Cancel</Button><Button type="submit" className="min-h-11 bg-primary px-4 text-primary-foreground hover:opacity-90">Apply filters</Button></div>
        </form>
    </CollectionDialog>;
}
