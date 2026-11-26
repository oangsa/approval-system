import { useEffect, useRef } from "react";
import type { DecisionRequest } from "@workflow/contracts";
import { decisionRequestSchema, decisionReasonMaximumLength } from "@workflow/contracts";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
interface IDecisionDialogProps
{
    decision: DecisionRequest["decision"]; requestLabel: string; stageNumber: number; reason: string; pending: boolean; error: string;
    onReason: (value: string) => void; onCancel: () => void; onConfirm: () => void;
}
export function DecisionDialog({ decision, requestLabel, stageNumber, reason, pending, error, onReason, onCancel, onConfirm }: IDecisionDialogProps)
{
    const ref = useRef<HTMLDialogElement>(null);
    const reasonRef = useRef<HTMLInputElement>(null);
    const reject = decision === "REJECT";
    const returning = decision === "RETURN";
    const validation = decisionRequestSchema.safeParse({ decision, reason, expectedVersion: 0 });
    const reasonError = validation.success ? "" : validation.error.issues.find((issue) => issue.path[0] === "reason")?.message ?? "";
    const showReasonError = reason.length > 0 && Boolean(reasonError);
    useEffect(() =>
    {
        const previous = document.activeElement;
        const panel = ref.current;
        panel?.showModal();
        reasonRef.current?.focus();
        return () =>
        {
            panel?.close();
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
        };
    }, []);
    return <dialog ref={ref} aria-labelledby="decision-title" aria-describedby="decision-context" onCancel={(event) =>
    {
        event.preventDefault();
        if (!pending) onCancel();
    }} className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-lg border bg-card p-6 text-card-foreground shadow-lg backdrop:bg-foreground/40 motion-safe:animate-in motion-safe:fade-in">
        <form className="space-y-4" onSubmit={(event) =>
        {
            event.preventDefault();
            if (!pending && validation.success) onConfirm();
        }}>
            <h2 id="decision-title" className="text-xl font-semibold">{reject ? "Reject request?" : returning ? "Return request?" : "Approve request?"}</h2>
            <p id="decision-context" className="wrap-anywhere">{requestLabel} · Stage {stageNumber}. {reject ? "This ends the approval cycle." : returning ? "The requester can revise this request. Resubmission restarts review with a new cycle." : "Your approval is one required vote."}</p>
            <label className="block space-y-2"><span>Reason {reject || returning ? "(required)" : "(optional)"}</span><Input ref={reasonRef} value={reason} required={reject || returning} aria-invalid={showReasonError} aria-describedby={`decision-reason-help${showReasonError ? " decision-reason-error" : ""}`} disabled={pending} onChange={(event) => onReason(event.target.value)} /></label>
            <p id="decision-reason-help" className="text-sm text-muted-foreground">{reason.trim().length} / {decisionReasonMaximumLength} characters after trimming surrounding whitespace (UTF-16 units). {reject ? "Minimum 10 characters for rejection." : returning ? "A correction reason is required." : "Reason is optional."}</p>
            {showReasonError && <p id="decision-reason-error" role="alert">{reasonError}</p>}
            {error && <p role="alert" className="select-text wrap-anywhere">{error}</p>}
            <div className="flex flex-wrap justify-end gap-3"><Button type="button" className="border px-4 py-2" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" className={reject ? "bg-destructive px-4 py-2 text-white" : "bg-primary px-4 py-2 text-primary-foreground"} disabled={pending || !validation.success}>{pending ? "Saving…" : reject ? "Confirm rejection" : returning ? "Confirm return" : "Confirm approval"}</Button></div>
        </form>
    </dialog>;
}
