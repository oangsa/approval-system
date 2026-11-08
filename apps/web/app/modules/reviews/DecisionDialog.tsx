import { useEffect, useRef } from "react";
import type { DecisionRequest } from "@workflow/contracts";
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
    const reject = decision === "REJECT";
    useEffect(() =>
    {
        const previous = document.activeElement;
        ref.current?.showModal();
        return () =>
        {
            ref.current?.close();
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
            if (!pending) onConfirm();
        }}>
            <h2 id="decision-title" className="text-xl font-semibold">{reject ? "Reject request?" : "Approve request?"}</h2>
            <p id="decision-context" className="wrap-anywhere">{requestLabel} · Stage {stageNumber}. {reject ? "This ends the approval cycle." : "Your approval is one required vote."}</p>
            <label className="block space-y-2"><span>Reason {reject ? "(required)" : "(optional)"}</span><Input autoFocus value={reason} required={reject} maxLength={4000} disabled={pending} onChange={(event) => onReason(event.target.value)} /></label>
            {reject && reason.length > 0 && !reason.trim() && <p role="alert">Enter a nonblank reason.</p>}
            {error && <p role="alert" className="select-text wrap-anywhere">{error}</p>}
            <div className="flex flex-wrap justify-end gap-3"><Button type="button" className="border px-4 py-2" disabled={pending} onClick={onCancel}>Cancel</Button><Button type="submit" className={reject ? "bg-destructive px-4 py-2 text-white" : "bg-primary px-4 py-2 text-primary-foreground"} disabled={pending || reject && !reason.trim()}>{pending ? "Saving…" : reject ? "Confirm rejection" : "Confirm approval"}</Button></div>
        </form>
    </dialog>;
}
