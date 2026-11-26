import type { ApproverSummary } from "@workflow/contracts";
import { Link } from "react-router";
import { approverSlotLabel } from "./requestPresentation";

interface IApprovalProgressProps
{
    approvers: ApproverSummary[];
    currentStageNumber: number | null;
    userId?: string;
}

export function ApprovalProgress({ approvers, currentStageNumber, userId }: IApprovalProgressProps)
{
    const stages = [...new Set(approvers.map((slot) => slot.stageNumber))].sort((a, b) => a - b);
    if (!stages.length) return <p className="border-t pt-5 text-sm text-muted-foreground">No current approvers.</p>;
    return <div className="space-y-4">{stages.map((stage) =>
    {
        const slots = approvers.filter((slot) => slot.stageNumber === stage);
        const approved = slots.filter((slot) => slot.status === "APPROVED").length;
        const state = slots.every((slot) => slot.status === "APPROVED") ? "completed" : slots.some((slot) => slot.status === "ACTIONABLE") && currentStageNumber === stage ? "active" : slots.every((slot) => slot.status === "WAITING") ? "waiting" : "cancelled";
        return <section key={stage} aria-label={`Stage ${stage}`} className="space-y-3 rounded-lg border p-4 sm:p-5">
            <h3 className="font-semibold">Stage {stage} ({state})</h3>
            <p className="text-sm tabular-nums text-muted-foreground">All approvers must approve · {approved} of {slots.length} approved; {slots.length - approved} remaining</p>
            <ul className="divide-y border-t">{slots.map((slot) => <li key={slot.slotId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
                <span className="min-w-0 flex-1 font-medium wrap-anywhere">{slot.reviewer.displayName}</span>
                <span className="text-muted-foreground">{approverSlotLabel(slot.status)}</span>
                {slot.status === "ACTIONABLE" && slot.reviewer.id === userId && <Link className="text-primary underline underline-offset-4" to={`/reviews/${slot.slotId}`}>Review task</Link>}
            </li>)}</ul>
        </section>;
    })}</div>;
}
