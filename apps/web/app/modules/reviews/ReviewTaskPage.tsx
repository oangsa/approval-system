import { approverSlotLabel } from "~/modules/requests/requestPresentation";
import { DecisionActions } from "./DecisionActions";
import { AuditTimeline } from "~/modules/requests/AuditTimeline";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useSession } from "~/modules/auth/sessionContext";
import { RequestResult } from "~/modules/requests/RequestResult";
import { readApprovalTaskResult } from "~/services/approvalTaskService";
import { formatInstant } from "~/modules/reviews/formatDue";
import { isApiFailure } from "~/api/errors";
import { Button } from "~/components/ui/button";

type TaskResult = Awaited<ReturnType<typeof readApprovalTaskResult>>;
interface IState { key: string; result: TaskResult | null; error: string; requestId?: string; retryable?: boolean; }

export function ReviewTaskPage()
{
    const { taskId } = useParams();
    const { status, user, generation } = useSession();
    const [reasonState, setReasonState] = useState({ scope: "", value: "" });
    const [acceptedScope, setAcceptedScope] = useState("");
    const scope = `${generation}:${user?.id}:${taskId}`;
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<IState | null>(null);
    const eligible = status === "authenticated" && !!user;
    const key = `${generation}:${user?.id ?? ""}:${taskId ?? ""}:${attempt}`;
    useEffect(() =>
    {
        if (!eligible || !taskId) return;
        const controller = new AbortController();
        setState({ key, result: null, error: "" });
        void readApprovalTaskResult(taskId, controller.signal, generation).then((result) =>
        {
            if (!controller.signal.aborted) setState({ key, result, error: "" });
        }).catch((failure: unknown) =>
        {
            if (!controller.signal.aborted)
            {
                const serverError = isApiFailure(failure) && failure.kind === "http" && [500, 503].includes(failure.status ?? 0);
                const retryable = isApiFailure(failure) && (failure.kind === "network" || serverError);
                setState({ key, result: null, error: retryable ? "Could not load this task. Please try again." : "This task is unavailable.", requestId: serverError ? failure.requestId : undefined, retryable });
            }
        });
        return () => controller.abort();
    }, [eligible, taskId, generation, key]);
    const current = eligible && state?.key === key ? state : null;
    const result = current?.result;
    const slots = result?.detail?.currentApprovers.filter((slot) => slot.stageNumber === result.detail?.currentStageNumber) ?? [];
    const validStage = result && result.detail?.currentStageNumber === result.task.stageNumber && slots.some((slot) => slot.slotId === result.task.slotId && slot.status === "ACTIONABLE");
    const savedReason = reasonState.scope === scope ? reasonState.value : "";
    const approved = slots.filter((slot) => slot.status === "APPROVED").length;
    return <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Review task</h1>
        {!eligible && status !== "loading" && status !== "idle" ? <p role="alert">This task is unavailable.</p> : result && !result.task.canCurrentUserDecide ? <><section aria-label="Handled task" className="space-y-3 rounded-lg border bg-card p-6"><h2 className="text-xl font-semibold">Read-only handled task</h2><p>Stage {result.task.stageNumber} · {approverSlotLabel(result.task.status)}</p><p>Only your handled decision is available here. Current request contents are not included.</p></section><AuditTimeline requestId={result.task.requestId} /></> : result && !validStage ? <div role="alert" className="space-y-3"><p>This task is unavailable.</p><Button onClick={() => setAttempt((value) => value + 1)}>Reload task</Button></div> : current?.error ? <div role="alert" className="space-y-3"><p>{current.error}</p>{current.requestId && <p className="select-text">Request ID: {current.requestId}</p>}{current.retryable && <Button onClick={() => setAttempt((value) => value + 1)}>Retry</Button>}</div> : result?.detail ? <>
            {acceptedScope !== scope && <section aria-label="Task summary" className="space-y-4 rounded-lg border bg-card p-6">
                <h2 className="text-xl font-semibold">Task summary</h2>
                <dl className="grid gap-4 sm:grid-cols-2">
                    <div><dt className="text-sm text-muted-foreground">Status</dt><dd>{result.task.status === "ACTIONABLE" ? "Actionable" : result.task.status}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Stage</dt><dd>{result.task.stageNumber}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Stage progress</dt><dd>{approved} of {slots.length} approved; {slots.length - approved} remaining</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Assigned reviewer</dt><dd>{result.task.assignedReviewer.displayName}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Due</dt><dd>{result.task.dueAt ? <time dateTime={result.task.dueAt}>{formatInstant(result.task.dueAt)}</time> : "No due date"}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Task version</dt><dd>{result.task.version}</dd></div>
                </dl>
            </section>}
            <DecisionActions key={`${generation}:${taskId}:${result.task.version}`} task={result.task} requestLabel={result.detail.requestNumber ?? result.detail.title} reason={reasonState.scope === scope ? reasonState.value : ""} onReason={(value) => setReasonState({ scope, value })} onAccepted={() => setAcceptedScope(scope)} onUnavailable={() => setState({ key, result: null, error: "This task is unavailable." })} onReload={() => setAttempt((value) => value + 1)} />
            {acceptedScope !== scope && <><RequestResult detail={result.detail} definition={result.definition} /><AuditTimeline requestId={result.task.requestId} /></>}
        </> : <p role="status">Loading task…</p>}
        {savedReason && (current?.error || result && !result.task.canCurrentUserDecide) && <section aria-label="Saved decision reason" className="space-y-3"><p>Saved reason: {savedReason}</p><Button onClick={() => setReasonState({ scope, value: "" })}>Discard saved reason</Button></section>}
    </div>;
}
