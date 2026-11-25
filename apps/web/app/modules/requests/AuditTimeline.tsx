import { presentFailure, type IViewError } from "./requestPresentation";
import { useEffect, useState } from "react";
import { readTimeline } from "~/services/decisionService";
import { useSession } from "~/modules/auth/sessionContext";
import { Button } from "~/components/ui/button";
import { formatInstant } from "~/modules/reviews/formatDue";

interface IAuditTimelineProps { requestId: string; }
interface ITimelineProps extends IAuditTimelineProps { generation: number; signedIn: boolean; }

const eventLabels: Record<string, string> = {
    REQUEST_CREATED: "Request created",
    DRAFT_UPDATED: "Draft updated",
    REQUEST_SUBMITTED: "Request submitted",
    DECISION_APPROVE: "Decision: approved",
    DECISION_REJECT: "Decision: rejected",
    DECISION_RETURN: "Decision: returned",
    REQUEST_APPROVED: "Request approved",
    REQUEST_REJECTED: "Request rejected",
    REQUEST_RETURNED: "Request returned",
    REQUEST_WITHDRAWN: "Request withdrawn",
};

export function AuditTimeline({ requestId }: IAuditTimelineProps)
{
    const { generation, user } = useSession();
    const identity = JSON.stringify([requestId, generation, user?.id, [...(user?.roles ?? [])].sort()]);
    return <Timeline key={identity} requestId={requestId} generation={generation} signedIn={Boolean(user)} />;
}

function Timeline({ requestId, generation, signedIn }: ITimelineProps)
{
    const [page, setPage] = useState(1);
    const [attempt, setAttempt] = useState(0);
    const scope = `${page}:${attempt}`;
    const [state, setState] = useState<{ scope: string; result?: Awaited<ReturnType<typeof readTimeline>>; error?: IViewError } | null>(null);
    useEffect(() =>
    {
        const controller = new AbortController();
        if (signedIn) void readTimeline(requestId, page, controller.signal, generation).then((result) =>
        {
            if (!controller.signal.aborted) setState({ scope, result });
        }).catch((failure: unknown) =>
        {
            if (!controller.signal.aborted) setState({ scope, error: presentFailure(failure, "Could not load history.") });
        });
        return () => controller.abort();
    }, [scope, requestId, page, generation, signedIn]);
    const current = state?.scope === scope ? state : null;
    return <section aria-label="Formal decision and status history" className="space-y-4">
        <h2 className="text-lg font-semibold">Formal decision and status history</h2>
        <p className="text-sm text-muted-foreground">Accepted decisions are permanent. Discussion is shown separately.</p>
        {current?.error ? <div role="alert" className="space-y-3"><p>{current.error.message}</p>{current.error.requestId && <p>Request ID: <span className="select-all wrap-anywhere">{current.error.requestId}</span></p>}{!current.error.terminal && <Button className="border px-4 py-2" onClick={() => setAttempt((value) => value + 1)}>Retry history</Button>}</div> : !current?.result ? <p role="status">Loading history…</p> : <>
            {current.result.items.length === 0 ? <p>No history yet.</p> : <ol className="ms-2 space-y-4 border-s ps-5">{current.result.items.map((item) => <li key={item.id} className="relative space-y-1 rounded-lg border bg-card p-4 wrap-anywhere"><span aria-hidden="true" className="absolute -start-[1.625rem] top-5 size-2.5 rounded-full border-2 border-background bg-primary" /><p className="font-medium">{Object.hasOwn(eventLabels, item.eventType) ? eventLabels[item.eventType] : "History event"}</p>{Object.hasOwn(eventLabels, item.eventType) && <span className="sr-only">{item.eventType.replaceAll("_", " ")}</span>}<p>{item.actor?.displayName ?? "System"} · <time dateTime={item.occurredAt}>{formatInstant(item.occurredAt)}</time></p>{item.note && <p>{item.note}</p>}{item.cycleId && <p className="text-xs text-muted-foreground">Cycle ID: <span className="select-all">{item.cycleId}</span></p>}{item.revisionId && <p className="text-xs text-muted-foreground">Revision ID: <span className="select-all">{item.revisionId}</span></p>}</li>)}</ol>}
            <nav aria-label="History pages" className="flex items-center gap-3"><Button className="border px-4 py-2" disabled={!current.result.pagination.hasPrevious} onClick={() => setPage((value) => value - 1)}>Previous history</Button><span className="tabular-nums">Page {current.result.pagination.currentPage}</span><Button className="border px-4 py-2" disabled={!current.result.pagination.hasNext} onClick={() => setPage((value) => value + 1)}>Next history</Button></nav>
        </>}
    </section>;
}
