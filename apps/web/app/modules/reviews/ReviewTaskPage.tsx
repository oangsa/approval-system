import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useSession } from "~/modules/auth/sessionContext";
import { RequestResult } from "~/modules/requests/RequestResult";
import { readApprovalTaskResult } from "~/services/approvalTaskService";
import { isApiFailure } from "~/api/errors";
import { Button } from "~/components/ui/button";

type TaskResult = Awaited<ReturnType<typeof readApprovalTaskResult>>;
interface IState { key: string; result: TaskResult | null; error: string; }

export function ReviewTaskPage()
{
    const { taskId } = useParams();
    const { status, user, generation } = useSession();
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<IState | null>(null);
    const eligible = status === "authenticated" && !!user?.roles.includes("REVIEWER");
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
                const denied = !isApiFailure(failure) || [401, 403, 404].includes(failure.status ?? 0);
                setState({ key, result: null, error: denied ? "This task is unavailable." : "Could not load this task. Please try again." });
            }
        });
        return () => controller.abort();
    }, [eligible, taskId, generation, key]);
    const current = eligible && state?.key === key ? state : null;
    const result = current?.result;
    const slots = result?.detail.currentApprovers.filter((slot) => slot.stageNumber === result.detail.currentStageNumber) ?? [];
    const validStage = result && result.detail.currentStageNumber === result.task.stageNumber && slots.some((slot) => slot.slotId === result.task.slotId && slot.status === "ACTIONABLE");
    const approved = slots.filter((slot) => slot.status === "APPROVED").length;
    return <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold">Review task</h1>
        {!eligible && status !== "loading" && status !== "idle" || result && !validStage ? <p role="alert">This task is unavailable.</p> : current?.error ? <div role="alert" className="space-y-3"><p>{current.error}</p><Button onClick={() => setAttempt((value) => value + 1)}>Retry</Button></div> : result ? <>
            <section aria-label="Task summary" className="space-y-4 rounded-lg border bg-card p-6">
                <h2 className="text-xl font-semibold">Task summary</h2>
                <dl className="grid gap-4 sm:grid-cols-2">
                    <div><dt className="text-sm text-muted-foreground">Status</dt><dd>{result.task.status === "ACTIONABLE" ? "Actionable" : result.task.status}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Stage</dt><dd>{result.task.stageNumber}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Stage progress</dt><dd>{approved} of {slots.length} approved; {slots.length - approved} remaining</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Assigned reviewer</dt><dd>{result.task.assignedReviewer.displayName}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Due</dt><dd>{result.task.dueAt ? <time dateTime={result.task.dueAt}>{new Date(result.task.dueAt).toLocaleString()}</time> : "No due date"}</dd></div>
                    <div><dt className="text-sm text-muted-foreground">Task version</dt><dd>{result.task.version}</dd></div>
                </dl>
            </section>
            <RequestResult detail={result.detail} definition={result.definition} />
        </> : <p role="status">Loading task…</p>}
    </div>;
}
