import { RequestOwnerActions } from "./RequestOwnerActions";
import { ArrowLeft } from "lucide-react";
import { AuditTimeline } from "./AuditTimeline";
import { Link, useLocation, useSearchParams } from "react-router";
import { useSession } from "~/modules/auth/sessionContext";
import { useRef, type KeyboardEvent } from "react";
import type { PublishedRequestType, RequestDetail } from "@workflow/contracts";
import { RequestResult, RequestStatus } from "./RequestResult";
import { approverSlotLabel, requestPriorityLabel, requestTypeLabel } from "./requestPresentation";

const tabs = ["Overview", "Approval", "History", "Discussion / Files"] as const;
const tabKeys = ["overview", "approval", "history", "discussion"] as const;
interface IRequestDetailTabsProps { detail: RequestDetail; definition: PublishedRequestType | null; onChanged?: (detail: RequestDetail) => void; onUnavailable?: () => void; }
export function RequestDetailTabs({ detail, definition, onChanged, onUnavailable }: IRequestDetailTabsProps)
{
    const { user } = useSession();
    const { state } = useLocation();
    const requestListSearch: unknown = state?.requestListSearch;
    const [params, setParams] = useSearchParams();
    const selected = Math.max(0, tabKeys.findIndex((key) => key === params.get("tab")));
    function setSelected(index: number)
    {
        setParams((current) =>
        {
            const next = new URLSearchParams(current);
            next.set("tab", tabKeys[index]!);
            return next;
        }, { state });
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
        {user?.roles.includes("REQUESTER") && detail.requester.id === user.id && <Link to={{ pathname: "/requests", search: typeof requestListSearch === "string" ? requestListSearch : "" }} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring"><ArrowLeft aria-hidden="true" className="size-4" />My Requests</Link>}
        <header className="space-y-6 rounded-xl border bg-card p-5 sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                    <p className="text-sm font-medium tabular-nums text-muted-foreground">{detail.requestNumber ?? "Draft request"}</p>
                    <h1 className="wrap-anywhere text-3xl font-semibold tracking-tight sm:text-4xl">{detail.title || "Untitled draft"}</h1>
                </div>
                <RequestStatus status={detail.status} />
            </div>
            <dl className="grid gap-x-6 gap-y-4 border-t pt-5 wrap-anywhere sm:grid-cols-2 xl:grid-cols-3 [&_dd]:font-medium [&_dt]:text-sm [&_dt]:text-muted-foreground">
                <div><dt>Type</dt><dd>{definition?.name.en ?? requestTypeLabel(detail.typeCode)}</dd></div>
                <div><dt>Priority</dt><dd>{requestPriorityLabel(detail.priority)}</dd></div>
                <div><dt>Requester</dt><dd>{detail.requester.displayName}</dd></div>
                <div><dt>Department</dt><dd>{detail.department?.name ?? "No department"}</dd></div>
                <div><dt>Last updated</dt><dd><time dateTime={detail.updatedAt}>{new Date(detail.updatedAt).toLocaleString(undefined, { timeZone: "Asia/Bangkok" })}</time></dd></div>
            </dl>
            <RequestOwnerActions key={`${detail.id}:${detail.version}`} detail={detail} onChanged={onChanged} onUnavailable={onUnavailable} />
        </header>
        <div role="tablist" aria-label="Request details" className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/60 p-1 sm:flex sm:flex-wrap">{tabs.map((tab, index) => <button key={tab} ref={(node) =>
        {
            refs.current[index] = node;
        }} type="button" role="tab" id={`request-tab-${index}`} aria-controls={`request-panel-${index}`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={(event) => navigate(event, index)} className="min-h-11 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none aria-selected:bg-card aria-selected:text-foreground aria-selected:shadow-sm">{tab}</button>)}</div>
        {tabs.map((tab, index) => <section key={tab} role="tabpanel" id={`request-panel-${index}`} aria-labelledby={`request-tab-${index}`} hidden={selected !== index} tabIndex={0} className="rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
            {index === 0 && <RequestResult detail={detail} definition={definition} showSummary={false} />}
            {index === 1 && <div className="space-y-5 rounded-xl border bg-card p-5 sm:p-8">
                <div className="space-y-1">
                    <h2 className="text-lg font-semibold">Current approval</h2>
                    <p className="text-sm text-muted-foreground">{detail.currentStageNumber === null ? "No active stage" : `Stage ${detail.currentStageNumber} active`}</p>
                </div>
                {detail.currentApprovers.length === 0 ? <p className="border-t pt-5 text-sm text-muted-foreground">No current approvers.</p> : stages.map((stage) =>
                {
                    const slots = detail.currentApprovers.filter((slot) => slot.stageNumber === stage);
                    const approved = slots.filter((slot) => slot.status === "APPROVED").length;
                    return <section key={stage} aria-label={`Stage ${stage}`} className="space-y-3 rounded-lg border p-4 sm:p-5">
                        <h3 className="font-semibold">Stage {stage}{detail.currentStageNumber === stage ? " (active)" : ""}</h3>
                        <p className="text-sm text-muted-foreground">All approvers must approve · {approved} of {slots.length} approved</p>
                        <ul className="divide-y border-t">{slots.map((slot) => <li key={slot.slotId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
                            <span className="min-w-0 flex-1 font-medium wrap-anywhere">{slot.reviewer.displayName}</span>
                            <span className="text-muted-foreground">{approverSlotLabel(slot.status)}</span>
                            {slot.status === "ACTIONABLE" && slot.reviewer.id === user?.id && <Link className="text-primary underline underline-offset-4" to={`/reviews/${slot.slotId}`}>Review task</Link>}
                        </li>)}</ul>
                    </section>;
                })}
            </div>}
            {index === 2 && selected === 2 && <div className="rounded-xl border bg-card p-5 sm:p-8"><AuditTimeline requestId={detail.id} /></div>}
            {index === 3 && <div className="space-y-2 rounded-xl border bg-card p-5 sm:p-8">
                <h2 className="text-lg font-semibold">Discussion / Files</h2>
                <p className="text-sm text-muted-foreground">Discussion and files are not available yet.</p>
            </div>}
        </section>)}
    </div>;
}
