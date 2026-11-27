import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { type ApprovalTask, type RequestDetail } from "@workflow/contracts";
import { buildReviewQueueQuery, queuePageSizes, queueQueryKeys } from "./reviewQueueQuery";
import { requestApi } from "~/api/requests";
import { isApiFailure } from "~/api/errors";
import { RequestCollection } from "~/components/collections/RequestCollection";
import { PageHeader } from "~/components/layout/PageHeader";
import { ActionButton as Button } from "~/components/actions/ActionButton";
import { X } from "lucide-react";
import { useSession } from "~/modules/auth/sessionContext";
import { requestPriorityLabel } from "~/modules/requests/requestPresentation";
import { formatDueLabel } from "~/modules/reviews/formatDue";
import { searchApprovalTasks } from "~/services/approvalTaskService";

type PageResult = Awaited<ReturnType<typeof searchApprovalTasks>>;
type RetryMode = "none" | "retry" | "reset";
interface IQueueState { key: string; result: PageResult | null; labels: Record<string, RequestDetail>; error: string; retry: RetryMode; }

const FILTER_ERROR = "Some filters could not be applied. Adjust them and try again.";

export function ReviewQueuePage()
{
    const { status, user, generation } = useSession();
    const eligible = status === "authenticated" && !!user?.roles.includes("REVIEWER");
    const [params, setParams] = useSearchParams();
    const serialized = params.toString();
    const criteria = useMemo(() => buildReviewQueueQuery(new URLSearchParams(serialized)), [serialized]);
    const query = criteria.query;
    const appliedTerm = (params.get("search") ?? "").trim();
    const stage = params.get("stage") || null;
    const due = params.get("due") || null;
    const orderBy = query?.orderBy ?? "dueAt asc";
    const recovery = useRef("");
    const [draft, setDraft] = useState(appliedTerm);
    const [attempt, setAttempt] = useState(0);
    useEffect(() =>
    {
        function refresh()
        {
            if (document.visibilityState === "visible") setAttempt((value) => value + 1);
        }
        window.addEventListener("focus", refresh);
        document.addEventListener("visibilitychange", refresh);
        return () =>
        {
            window.removeEventListener("focus", refresh);
            document.removeEventListener("visibilitychange", refresh);
        };
    }, []);
    const [state, setState] = useState<IQueueState | null>(null);

    useEffect(() =>
    {
        setDraft(appliedTerm);
    }, [appliedTerm]);

    const commitSearch = useCallback((value: string) =>
    {
        const next = value.trim().slice(0, 100);
        if (next === appliedTerm)
        {
            return;
        }
        setParams((previous) =>
        {
            const updated = new URLSearchParams(previous);
            if (next)
            {
                updated.set("search", next);
            }
            else
            {
                updated.delete("search");
            }
            updated.delete("page");
            return updated;
        });
    }, [appliedTerm, setParams]);

    useEffect(() =>
    {
        if (draft === appliedTerm)
        {
            return;
        }
        const timer = setTimeout(() =>
        {
            commitSearch(draft);
        }, 300);
        return () => clearTimeout(timer);
    }, [draft, appliedTerm, commitSearch]);

    const key = `${generation}:${user?.id ?? ""}:${JSON.stringify(query)}:${attempt}`;
    useEffect(() =>
    {
        if (!eligible || !query)
        {
            return;
        }
        const controller = new AbortController();
        setState({ key, result: null, labels: {}, error: "", retry: "none" });
        void searchApprovalTasks(query, controller.signal, generation).then(async (result) =>
        {
            if (controller.signal.aborted)
            {
                return;
            }
            const lastPage = Math.max(1, result.pagination.totalPages);
            if (!result.items.length && query.pageNumber > lastPage && recovery.current !== key)
            {
                recovery.current = key;
                setParams((previous) =>
                {
                    const next = new URLSearchParams(previous);
                    next.set("page", String(lastPage));
                    return next;
                }, { replace: true });
                return;
            }
            setState({ key, result, labels: {}, error: "", retry: "none" });
            let nextIndex = 0;
            const worker = async () =>
            {
                while (!controller.signal.aborted && nextIndex < result.items.length)
                {
                    const task = result.items[nextIndex++];
                    if (task === undefined)
                    {
                        continue;
                    }
                    try
                    {
                        const detail = await requestApi.read(task.requestId, controller.signal, generation);
                        if (!controller.signal.aborted)
                        {
                            setState((previous) => !controller.signal.aborted && previous?.key === key && previous.result === result
                                ? { ...previous, labels: { ...previous.labels, [task.id]: detail } }
                                : previous);
                        }
                    }
                    catch
                    {
                        // Keep the fallback when a detail lookup fails.
                    }
                }
            };
            await Promise.all(Array.from({ length: Math.min(4, result.items.length) }, () => worker()));
        }).catch((failure: unknown) =>
        {
            if (controller.signal.aborted)
            {
                return;
            }
            if (isApiFailure(failure) && failure.status === 422)
            {
                setState({ key, result: null, labels: {}, error: FILTER_ERROR, retry: "reset" });
                return;
            }
            const denied = isApiFailure(failure) && [401, 403, 404].includes(failure.status ?? 0);
            setState({ key, result: null, labels: {}, error: denied ? "Review queue is unavailable." : "Could not load reviews. Please try again.", retry: denied ? "none" : "retry" });
        });
        return () => controller.abort();
    }, [eligible, generation, key, query, setParams]);
    const current = eligible && !criteria.error && draft.trim() === appliedTerm && state?.key === key ? state : null;
    const label = (task: ApprovalTask) => current?.labels[task.id];
    const taskLink = (task: ApprovalTask) => <Link className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2" to={`/reviews/${task.id}`}>{label(task)?.requestNumber ?? `Request ${task.requestId}`}</Link>;
    const description = (task: ApprovalTask) =>
    {
        const detail = label(task);
        return detail ? `${detail.title} · ${requestPriorityLabel(detail.priority)}` : "Request details unavailable";
    };
    const filtered = !!query?.searchTerm || (query?.search.length ?? 0) > 0;
    const isDefaultQuery = queueQueryKeys.every((name) => !params.has(name));
    const retryNow = () =>
    {
        setAttempt((value) => value + 1);
    };
    const handleReset = () =>
    {
        setDraft("");
        if (isDefaultQuery)
        {
            setAttempt((value) => value + 1);
            return;
        }
        setParams((previous) =>
        {
            const updated = new URLSearchParams(previous);
            for (const name of queueQueryKeys) updated.delete(name);
            return updated;
        });
    };
    const update = (name: string, value: string) =>
    {
        setParams((previous) =>
        {
            const next = new URLSearchParams(previous);
            if (value) next.set(name, value); else next.delete(name);
            next.delete("page");
            return next;
        });
    };
    const chips = [
        ...(appliedTerm ? [{ name: "search", label: `Search: ${appliedTerm}` }] : []),
        ...(stage ? [{ name: "stage", label: `Stage ${stage}` }] : []),
        ...(due ? [{ name: "due", label: "Overdue" }] : []),
        ...(params.get("status") ? [{ name: "status", label: "Actionable" }] : []),
        ...["dueFrom", "dueTo"].flatMap((name) => params.get(name) ? [{ name, label: `${name === "dueFrom" ? "Due from" : "Due through"}: ${params.get(name)}` }] : []),
    ];
    const applyPage = (nextPage: number) =>
    {
        setParams((previous) =>
        {
            const updated = new URLSearchParams(previous);
            if (nextPage <= 1)
            {
                updated.delete("page");
            }
            else
            {
                updated.set("page", String(nextPage));
            }
            return updated;
        });
    };
    const onRetry = current?.retry === "reset" ? handleReset : current?.retry === "retry" ? retryNow : undefined;
    return <div className="space-y-6">
        <PageHeader title="My Reviews" />
        {!eligible && status !== "loading" && status !== "idle" ? <p role="alert">Review queue is unavailable.</p> : <>
            <form className="flex flex-wrap items-end gap-3" onSubmit={(event) =>
            {
                event.preventDefault();
                commitSearch(draft);
            }}>
                <label className="grid gap-1 text-sm">Search requests<input className="rounded-md border bg-background px-3 py-2" maxLength={100} value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
                <label className="grid gap-1 text-sm">Stage<select className="rounded-md border bg-background px-3 py-2" value={stage === null ? "" : String(stage)} onChange={(event) => update("stage", event.target.value)}><option value="">All stages</option><option value="1">Stage 1</option><option value="2">Stage 2</option></select></label>
                <label className="grid gap-1 text-sm">Due<select className="rounded-md border bg-background px-3 py-2" value={due === "overdue" ? "overdue" : "all"} onChange={(event) => update("due", event.target.value === "overdue" ? "overdue" : "")}><option value="all">All tasks</option><option value="overdue">Overdue</option></select></label>
                <label className="grid gap-1 text-sm">Sort<select className="rounded-md border bg-background px-3 py-2" value={orderBy} onChange={(event) => update("sort", event.target.value)}><option value="dueAt asc">Due date ascending</option><option value="dueAt desc">Due date descending</option><option value="stageNumber asc">Stage ascending</option><option value="stageNumber desc">Stage descending</option><option value="requestNumber asc">Request number ascending</option><option value="requestNumber desc">Request number descending</option></select></label>
                <Button type="submit">Search</Button>
            </form>
            <div className="flex flex-wrap items-end gap-3">
                <label className="grid gap-1 text-sm">Task status<select className="min-h-11 rounded-md border bg-background px-3 py-2" value={params.get("status") ?? ""} onChange={(event) => update("status", event.target.value)}><option value="">All current tasks</option><option value="ACTIONABLE">Actionable</option></select></label>
                <label className="grid min-w-0 gap-1 text-sm">Due from (Bangkok)<input type="date" className="min-h-11 min-w-0 rounded-md border bg-background px-3 py-2" value={params.get("dueFrom") ?? ""} onChange={(event) => update("dueFrom", event.target.value)} /></label>
                <label className="grid min-w-0 gap-1 text-sm">Due through (Bangkok)<input type="date" className="min-h-11 min-w-0 rounded-md border bg-background px-3 py-2" value={params.get("dueTo") ?? ""} onChange={(event) => update("dueTo", event.target.value)} /></label>
            </div>
            <div className="flex flex-wrap gap-2">{chips.map((chip) => <Button key={chip.name} type="button" className="max-w-full border" aria-label={`Remove ${chip.label}`} onClick={() =>
            {
                if (chip.name === "search") setDraft("");
                update(chip.name, "");
            }}><span className="min-w-0 truncate">{chip.label}</span><X aria-hidden="true" className="size-3 shrink-0" /></Button>)}{(chips.length > 0 || criteria.error) && <Button type="button" onClick={handleReset}>Reset filters</Button>}</div>
            {criteria.error ? <p role="alert">{criteria.error}</p> : <RequestCollection items={current?.result?.items ?? []} pagination={current?.result?.pagination ?? null} loading={!current || (!current.result && !current.error)} error={current?.error ?? ""} columns={["Request", "Stage", "Status", "Assigned reviewer", "Due"]} loadingMessage="Loading reviews…" emptyMessage={filtered ? "No reviews match your filters." : "No reviews assigned."} onRetry={onRetry} emptyAction={filtered ? <Button onClick={handleReset}>Reset filters</Button> : undefined} mobileSortHeader sort={{ orderBy, fields: { Request: "requestNumber", Stage: "stageNumber", Due: "dueAt" }, onChange: (value) => update("sort", value) }} paginationOptions={<label className="flex items-center gap-2">Rows per page<select className="min-h-11 rounded-md border bg-background px-3" value={query?.pageSize ?? 20} onChange={(event) => update("pageSize", event.target.value)}>{queuePageSizes.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>} onPageChange={applyPage} renderDesktopRow={(task) => <><td className="p-3">{taskLink(task)}<div>{description(task)}</div></td><td className="p-3">{task.stageNumber}</td><td className="p-3">{task.status === "ACTIONABLE" ? "Actionable" : task.status}</td><td className="p-3">{task.assignedReviewer.displayName}</td><td className="p-3">{formatDueLabel(task)}</td></>} renderMobileCard={(task) => <div className="space-y-1 wrap-anywhere">{taskLink(task)}<p>{description(task)}</p><p>Stage {task.stageNumber} · {task.status === "ACTIONABLE" ? "Actionable" : task.status}</p><p>Assigned to {task.assignedReviewer.displayName}</p><p>{formatDueLabel(task)}</p></div>} />}
        </>}
    </div>;
}
