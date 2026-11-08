import { useEffect, useRef, useState } from "react";
import type { ApprovalTask, DecisionRequest } from "@workflow/contracts";
import { useSession } from "~/modules/auth/sessionContext";
import { DecisionAttempt } from "~/services/decisionService";
import { refreshAfterDecision } from "~/services/approvalTaskService";
import { isApiFailure } from "~/api/errors";
import { Button } from "~/components/ui/button";
import { AuditTimeline } from "~/modules/requests/AuditTimeline";
import { DecisionDialog } from "./DecisionDialog";
interface IDecisionActionsProps { task: ApprovalTask; requestLabel: string; onReload: () => void; reason: string; onReason: (value: string) => void; onAccepted: () => void; onUnavailable: () => void; }
export function DecisionActions({ task, requestLabel, onReload, reason, onReason, onAccepted, onUnavailable }: IDecisionActionsProps)
{
    const { generation } = useSession();
    const [decision, setDecision] = useState<DecisionRequest["decision"] | null>(null);
    const [pending, setPending] = useState(false);
    const [stale, setStale] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState<Awaited<ReturnType<typeof refreshAfterDecision>> | null>(null);
    const attempt = useRef(new DecisionAttempt());
    const busy = useRef(false);
    const alive = useRef(true);
    useEffect(() =>
    {
        alive.current = true;
        return () =>
{
 alive.current = false;
};
    }, []);
    async function confirm()
    {
        if (!decision || busy.current || stale) return;
        busy.current = true;
        setPending(true);
        setError("");
        try
        {
            const accepted = await attempt.current.Submit(task.id, { decision, ...(reason.trim() ? { reason: reason.trim() } : {}), expectedVersion: task.version }, generation);
            // Once accepted, never offer a fresh mutation because a subsequent read failed.
            if (!alive.current) return;
            setDecision(null);
            onAccepted();
            const result = await refreshAfterDecision(task, accepted, generation);
            if (alive.current) setSuccess(result);
        }
        catch (failure)
        {
            if (!alive.current) return;
            if (isApiFailure(failure) && [403, 404].includes(failure.status ?? 0))
            {
                setDecision(null);
                setStale(true);
                onUnavailable();
            }
            else if (isApiFailure(failure) && failure.status === 409)
            {
                setStale(true);
                setDecision(null);
            }
            else
            {
                const support = isApiFailure(failure) && [500, 503].includes(failure.status ?? 0) && failure.requestId ? ` Request ID: ${failure.requestId}` : "";
                setError(`Could not confirm the decision. Retry the unchanged action safely.${support}`);
            }
        }
        finally
        {
            busy.current = false;
            if (alive.current) setPending(false);
        }
    }
    const currentStage = success?.detail ? success.detail.currentStageNumber : success?.decision.currentStageNumber;
    if (success) return <section className="space-y-4"><p role="status">Decision recorded. Request status: {success.detail?.status ?? success.decision.requestStatus}. Current stage: {currentStage === null ? "No active stage" : `Stage ${currentStage}`}. {success.refreshFailed && "Some current data could not be refreshed. Reload before any further action."}</p><AuditTimeline requestId={task.requestId} /></section>;
    return <section aria-label="Decision actions" className="space-y-3">
        {stale ? <div role="alert"><p>This task changed. Your reason has been retained. Reload before deciding again.</p>{reason && <p>Saved reason: {reason}</p>}<Button onClick={onReload}>Reload task</Button></div> : <div className="flex flex-wrap gap-3"><Button disabled={pending} onClick={() => setDecision("APPROVE")}>Approve</Button><Button className="bg-destructive px-4 py-2 text-white" disabled={pending} onClick={() => setDecision("REJECT")}>Reject</Button></div>}
        {decision && <DecisionDialog decision={decision} requestLabel={requestLabel} stageNumber={task.stageNumber} reason={reason} pending={pending} error={error} onReason={onReason} onCancel={() => setDecision(null)} onConfirm={() => void confirm()} />}
    </section>;
}
