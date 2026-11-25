import { useEffect, useMemo, useRef, useState } from "react";
import { reportDimensionSchema } from "@workflow/contracts";
import { ActionButton } from "~/components/actions/ActionButton";
import { PageHeader } from "~/components/layout/PageHeader";
import { fieldClassName } from "~/components/forms/FieldRenderer";
import { Input } from "~/components/ui/input";
import { useSession } from "~/modules/auth/sessionContext";
import { presentFailure } from "~/modules/requests/requestPresentation";
import { searchReports } from "~/services/reportingService";
import { useSearchParams } from "react-router";
import { ReportFiltersDialog } from "./ReportFilters";
import { buildReportQuery, readReportFilters, writeReportFilters } from "./reportQuery";

export function ReportsPage()
{
    const { generation, user } = useSession();
    const [params, setParams] = useSearchParams();
    const serialized = params.toString();
    const criteria = useMemo(() => buildReportQuery(new URLSearchParams(serialized)), [serialized]);
    const scope = `${generation}:${user?.id ?? ""}:${[...(user?.roles ?? [])].sort().join(",")}:${user?.department?.id ?? ""}:${serialized}`;
    const [attempt, setAttempt] = useState(0);
    const [open, setOpen] = useState(false);
    const [state, setState] = useState<{ scope: string; attempt: number; result?: Awaited<ReturnType<typeof searchReports>>; error?: unknown } | null>(null);
    const [term, setTerm] = useState(params.get("search") ?? "");
    const recovered = useRef("");
    useEffect(() => setTerm(params.get("search") ?? ""), [serialized]);
    useEffect(() =>
    {
        if (!criteria.query || !user) return;
        const controller = new AbortController();
        searchReports(criteria.query, controller.signal, generation).then((result) =>
        {
            if (controller.signal.aborted) return;
            const last = Math.max(1, result.pagination.totalPages);
            if (!result.items.length && result.pagination.currentPage > last && recovered.current !== scope)
            {
                const next = new URLSearchParams(serialized);
                if (last === 1) next.delete("page"); else next.set("page", String(last));
                recovered.current = `${generation}:${user.id}:${[...user.roles].sort().join(",")}:${user.department?.id ?? ""}:${next.toString()}`;
                setParams(next, { replace: true });
                return;
            }
            setState({ scope, attempt, result });
        }).catch((error: unknown) =>
{
 if (!controller.signal.aborted) setState({ scope, attempt, error });
});
        return () => controller.abort();
    }, [criteria, generation, scope, serialized, attempt, setParams, user]);
    function update(key: string, value: string)
    {
        const next = new URLSearchParams(serialized);
        if (value) next.set(key, value); else next.delete(key);
        if (key !== "page") next.delete("page");
        setParams(next);
    }
    const current = state?.scope === scope ? state : null;
    const error = current?.error ? presentFailure(current.error, "Could not load reports.") : null;
    const result = current?.result;
    const filtered = !!(params.get("search") || Object.entries(readReportFilters(params)).some(([key, value]) => key !== "statusCondition" && value));
    return <div className="mx-auto max-w-7xl space-y-6"><PageHeader title="Reports" description="Explore request totals within your access." actions={<ActionButton type="button" onClick={() => setAttempt((value) => value + 1)}>Refresh report</ActionButton>} />
        <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
            <label className="grid gap-1 text-sm">Group by<select className={fieldClassName} value={params.get("dimension") ?? "STATUS"} onChange={(event) => update("dimension", event.target.value)}>{reportDimensionSchema.options.map((dimension) => <option key={dimension} value={dimension}>{dimension.charAt(0) + dimension.slice(1).toLowerCase()}</option>)}</select></label>
            <form className="flex items-end gap-2" onSubmit={(event) =>
{
 event.preventDefault(); update("search", term.trim());
}}><label className="grid gap-1 text-sm">Search labels<Input value={term} maxLength={200} onChange={(event) => setTerm(event.target.value)} /></label><ActionButton type="submit">Search</ActionButton></form>
            <ActionButton type="button" onClick={() => setOpen(true)}>Filters</ActionButton><ActionButton type="button" variant="ghost" onClick={() =>
{
 setTerm(""); setParams(new URLSearchParams());
}}>Clear all</ActionButton>
            <label className="grid gap-1 text-sm">Sort<select className={fieldClassName} value={params.get("sort") ?? "key asc"} onChange={(event) => update("sort", event.target.value)}>{["key asc", "key desc", "label asc", "label desc", "count asc", "count desc"].map((sort) => <option key={sort} value={sort}>{sort}</option>)}</select></label>
            <label className="grid gap-1 text-sm">Rows per page<select className={fieldClassName} value={params.get("pageSize") ?? "20"} onChange={(event) => update("pageSize", event.target.value)}>{[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        </div>
        {open && <ReportFiltersDialog filters={readReportFilters(params)} generation={generation} department={user?.department ?? null} onClose={() => setOpen(false)} onApply={(filters) =>
{
 setParams(writeReportFilters(params, filters)); setOpen(false);
}} />}
        {filtered && <div aria-label="Applied filters" className="flex flex-wrap gap-2 text-sm">{Object.entries(readReportFilters(params)).filter(([key, value]) => key !== "statusCondition" && value).map(([key, value]) => <span className="rounded-md border px-2 py-1" key={key}>{key === "typeId" ? "Request type selected" : key === "departmentId" ? (value === "ISNULL" ? "No department" : value === "ISNOTNULL" ? "Assigned department" : value === user?.department?.id ? user.department.name : "Selected department") : `${key}: ${value}`} <button type="button" className="underline" aria-label={`Remove ${key} filter`} onClick={() => update(key, "")}>Remove</button></span>)}{params.get("search") && <span className="rounded-md border px-2 py-1">Label: {params.get("search")} <button type="button" className="underline" onClick={() =>
{
 setTerm(""); update("search", "");
}}>Remove</button></span>}</div>}
        {criteria.error && <p role="alert" className="rounded-lg border p-4">{criteria.error}</p>}
        {!criteria.error && !current && <p role="status">Loading report…</p>}
        {error && <div role="alert" className="rounded-lg border p-4"><p>{error.message}</p>{error.requestId && <p className="text-sm">Support ID: {error.requestId}</p>}{!error.terminal && <ActionButton type="button" onClick={() =>
{
 setState(null); setAttempt((value) => value + 1);
}}>Retry</ActionButton>}</div>}
        {current && current.attempt !== attempt && <p role="status">Refreshing report…</p>}
        {result && <div className="space-y-4 rounded-lg border bg-card p-4">{result.items.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="py-2">Group</th><th className="py-2 text-right">Requests</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{result.items.map((row) => <tr key={row.key} className="border-b last:border-0"><td className="py-3">{row.label}</td><td className="py-3 text-right tabular-nums">{row.count}</td><td className="py-3 text-right">{row.dimension === "DEPARTMENT" && <ActionButton type="button" size="small" onClick={() => update("departmentId", row.key === "UNASSIGNED" ? "ISNULL" : row.key)}>Filter to this department</ActionButton>}</td></tr>)}</tbody></table></div> : <p>{filtered ? "No groups match these filters." : "No report data available."}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm tabular-nums"><span>{result.pagination.totalCount} groups · Page {result.pagination.currentPage} of {Math.max(1, result.pagination.totalPages)}</span><div className="flex gap-2"><ActionButton type="button" disabled={!result.pagination.hasPrevious} onClick={() => update("page", String(result.pagination.currentPage - 1))}>Previous</ActionButton><ActionButton type="button" disabled={!result.pagination.hasNext} onClick={() => update("page", String(result.pagination.currentPage + 1))}>Next</ActionButton></div></div></div>}
    </div>;
}
