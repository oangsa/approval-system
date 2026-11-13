import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Filter, Plus, RotateCw, Search, X } from "lucide-react";
import type { RequestSummary } from "@workflow/contracts";
import { searchRequests } from "~/services/requestService";
import { RequestCollection } from "~/components/collections/RequestCollection";
import type { IRequestCollectionProps } from "~/components/collections/RequestCollection";
import { ActionButton, actionStyles } from "~/components/actions/ActionButton";
import { PageHeader } from "~/components/layout/PageHeader";
import { fieldClassName } from "~/components/forms/FieldRenderer";
import { Input } from "~/components/ui/input";
import { useSession } from "~/modules/auth/sessionContext";
import { RequestStatus } from "./RequestResult";
import { presentFailure, requestPriorityLabel, requestSortLabels, requestStatusLabel, requestTypeLabel } from "./requestPresentation";
import { useRequestTypeSelection } from "./useRequestTypeSelection";
import { RequestFiltersDialog } from "./RequestFiltersDialog";
import { buildRequestQuery, emptyRequestFilters, pageSizes, readRequestFilters, requestDateRanges, requestSorts, writeRequestFilters, type RequestFilters } from "./requestListQuery";

export function RequestListPage()
{
    const { generation, user } = useSession();
    if (!user?.roles.includes("REQUESTER")) return <div className="mx-auto max-w-6xl space-y-6"><div role="alert" className="space-y-3 rounded-lg border bg-card p-6"><p>My Requests is available to Requester accounts only. Your account does not have Requester access.</p><Link className="rounded-md bg-primary px-4 py-2 text-primary-foreground" to="/dashboard">Go to Dashboard</Link></div></div>;
    return <RequesterListContent key={`${generation}:${user.id}`} generation={generation} userId={user.id} />;
}

interface IRequesterListContentProps
{
    generation: number;
    userId: string;
}

function RequesterListContent({ generation, userId }: IRequesterListContentProps)
{
    const [params, setParams] = useSearchParams();
    const serialized = params.toString();
    const criteria = useMemo(() => buildRequestQuery(new URLSearchParams(serialized)), [serialized]);
    const filters = readRequestFilters(params);
    const typeState = useRequestTypeSelection(criteria.query ? filters.typeId : "", generation);
    const term = (params.get("search") ?? "").trim();
    const [input, setInput] = useState(term);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const scope = `${generation}:${userId}:${serialized}`;
    const recoveryScope = useRef("");
    const [result, setResult] = useState<{ scope: string; attempt: number; items: RequestSummary[]; pagination: NonNullable<IRequestCollectionProps<RequestSummary>["pagination"]> } | null>(null);
    const [error, setError] = useState<{ scope: string; failure: unknown } | null>(null);
    function update(key: string, value: string)
    {
        setParams((current) =>
        {
            const next = new URLSearchParams(current);
            if (value) next.set(key, value); else next.delete(key);
            if (key !== "page") next.delete("page");
            return next;
        });
    }
    useEffect(() => setInput(term), [term]);
    useEffect(() =>
    {
        if (input.trim() === term) return;
        const timer = setTimeout(() => setParams((current) =>
        {
            const next = new URLSearchParams(current);
            const normalized = input.trim();
            if (normalized === (next.get("search") ?? "").trim()) return current;
            if (normalized) next.set("search", normalized); else next.delete("search");
            next.delete("page");
            return next;
        }, { replace: true }), 300);
        return () => clearTimeout(timer);
    }, [input, term, setParams]);
    useEffect(() =>
    {
        if (!criteria.query) return;
        const controller = new AbortController();
        setError(null);
        searchRequests(criteria.query, controller.signal, generation).then((data) =>
        {
            if (controller.signal.aborted) return;
            const lastPage = Math.max(1, data.pagination.totalPages);
            if (!data.items.length && data.pagination.currentPage > lastPage && recoveryScope.current !== scope)
            {
                const next = new URLSearchParams(serialized);
                if (lastPage === 1) next.delete("page"); else next.set("page", String(lastPage));
                recoveryScope.current = `${generation}:${userId}:${next.toString()}`;
                setParams(next, { replace: true });
                return;
            }
            setResult({ scope, attempt, ...data });
        }).catch((failure: unknown) =>
        {
            if (!controller.signal.aborted) setError({ scope, failure });
        });
        return () => controller.abort();
    }, [criteria, scope, attempt, generation, userId, serialized, setParams]);
    const visible = !criteria.error && result?.scope === scope && input.trim() === term ? result : null;
    const visibleError = error?.scope === scope && input.trim() === term ? presentFailure(error.failure, "Could not load requests.") : null;
    function clearFilters()
    {
        const next = writeRequestFilters(params, { ...emptyRequestFilters });
        next.delete("search");
        // Also recover malformed URL controls without discarding valid presentation choices.
        if (!requestSorts.some((sort) => sort === next.get("sort"))) next.delete("sort");
        if (!pageSizes.some((size) => String(size) === next.get("pageSize"))) next.delete("pageSize");
        setInput("");
        setParams(next);
    }
    const chips: { key: keyof RequestFilters; label: string; remove: (keyof RequestFilters)[] }[] = [];
    const statusFilter = criteria.query?.search.find((filter) => filter.name === "status");
    if (statusFilter && statusFilter.name === "status") chips.push({ key: "status", label: `Status ${statusFilter.condition === "NOTEQUAL" ? "is not" : "is"} ${requestStatusLabel(statusFilter.value)}`, remove: ["status", "statusCondition"] });
    const priorityFilter = criteria.query?.search.find((filter) => filter.name === "priority");
    if (priorityFilter && priorityFilter.name === "priority") chips.push({ key: "priority", label: `Priority: ${requestPriorityLabel(priorityFilter.value)}`, remove: ["priority"] });
    if (filters.typeId) chips.push({ key: "typeId", label: typeState.selection ? `Request type: ${typeState.selection.name.en} (${typeState.selection.code})` : typeState.failure ? "Request type unavailable" : "Loading request type…", remove: ["typeId"] });
    for (const [, label, from, to] of requestDateRanges)
    {
        if (filters[from] || filters[to]) chips.push({ key: from, label: `${label}: ${filters[from] || "Any date"} – ${filters[to] || "Any date"}`, remove: [from, to] });
    }
    if (filters.submitted) chips.push({ key: "submitted", label: filters.submitted === "yes" ? "Submitted" : "Not submitted", remove: ["submitted"] });
    for (const [label, key, condition] of [["Number", "number", "numberCondition"], ["Title", "title", "titleCondition"]] as const)
    {
        if (filters[key].trim()) chips.push({ key, label: `${label} ${filters[condition] === "EQUAL" ? "equals" : filters[condition] === "STARTWITH" ? "starts with" : "contains"} ${filters[key]}`, remove: [key, condition] });
    }
    const filtered = !!term || chips.length > 0;
    function link(item: RequestSummary)
    {
        return <Link className="inline-block max-w-full rounded-sm font-medium text-foreground underline-offset-4 wrap-anywhere hover:underline focus-visible:outline-2 focus-visible:outline-ring" to={`/requests/${item.id}`}>{item.title || "Untitled draft"}</Link>;
    }
    const dateLabel = (item: RequestSummary) => new Date(item.updatedAt).toLocaleDateString(undefined, { timeZone: "Asia/Bangkok" });
    return <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader title="My Requests" description="Track your requests and their latest approval status." actions={<Link className={actionStyles({ variant: "primary" })} to="/requests/new"><Plus aria-hidden="true" className="size-4" />New request</Link>} />
        <section aria-label="Request search and filters" className="space-y-4 rounded-lg border bg-card p-4">
            <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-3 xl:flex xl:flex-wrap">
                <div className="order-1 col-span-2 grid min-w-0 flex-1 basis-64 gap-1.5 text-sm font-medium sm:col-span-3 xl:order-none"><label htmlFor="request-list-search">Search</label><div className="flex gap-2"><span className="relative min-w-0 flex-1"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" /><Input id="request-list-search" className="min-h-11 pl-9" value={input} maxLength={100} onChange={(event) => setInput(event.target.value)} placeholder="Request number or title…" /></span><ActionButton type="button" aria-label="Refresh requests" disabled={!visible || visible.attempt !== attempt} size="icon" onClick={() => setAttempt((value) => value + 1)}><RotateCw aria-hidden="true" className="size-4" /></ActionButton></div></div>
                <ActionButton type="button" aria-haspopup="dialog" aria-expanded={dialogOpen} className="order-3 justify-start sm:justify-center xl:order-none" onClick={() => setDialogOpen(true)}><Filter aria-hidden="true" className="size-4" />Filters{chips.length > 0 && <span className="rounded bg-secondary px-1.5 text-xs">{chips.length}</span>}</ActionButton>
                <div className="order-2 col-span-2 grid min-w-0 gap-1.5 text-sm sm:col-span-1 xl:order-none xl:w-60"><label htmlFor="request-list-sort">Sort</label><select id="request-list-sort" className={`${fieldClassName} min-h-11 min-w-0 text-foreground`} value={criteria.query?.orderBy ?? "updatedAt desc"} onChange={(event) => update("sort", event.target.value)}>{requestSorts.map((value) => <option key={value} value={value}>{requestSortLabels[value]}</option>)}</select></div>
                <div className="order-4 grid min-w-0 gap-1.5 text-sm xl:order-none"><label htmlFor="request-list-size">Rows per page</label><select id="request-list-size" className={`${fieldClassName} min-h-11 text-foreground`} value={criteria.query?.pageSize ?? 20} onChange={(event) => update("pageSize", event.target.value)}>{pageSizes.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
            </div>
            {filtered && <div className="flex flex-wrap items-center gap-2 border-t pt-4">{term && <ActionButton type="button" size="small" className="max-w-full bg-muted/40" aria-label="Remove search" onClick={() =>
            {
                setInput("");
                update("search", "");
            }}><span className="truncate">Search: {term}</span><X aria-hidden="true" className="size-3 shrink-0" /></ActionButton>}{chips.map((chip) => <ActionButton key={chip.key} type="button" size="small" className="max-w-full bg-muted/40" aria-label={`Remove ${chip.label}`} onClick={() =>
            {
                const next = { ...filters };
                for (const key of chip.remove) next[key] = emptyRequestFilters[key];
                setParams(writeRequestFilters(params, next));
            }}><span className="truncate">{chip.label}</span><X aria-hidden="true" className="size-3 shrink-0" /></ActionButton>)}<ActionButton type="button" variant="ghost" size="small" className="underline underline-offset-4" onClick={clearFilters}>Clear all</ActionButton></div>}
            {typeState.failure && <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><p>{typeState.failure.message}</p>{!typeState.failure.terminal && <ActionButton size="small" type="button" onClick={typeState.retry}>Retry request type</ActionButton>}</div>}
        </section>
        {dialogOpen && <RequestFiltersDialog filters={filters} generation={generation} selectedType={typeState.selection} onResolveType={typeState.remember} onClose={() => setDialogOpen(false)} onApply={(draft) =>
        {
            setParams(writeRequestFilters(params, draft));
            setDialogOpen(false);
        }} />}
        {criteria.error ? <div role="alert" className="space-y-3 rounded-lg border p-6"><p>{criteria.error}</p><ActionButton type="button" className="min-h-11 border px-4" onClick={clearFilters}>Clear invalid criteria</ActionButton></div> : <RequestCollection items={visible?.items ?? []} pagination={visible?.pagination ?? null} loading={!visible && !visibleError} refreshing={!!visible && visible.attempt !== attempt && !visibleError} error={visibleError?.message ?? ""} requestId={visibleError?.requestId} onRetry={visibleError?.terminal ? undefined : () => setAttempt((value) => value + 1)} emptyMessage={filtered ? "No requests match your filters." : "No requests yet."} emptyAction={filtered ? <ActionButton type="button" className="min-h-11 border px-4 hover:bg-secondary" onClick={clearFilters}>Clear filters</ActionButton> : <p className="text-sm text-muted-foreground">Use New request to start your first approval.</p>} columns={["Request", "Number", "Type", "Priority", "Department", "Status", "Updated"]} sort={{ orderBy: criteria.query!.orderBy, fields: { Request: "title", Number: "requestNumber", Updated: "updatedAt" }, onChange: (sort) => update("sort", sort) }} onPageChange={(next) => update("page", String(next))} renderDesktopRow={(item) => <><td className="max-w-sm p-3">{link(item)}</td><td className="whitespace-nowrap p-3 text-muted-foreground">{item.requestNumber ?? "Draft"}</td><td className="p-3">{requestTypeLabel(item.typeCode)}</td><td className="p-3">{requestPriorityLabel(item.priority)}</td><td className="p-3">{item.department?.name ?? "No department"}</td><td className="p-3"><RequestStatus status={item.status} /></td><td className="whitespace-nowrap p-3 text-muted-foreground">{dateLabel(item)}</td></>} renderMobileCard={(item) => <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium text-muted-foreground">{item.requestNumber ?? "Draft"}</p><RequestStatus status={item.status} /></div>{link(item)}<p className="text-sm">{requestTypeLabel(item.typeCode)}</p><p className="text-sm text-muted-foreground">{requestPriorityLabel(item.priority)} · {item.department?.name ?? "No department"}</p><p className="border-t pt-3 text-xs text-muted-foreground">Updated {dateLabel(item)}</p></div>} />}
    </div>;
}
