import { presentFailure, type IViewError } from "./requestPresentation";
import { useEffect, useState } from "react";
import { readTimeline } from "~/services/decisionService";
import { useSession } from "~/modules/auth/sessionContext";
import { Button } from "~/components/ui/button";
import { formatInstant } from "~/modules/reviews/formatDue";
interface IAuditTimelineProps { requestId: string; }
export function AuditTimeline({ requestId }: IAuditTimelineProps)
{
    const { generation, user } = useSession();
    const [page, setPage] = useState(1);
    const [attempt, setAttempt] = useState(0);
    const scope = `${generation}:${user?.id}:${requestId}:${page}:${attempt}`;
    const [state, setState] = useState<{ scope: string; result?: Awaited<ReturnType<typeof readTimeline>>; error?: IViewError } | null>(null);
    useEffect(() =>
    {
        const controller = new AbortController();
        if (user) void readTimeline(requestId, page, controller.signal, generation).then((result) =>
        {
            if (!controller.signal.aborted) setState({ scope, result });
        }).catch((failure: unknown) =>
        {
            if (!controller.signal.aborted) setState({ scope, error: presentFailure(failure, "Could not load history.") });
        });
        return () => controller.abort();
    }, [scope, requestId, page, generation, user?.id]);
    const current = state?.scope === scope ? state : null;
    return <section aria-label="Formal decision and status history" className="space-y-4">
        <h2 className="text-lg font-semibold">Formal decision and status history</h2>
        <p className="text-sm text-muted-foreground">Accepted decisions are permanent. Discussion is shown separately.</p>
        {current?.error ? <div role="alert" className="space-y-3"><p>{current.error.message}</p>{current.error.requestId && <p>Request ID: <span className="select-all wrap-anywhere">{current.error.requestId}</span></p>}{!current.error.terminal && <Button className="border px-4 py-2" onClick={() => setAttempt((value) => value + 1)}>Retry history</Button>}</div> : !current?.result ? <p role="status">Loading history…</p> : <>
            {current.result.items.length === 0 ? <p>No history yet.</p> : <ol className="space-y-4">{current.result.items.map((item) => <li key={item.id} className="space-y-1 rounded-lg border bg-card p-4 wrap-anywhere"><p className="font-medium">{item.eventType.replaceAll("_", " ")}</p><p>{item.actor?.displayName ?? "System"} · <time dateTime={item.occurredAt}>{formatInstant(item.occurredAt)}</time></p>{item.note && <p>{item.note}</p>}{item.cycleId && <p className="text-xs text-muted-foreground">Cycle: {item.cycleId} · Revision: {item.revisionId}</p>}</li>)}</ol>}
            <nav aria-label="History pages" className="flex items-center gap-3"><Button className="border px-4 py-2" disabled={!current.result.pagination.hasPrevious} onClick={() => setPage((value) => value - 1)}>Previous history</Button><span>Page {page}</span><Button className="border px-4 py-2" disabled={!current.result.pagination.hasNext} onClick={() => setPage((value) => value + 1)}>Next history</Button></nav>
        </>}
    </section>;
}
