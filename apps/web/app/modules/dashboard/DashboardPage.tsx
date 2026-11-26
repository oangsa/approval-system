import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { DashboardDTO } from "@workflow/contracts";
import { ActionButton } from "~/components/actions/ActionButton";
import { PageHeader } from "~/components/layout/PageHeader";
import { useSession } from "~/modules/auth/sessionContext";
import { presentFailure, requestStatusLabel } from "~/modules/requests/requestPresentation";
import { readDashboard } from "~/services/dashboardService";

const labels: Record<string, string> = { ownRequests: "My requests", pendingRequests: "Pending requests", returnedRequests: "Returned requests", approvedRequests: "Approved requests", rejectedRequests: "Rejected requests", pendingReviews: "Pending reviews", overdueTasks: "Overdue tasks", enabledPublishedTypes: "Enabled published types", activePolicyVersions: "Active policy versions", activeAssignmentRules: "Active assignment rules", actionableTasks: "Actionable tasks" };
interface ICountsProps { values: Record<string, number>; }
function Counts({ values }: ICountsProps)
{
    return <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(values).map(([key, count]) => <div key={key} className="rounded-lg border bg-card p-4"><dt className="text-sm text-muted-foreground">{labels[key] ?? key}</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{count}</dd></div>)}</dl>;
}
export function DashboardPage()
{
    const { generation, user } = useSession();
    const scope = `${generation}:${user?.id ?? ""}:${[...(user?.roles ?? [])].sort().join(",")}:${user?.department?.id ?? ""}`;
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<{ scope: string; data?: DashboardDTO; error?: unknown } | null>(null);
    useEffect(() =>
    {
        if (!user) return;
        const controller = new AbortController();
        readDashboard(controller.signal, generation).then((data) =>
{
 if (!controller.signal.aborted) setState({ scope, data });
}).catch((error: unknown) =>
{
 if (!controller.signal.aborted) setState({ scope, error });
});
        return () => controller.abort();
    }, [generation, scope, attempt, user]);
    const current = state?.scope === scope ? state : null;
    const error = current?.error ? presentFailure(current.error, "Could not load dashboard.") : null;
    const data = current?.data;
    return <div className="mx-auto max-w-7xl space-y-6"><PageHeader title="Dashboard" description="Your current approval activity." actions={<ActionButton type="button" onClick={() =>
{
 setState(null); setAttempt((value) => value + 1);
}}>Refresh</ActionButton>} />
        {!current && <p role="status">Loading dashboard…</p>}
        {error && <div role="alert" className="rounded-lg border p-4"><p>{error.message}</p>{error.requestId && <p className="text-sm">Support ID: {error.requestId}</p>}{!error.terminal && <ActionButton type="button" onClick={() =>
{
 setState(null); setAttempt((value) => value + 1);
}}>Retry</ActionButton>}</div>}
        {data && <><p className="text-sm text-muted-foreground">Updated <time dateTime={data.generatedAt}>{new Date(data.generatedAt).toLocaleString(undefined, { timeZone: "Asia/Bangkok" })}</time> (Bangkok)</p>
            {"summary" in data && <Counts values={data.summary} />}
            {"recentRequests" in data && <section className="space-y-3 rounded-lg border bg-card p-4"><h2 className="font-semibold">Recent requests</h2>{data.recentRequests.length ? <ul className="divide-y">{data.recentRequests.map((item) => <li className="py-2" key={item.id}><Link className="underline underline-offset-4" to={`/requests/${item.id}`}>{item.title || "Untitled draft"}</Link> <span className="text-sm text-muted-foreground">— {requestStatusLabel(item.status)}</span></li>)}</ul> : <p>No recent requests.</p>}</section>}
            {"pendingTasks" in data && <section className="space-y-3 rounded-lg border bg-card p-4"><h2 className="font-semibold">Pending reviews</h2>{data.pendingTasks.length ? <ul className="divide-y">{data.pendingTasks.map((item) => <li className="py-2" key={item.id}><Link className="underline underline-offset-4" to={`/reviews/${item.slotId}`}>Review stage {item.stageNumber}</Link> <span className="text-sm text-muted-foreground">— {item.status === "ACTIONABLE" ? "Action required" : "Waiting"}</span></li>)}</ul> : <p>No pending reviews.</p>}</section>}
            {"recentDecisions" in data && <section className="space-y-3 rounded-lg border bg-card p-4"><h2 className="font-semibold">Recent decisions</h2>{data.recentDecisions.length ? <ul className="divide-y">{data.recentDecisions.map((item) => <li className="py-2" key={item.id}><Link className="underline underline-offset-4" to={`/reviews/${item.taskId}`}>{item.decision.toLowerCase()}</Link> <time className="text-sm text-muted-foreground" dateTime={item.decidedAt}>{new Date(item.decidedAt).toLocaleString(undefined, { timeZone: "Asia/Bangkok" })}</time></li>)}</ul> : <p>No recent decisions.</p>}</section>}
            {"administration" in data && <section className="space-y-4"><h2 className="text-lg font-semibold">Administration</h2><Counts values={{ ...data.administration.configuration, ...data.administration.escalation }} /><div className="rounded-lg border bg-card p-4"><h3 className="font-medium">Requests by status</h3>{data.administration.statusCounts.length ? <ul>{data.administration.statusCounts.map((row) => <li className="flex justify-between gap-4 py-1" key={row.key}><span>{row.label}</span><span className="tabular-nums">{row.count}</span></li>)}</ul> : <p>No requests.</p>}</div></section>}
        </>}
    </div>;
}
