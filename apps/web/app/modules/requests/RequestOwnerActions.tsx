import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { RequestDetail, RequestSummary } from "@workflow/contracts";
import { isApiFailure } from "~/api/errors";
import { ActionButton, actionStyles } from "~/components/actions/ActionButton";
import { Input } from "~/components/ui/input";
import { useSession } from "~/modules/auth/sessionContext";
import { readRequestState, WithdrawalAttempt } from "~/services/requestService";
import { presentFailure, requestStatusLabel } from "./requestPresentation";

interface IRequestOwnerActionsProps
{
    detail: RequestSummary & { availableActions?: RequestDetail["availableActions"] };
    onChanged?: (detail: RequestDetail) => void;
    onUnavailable?: () => void;
}
export function RequestOwnerActions({ detail, onChanged, onUnavailable }: IRequestOwnerActionsProps)
{
    const { user, generation } = useSession();
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [conflict, setConflict] = useState(false);
    const [latest, setLatest] = useState<RequestDetail | null>(null);
    const dialog = useRef<HTMLDialogElement>(null);
    const attempt = useRef(new WithdrawalAttempt());
    const current = latest ?? detail;
    const canEdit = current.status === "DRAFT" && (current.availableActions === undefined || current.availableActions.includes("EDIT_DRAFT"));
    const canWithdraw = current.status === "PENDING" && (current.availableActions === undefined || current.availableActions.includes("WITHDRAW"));
    useEffect(() =>
    {
        if (!open) return;
        const previous = document.activeElement;
        const panel = dialog.current;
        panel?.showModal();
        return () =>
        {
            panel?.close();
            if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
        };
    }, [open]);
    if (detail.requester.id !== user?.id || !user.roles.includes("REQUESTER")) return null;
    function close()
    {
        if (busy) return;
        setOpen(false);
        if (latest) onChanged?.(latest);
    }
    async function withdraw()
    {
        if (busy || conflict || !canWithdraw) return;
        setBusy(true);
        setError("");
        try
        {
            const result = await attempt.current.Submit(detail.id, { expectedVersion: current.version, ...(reason ? { reason } : {}) }, generation);
            setLatest(result);
            setOpen(false);
            onChanged?.(result);
        }
        catch (failure)
        {
            const view = presentFailure(failure, "Withdrawal failed. Retry the unchanged action safely; your reason is preserved.");
            setError(view.requestId ? `${view.message} Request ID: ${view.requestId}` : view.message);
            setConflict(isApiFailure(failure) && failure.status === 409);
            if (isApiFailure(failure) && [401, 403, 404].includes(failure.status ?? 0)) onUnavailable?.();
        }
        finally
        {
            setBusy(false);
        }
    }
    async function reload()
    {
        if (busy) return;
        setBusy(true);
        try
        {
            const result = await readRequestState(detail.id, generation);
            setLatest(result);
            setConflict(false);
            setError(`Current server status: ${requestStatusLabel(result.status)}. ${result.status === "PENDING" ? "Review before confirming withdrawal again." : "This request can no longer be withdrawn."}`);
        }
        catch (failure)
        {
            const view = presentFailure(failure, "Could not reload request. Your reason is preserved.");
            setError(view.requestId ? `${view.message} Request ID: ${view.requestId}` : view.message);
            if (view.terminal) onUnavailable?.();
        }
        finally
        {
            setBusy(false);
        }
    }
    return <div className="flex flex-wrap items-center gap-2">
        {canEdit && <Link className={actionStyles({ size: "small" })} to={`/requests/${detail.id}/edit`}>Resume draft</Link>}
        {canWithdraw && <ActionButton type="button" size="small" variant="danger" onClick={() => setOpen(true)}>Withdraw</ActionButton>}
        {open && <dialog ref={dialog} aria-labelledby={`withdraw-title-${detail.id}`} onCancel={(event) =>
        {
            event.preventDefault();
            close();
        }} className="m-auto w-[calc(100%-2rem)] max-w-lg space-y-4 rounded-xl border bg-card p-6 text-card-foreground shadow-lg backdrop:bg-foreground/40">
            <form className="space-y-4" aria-busy={busy} onSubmit={(event) =>
            {
                event.preventDefault();
                void withdraw();
            }}>
                <h2 id={`withdraw-title-${detail.id}`} className="text-xl font-semibold">Withdraw request?</h2>
                <p className="wrap-anywhere">{detail.requestNumber} · {detail.title}. Withdrawal ends pending review. Previous decisions remain in history.</p>
                <label className="block space-y-2"><span>Reason (optional)</span><Input autoFocus value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
                {error && <p role="alert" className="select-text wrap-anywhere">{error}</p>}
                {conflict && <ActionButton type="button" disabled={busy} onClick={() => void reload()}>Reload request</ActionButton>}
                <div className="flex flex-wrap justify-end gap-3"><ActionButton type="button" disabled={busy} onClick={close}>Cancel</ActionButton><ActionButton type="submit" variant="danger" disabled={busy || conflict || !canWithdraw}>{busy ? "Withdrawing…" : "Confirm withdrawal"}</ActionButton></div>
            </form>
        </dialog>}
    </div>;
}
