import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { approvalTaskSearchSchema, type ApprovalTask, type ApprovalTaskSearch, type RequestDetail } from "@workflow/contracts";
import { requestApi } from "~/api/requests";
import { isApiFailure } from "~/api/errors";
import { RequestCollection } from "~/components/collections/RequestCollection";
import { Button } from "~/components/ui/button";
import { useSession } from "~/modules/auth/sessionContext";
import { requestPriorityLabel } from "~/modules/requests/requestPresentation";
import { formatDueLabel } from "~/modules/reviews/formatDue";
import { searchApprovalTasks } from "~/services/approvalTaskService";

type PageResult = Awaited<ReturnType<typeof searchApprovalTasks>>;
type RetryMode = "none" | "retry" | "reset";
interface IQueueState { key: string; result: PageResult | null; labels: Record<string, RequestDetail>; error: string; retry: RetryMode; }

const DEFAULT_ORDER_BY: ApprovalTaskSearch["orderBy"] = "dueAt asc";
const ORDER_BY_OPTIONS = approvalTaskSearchSchema.shape.orderBy.unwrap().options;
const FILTER_ERROR = "Some filters could not be applied. Adjust them and try again.";

function normalizeSearch(value: string | null): string
{
    return (value ?? "").trim().slice(0, 100);
}

function normalizeStage(value: string | null): 1 | 2 | null
{
    if (value === "1")
    {
        return 1;
    }
    if (value === "2")
    {
        return 2;
    }
    return null;
}

function normalizeDue(value: string | null): "overdue" | null
{
    if (value === "overdue")
    {
        return "overdue";
    }
    return null;
}

function normalizeOrderBy(value: string | null): ApprovalTaskSearch["orderBy"]
{
    if (value !== null && ORDER_BY_OPTIONS.some((option) => option === value))
    {
        return value as ApprovalTaskSearch["orderBy"];
    }
    return DEFAULT_ORDER_BY;
}

function normalizePage(value: string | null): number
{
    const parsed = value === null ? Number.NaN : Number(value);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000)
    {
        return 1;
    }
    return parsed;
}

export function ReviewQueuePage()
{
    const { status, user, generation } = useSession();
    const eligible = status === "authenticated" && !!user?.roles.includes("REVIEWER");
    const [params, setParams] = useSearchParams();
    const appliedTerm = normalizeSearch(params.get("search"));
    const stage = normalizeStage(params.get("stage"));
    const due = normalizeDue(params.get("due"));
    const orderBy = normalizeOrderBy(params.get("sort"));
    const pageNumber = normalizePage(params.get("page"));
    const [draft, setDraft] = useState(appliedTerm);
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<IQueueState | null>(null);

    const query = useMemo<ApprovalTaskSearch>(() =>
    {
        const search: ApprovalTaskSearch["search"] = [];
        if (stage !== null)
        {
            search.push({ name: "stageNumber", condition: "EQUAL", value: stage });
        }
        if (due !== null)
        {
            search.push({ name: "overdue", condition: "EQUAL", value: true });
        }
        return {
            pageNumber,
            pageSize: 20,
            search,
            orderBy,
            searchTerm: appliedTerm ? { name: "requestNumber,title", value: appliedTerm } : undefined,
        };
    }, [appliedTerm, stage, due, orderBy, pageNumber]);

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
        if (!eligible)
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
    }, [eligible, generation, key, query]);
    const current = eligible && state?.key === key ? state : null;
    const label = (task: ApprovalTask) => current?.labels[task.id];
    const taskLink = (task: ApprovalTask) => <Link className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2" to={`/reviews/${task.id}`}>{label(task)?.requestNumber ?? `Request ${task.requestId}`}</Link>;
    const description = (task: ApprovalTask) =>
    {
        const detail = label(task);
        return detail ? `${detail.title} · ${requestPriorityLabel(detail.priority)}` : "Request details unavailable";
    };
    const filtered = !!query.searchTerm || query.search.length > 0;
    const isDefaultQuery = !appliedTerm && stage === null && due === null && orderBy === DEFAULT_ORDER_BY && pageNumber === 1;
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
            updated.delete("search");
            updated.delete("stage");
            updated.delete("due");
            updated.delete("sort");
            updated.delete("page");
            return updated;
        });
    };
    const applyStage = (value: string) =>
    {
        setParams((previous) =>
        {
            const updated = new URLSearchParams(previous);
            if (value === "1" || value === "2")
            {
                updated.set("stage", value);
            }
            else
            {
                updated.delete("stage");
            }
            updated.delete("page");
            return updated;
        });
    };
    const applyDue = (value: string) =>
    {
        setParams((previous) =>
        {
            const updated = new URLSearchParams(previous);
            if (value === "overdue")
            {
                updated.set("due", value);
            }
            else
            {
                updated.delete("due");
            }
            updated.delete("page");
            return updated;
        });
    };
    const applySort = (value: string) =>
    {
        setParams((previous) =>
        {
            const updated = new URLSearchParams(previous);
            updated.set("sort", value);
            updated.delete("page");
            return updated;
        });
    };
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
        <h1 className="text-2xl font-semibold">My Reviews</h1>
        {!eligible && status !== "loading" && status !== "idle" ? <p role="alert">Review queue is unavailable.</p> : <>
            <form className="flex flex-wrap items-end gap-3" onSubmit={(event) =>
            {
                event.preventDefault();
                commitSearch(draft);
            }}>
                <label className="grid gap-1 text-sm">Search requests<input className="rounded-md border bg-background px-3 py-2" maxLength={100} value={draft} onChange={(event) => setDraft(event.target.value)} /></label>
                <label className="grid gap-1 text-sm">Stage<select className="rounded-md border bg-background px-3 py-2" value={stage === null ? "" : String(stage)} onChange={(event) => applyStage(event.target.value)}><option value="">All stages</option><option value="1">Stage 1</option><option value="2">Stage 2</option></select></label>
                <label className="grid gap-1 text-sm">Due<select className="rounded-md border bg-background px-3 py-2" value={due === "overdue" ? "overdue" : "all"} onChange={(event) => applyDue(event.target.value)}><option value="all">All tasks</option><option value="overdue">Overdue</option></select></label>
                <label className="grid gap-1 text-sm">Sort<select className="rounded-md border bg-background px-3 py-2" value={orderBy} onChange={(event) => applySort(event.target.value)}><option value="dueAt asc">Due date ascending</option><option value="dueAt desc">Due date descending</option><option value="stageNumber asc">Stage ascending</option><option value="stageNumber desc">Stage descending</option><option value="requestNumber asc">Request number ascending</option><option value="requestNumber desc">Request number descending</option></select></label>
                <Button type="submit">Search</Button>
            </form>
            <RequestCollection items={current?.result?.items ?? []} pagination={current?.result?.pagination ?? null} loading={!current || (!current.result && !current.error)} error={current?.error ?? ""} columns={["Request", "Stage", "Status", "Assigned reviewer", "Due"]} loadingMessage="Loading reviews…" emptyMessage={filtered ? "No reviews match your filters." : "No reviews assigned."} onRetry={onRetry} onPageChange={applyPage} renderDesktopRow={(task) => <><td className="p-3">{taskLink(task)}<div>{description(task)}</div></td><td className="p-3">{task.stageNumber}</td><td className="p-3">{task.status === "ACTIONABLE" ? "Actionable" : task.status}</td><td className="p-3">{task.assignedReviewer.displayName}</td><td className="p-3">{formatDueLabel(task)}</td></>} renderMobileCard={(task) => <div className="space-y-1">{taskLink(task)}<p>{description(task)}</p><p>Stage {task.stageNumber} · {task.status === "ACTIONABLE" ? "Actionable" : task.status}</p><p>Assigned to {task.assignedReviewer.displayName}</p><p>{formatDueLabel(task)}</p></div>} />
        </>}
    </div>;
}
