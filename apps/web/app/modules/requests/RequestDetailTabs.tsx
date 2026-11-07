import { useRef, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router";
import type { PublishedRequestType, RequestDetail } from "@workflow/contracts";
import { RequestResult, RequestStatus } from "./RequestResult";
import { approverSlotLabel, requestPriorityLabel, requestTypeLabel } from "./requestPresentation";

const tabs = ["Overview", "Approval", "History", "Discussion / Files"] as const;
const tabKeys = ["overview", "approval", "history", "discussion"] as const;
interface IRequestDetailTabsProps { detail: RequestDetail; definition: PublishedRequestType | null; }
export function RequestDetailTabs({ detail, definition }: IRequestDetailTabsProps)
{
    const [params, setParams] = useSearchParams();
    const selected = Math.max(0, tabKeys.findIndex((key) => key === params.get("tab")));
    function setSelected(index: number)
    {
        setParams((current) =>
        {
            const next = new URLSearchParams(current);
            next.set("tab", tabKeys[index]!);
            return next;
        });
    }
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const stages = [...new Set(detail.currentApprovers.map((slot) => slot.stageNumber))].sort((a, b) => a - b);
    function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number)
    {
        let next = index;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else return;
        event.preventDefault();
        setSelected(next);
        refs.current[next]?.focus();
    }
    return <div className="space-y-6">
        <header className="space-y-2"><p className="text-sm text-muted-foreground">{detail.requestNumber ?? "Draft request"}</p><h1 className="wrap-anywhere text-2xl font-semibold">{detail.title || "Untitled draft"}</h1><RequestStatus status={detail.status} /><p>Type: {definition?.name.en ?? requestTypeLabel(detail.typeCode)} · Priority: {requestPriorityLabel(detail.priority)}</p><p>Requester: {detail.requester.displayName} · Department: {detail.department?.name ?? "No department"}</p><p>Updated: {new Date(detail.updatedAt).toLocaleString(undefined, { timeZone: "Asia/Bangkok" })}</p></header>
        <div role="tablist" aria-label="Request details" className="flex flex-wrap gap-1 border-b">{tabs.map((tab, index) => <button key={tab} ref={(node) =>
        {
            refs.current[index] = node;
        }} type="button" role="tab" id={`request-tab-${index}`} aria-controls={`request-panel-${index}`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={(event) => navigate(event, index)} className="min-h-11 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none aria-selected:border-primary">{tab}</button>)}</div>
        {tabs.map((tab, index) => <section key={tab} role="tabpanel" id={`request-panel-${index}`} aria-labelledby={`request-tab-${index}`} hidden={selected !== index} tabIndex={0}>
            {index === 0 && <RequestResult detail={detail} definition={definition} />}
            {index === 1 && <div className="space-y-3"><h2 className="text-lg font-semibold">Current approval</h2><p>{detail.currentStageNumber === null ? "No active stage" : `Stage ${detail.currentStageNumber} active`}</p>{detail.currentApprovers.length === 0 ? <p>No current approvers.</p> : stages.map((stage) =>
            {
                const slots = detail.currentApprovers.filter((slot) => slot.stageNumber === stage);
                const approved = slots.filter((slot) => slot.status === "APPROVED").length;
                return <section key={stage} aria-label={`Stage ${stage}`} className="space-y-2"><h3 className="font-medium">Stage {stage}{detail.currentStageNumber === stage ? " (active)" : ""}</h3><p>All approvers must approve · {approved} of {slots.length} approved</p><ul>{slots.map((slot) => <li key={slot.slotId}>{slot.reviewer.displayName} · {approverSlotLabel(slot.status)}</li>)}</ul></section>;
            })}</div>}
            {index === 2 && <p>History is not available yet.</p>}
            {index === 3 && <p>Discussion and files are not available yet.</p>}
        </section>)}
    </div>;
}
