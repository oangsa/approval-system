import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { RequestSearchQuery, RequestSummary } from "@workflow/contracts";
import { requestApi } from "~/api/requests";
import { isApiFailure } from "~/api/errors";
import { RequestCollection } from "~/components/collections/RequestCollection";
import type { IRequestCollectionProps } from "~/components/collections/RequestCollection";
import { useSession } from "~/modules/auth/sessionContext";
import { RequestStatus } from "./RequestResult";

const statuses = ["DRAFT", "PENDING", "RETURNED", "APPROVED", "REJECTED", "WITHDRAWN"] as const;
const sorts = ["updatedAt desc", "updatedAt asc", "createdAt desc", "createdAt asc", "submittedAt desc", "submittedAt asc", "requestNumber asc", "requestNumber desc", "title asc", "title desc"] as const;
export function RequestListPage()
{
    const { generation, user } = useSession();
    const [params, setParams] = useSearchParams();
    const term = (params.get("search") ?? "").slice(0, 100).trim();
    const updatedOn = params.get("updatedOn") ?? "";
    const date = /^\d{4}-\d{2}-\d{2}$/.test(updatedOn) ? new Date(`${updatedOn}T00:00:00.000Z`) : null;
    const validDate = date && !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === updatedOn ? date : null;
    const status = statuses.find((value) => value === params.get("status"));
    const sort = sorts.find((value) => value === params.get("sort")) ?? "updatedAt desc";
    const rawPage = Number(params.get("page") ?? 1);
    const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 10000 ? rawPage : 1;
    const [input, setInput] = useState(term);
    const [attempt, setAttempt] = useState(0);
    const scope = `${generation}:${user?.id ?? ""}:${term}:${status ?? ""}:${updatedOn}:${sort}:${page}`;
    const [result, setResult] = useState<{ scope: string; items: RequestSummary[]; pagination: NonNullable<IRequestCollectionProps<RequestSummary>["pagination"]> } | null>(null);
    const [error, setError] = useState<{ scope: string; message: string } | null>(null);
    function update(key: string, value: string)
    {
        const next = new URLSearchParams(params);
        if (value) next.set(key, value); else next.delete(key);
        if (key !== "page") next.delete("page");
        setParams(next);
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
        }), 300);
        return () => clearTimeout(timer);
    }, [input, term, setParams]);
    useEffect(() =>
    {
        const controller = new AbortController();
        setResult(null);
        setError(null);
        if (!user) return () => controller.abort();
        const search: RequestSearchQuery["search"] = status ? [{ name: "status", condition: "EQUAL", value: status }] : [];
        if (validDate)
        {
            const start = validDate.valueOf() - 7 * 60 * 60 * 1000;
            search.push({ name: "updatedAt", condition: "GREATEROREQUAL", value: new Date(start).toISOString() }, { name: "updatedAt", condition: "LESSER", value: new Date(start + 86400000).toISOString() });
        }
        const query: RequestSearchQuery = { pageNumber: page, pageSize: 20, search, ...(term.trim() ? { searchTerm: { name: "requestNumber,title", value: term.trim() } } : {}), orderBy: sort };
        requestApi.search(query, controller.signal, generation).then((data) =>
        {
            if (!controller.signal.aborted) setResult({ scope, ...data });
        }).catch((failure: unknown) =>
        {
            if (!controller.signal.aborted) setError({ scope, message: isApiFailure(failure) ? failure.message : "Could not load requests." });
        });
        return () => controller.abort();
    }, [scope, attempt, generation, user?.id, page, status, sort, term]);
    const visible = result?.scope === scope && input.trim() === term ? result : null;
    const visibleError = error?.scope === scope && input.trim() === term ? error.message : "";
    function clearFilters()
    {
        const next = new URLSearchParams(params);
        ["search", "status", "updatedOn", "page"].forEach((key) => next.delete(key));
        setInput("");
        setParams(next);
    }
    function link(item: RequestSummary)
    {
        return <Link className="font-medium text-primary underline underline-offset-4" to={`/requests/${item.id}`}>{item.title || "Untitled draft"}</Link>;
    }
    return <div className="mx-auto max-w-6xl space-y-6"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-semibold">My Requests</h1><Link className="rounded-md bg-primary px-4 py-2 text-primary-foreground" to="/requests/new">New request</Link></div>
        <div className="flex flex-wrap gap-4"><label className="space-y-1 text-sm">Search<input className="block min-h-11 rounded-md border bg-background px-3" value={input} maxLength={100} onChange={(event) => setInput(event.target.value)} placeholder="Request number or title" /></label><label className="space-y-1 text-sm">Status<select className="block min-h-11 rounded-md border bg-background px-3" value={status ?? ""} onChange={(event) => update("status", event.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="space-y-1 text-sm">Updated on (Bangkok time)<input type="date" className="block min-h-11 rounded-md border bg-background px-3" value={validDate ? updatedOn : ""} onChange={(event) => update("updatedOn", event.target.value)} /></label><button type="button" onClick={clearFilters}>Clear filters</button><label className="space-y-1 text-sm">Sort<select className="block min-h-11 rounded-md border bg-background px-3" value={sort} onChange={(event) => update("sort", event.target.value)}>{sorts.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div>
        <RequestCollection items={visible?.items ?? []} pagination={visible?.pagination ?? null} loading={!visible && !visibleError} error={visibleError} onRetry={() => setAttempt((value) => value + 1)} emptyMessage={term || status || validDate ? "No requests match your filters." : "No requests yet."} columns={["Request", "Number", "Type", "Priority", "Department", "Status", "Updated"]} onPageChange={(next) => update("page", String(next))} renderDesktopRow={(item) => <><td className="p-3">{link(item)}</td><td className="p-3">{item.requestNumber ?? "Draft"}</td><td className="p-3">{item.typeCode}</td><td className="p-3">{item.priority}</td><td className="p-3">{item.department?.name ?? "No department"}</td><td className="p-3"><RequestStatus status={item.status} /></td><td className="p-3">{new Date(item.updatedAt).toLocaleDateString(undefined, { timeZone: "Asia/Bangkok" })}</td></>} renderMobileCard={(item) => <div className="space-y-2">{link(item)}<p>{item.requestNumber ?? "Draft"} · {item.typeCode}</p><p>{item.priority} · {item.department?.name ?? "No department"}</p><RequestStatus status={item.status} /><p className="text-sm text-muted-foreground">Updated {new Date(item.updatedAt).toLocaleDateString(undefined, { timeZone: "Asia/Bangkok" })}</p></div>} />
    </div>;
}
