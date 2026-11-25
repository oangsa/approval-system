import { useState } from "react";
import { requestStatusSchema, type DepartmentSummary } from "@workflow/contracts";
import { CollectionDialog } from "~/components/collections/CollectionDialog";
import { ActionButton } from "~/components/actions/ActionButton";
import { fieldClassName } from "~/components/forms/FieldRenderer";
import { Input } from "~/components/ui/input";
import { RequestTypeFilter } from "~/modules/requests/RequestTypeFilter";
import { requestStatusLabel } from "~/modules/requests/requestPresentation";
import { buildReportQuery, emptyReportFilters, writeReportFilters, type ReportFilters } from "./reportQuery";

interface IReportFiltersProps { filters: ReportFilters; generation: number; department: DepartmentSummary | null; onApply(value: ReportFilters): void; onClose(): void; }
export function ReportFiltersDialog({ filters, generation, department, onApply, onClose }: IReportFiltersProps)
{
    const [draft, setDraft] = useState(filters);
    const [error, setError] = useState("");
    function update(key: keyof ReportFilters, value: string)
{
 setDraft((current) => ({ ...current, [key]: value })); setError("");
}
    const unavailable = draft.departmentId && !["ISNULL", "ISNOTNULL", department?.id].includes(draft.departmentId);
    return <CollectionDialog title="Report filters" description="Match all selected conditions. Changes apply when you choose Apply filters." onClose={onClose}>
        <form onSubmit={(event) =>
{
 event.preventDefault(); const result = buildReportQuery(writeReportFilters(new URLSearchParams(), draft)); if (result.error) setError(result.error); else onApply(draft);
}}>
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
                <label className="grid gap-2 text-sm">Status condition<select className={fieldClassName} value={draft.statusCondition} onChange={(event) => update("statusCondition", event.target.value)}><option value="EQUAL">Is</option><option value="NOTEQUAL">Is not</option></select></label>
                <label className="grid gap-2 text-sm">Status<select className={fieldClassName} value={draft.status} onChange={(event) => update("status", event.target.value)}><option value="">All statuses</option>{requestStatusSchema.options.map((status) => <option key={status} value={status}>{requestStatusLabel(status)}</option>)}</select></label>
                <RequestTypeFilter value={draft.typeId} generation={generation} onChange={(value) => update("typeId", value)} />
                <label className="grid gap-2 text-sm">Department<select className={fieldClassName} value={draft.departmentId} onChange={(event) => update("departmentId", event.target.value)}><option value="">All departments</option><option value="ISNULL">No department</option><option value="ISNOTNULL">Any assigned department</option>{department && <option value={department.id}>{department.name}</option>}{unavailable && <option value={draft.departmentId}>Previously selected department</option>}</select></label>
                <label className="grid gap-2 text-sm">Created from (Bangkok)<Input type="date" value={draft.createdFrom} onChange={(event) => update("createdFrom", event.target.value)} /></label>
                <label className="grid gap-2 text-sm">Created through (Bangkok)<Input type="date" value={draft.createdTo} onChange={(event) => update("createdTo", event.target.value)} /></label>
                {error && <p role="alert" className="text-sm text-destructive sm:col-span-2">{error}</p>}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t p-4"><ActionButton type="button" variant="ghost" className="mr-auto" onClick={() =>
{
 setDraft({ ...emptyReportFilters }); setError("");
}}>Reset filters</ActionButton><ActionButton type="button" onClick={onClose}>Cancel</ActionButton><ActionButton variant="primary" type="submit">Apply filters</ActionButton></div>
        </form>
    </CollectionDialog>;
}
