import { RevisionHistory } from "./RevisionHistory";
import { RequestOwnerActions } from "./RequestOwnerActions";
import { ArrowLeft } from "lucide-react";
import { AuditTimeline } from "./AuditTimeline";
import { Link, useLocation, useSearchParams } from "react-router";
import { useSession } from "~/modules/auth/sessionContext";
import { useRef, type KeyboardEvent } from "react";
import type { PublishedRequestType, RequestDetail } from "@workflow/contracts";
import { resolveLocalizedText } from "@workflow/contracts";
import { PriorityBadge } from "~/components/status/PriorityBadge";
import { RequestResult, RequestStatus } from "./RequestResult";
import { preferredBrowserLocale, requestTypeLabel } from "./requestPresentation";
import { ApprovalTab } from "./ApprovalTab";

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
    const statusRef = useRef<HTMLSpanElement>(null);
    const locale = preferredBrowserLocale();
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
                <RequestStatus ref={statusRef} tabIndex={-1} status={detail.status} />
            </div>
            <dl className="grid gap-x-6 gap-y-4 border-t pt-5 wrap-anywhere sm:grid-cols-2 xl:grid-cols-3 [&_dd]:font-medium [&_dt]:text-sm [&_dt]:text-muted-foreground">
                <div><dt>Type</dt><dd>{definition ? resolveLocalizedText(definition.name, locale) : requestTypeLabel(detail.typeCode)}</dd></div>
                <div><dt>Priority</dt><dd><PriorityBadge priority={detail.priority} /></dd></div>
                <div><dt>Requester</dt><dd>{detail.requester.displayName}</dd></div>
                <div><dt>Department</dt><dd>{detail.department?.name ?? "No department"}</dd></div>
                <div><dt>Last updated</dt><dd><time dateTime={detail.updatedAt}>{new Date(detail.updatedAt).toLocaleString(undefined, { timeZone: "Asia/Bangkok" })}</time></dd></div>
            </dl>
            <RequestOwnerActions key={detail.id} detail={detail} onChanged={onChanged} onUnavailable={onUnavailable} onFocusFallback={() => statusRef.current?.focus()} />
        </header>
        <div role="tablist" aria-label="Request details" className="grid grid-cols-2 gap-1 rounded-lg border bg-muted/60 p-1 sm:flex sm:flex-wrap">{tabs.map((tab, index) => <button key={tab} ref={(node) =>
        {
            refs.current[index] = node;
        }} type="button" role="tab" id={`request-tab-${index}`} aria-controls={`request-panel-${index}`} aria-selected={selected === index} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={(event) => navigate(event, index)} className="min-h-11 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none aria-selected:bg-card aria-selected:text-foreground aria-selected:shadow-sm">{tab}</button>)}</div>
        {tabs.map((tab, index) => <section key={tab} role="tabpanel" id={`request-panel-${index}`} aria-labelledby={`request-tab-${index}`} hidden={selected !== index} tabIndex={0} className="rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
            {index === 0 && <RequestResult detail={detail} definition={definition} showSummary={false} />}
            {index === 1 && selected === 1 && <ApprovalTab detail={detail} />}
            {index === 2 && selected === 2 && <div className="space-y-6 rounded-xl border bg-card p-5 sm:p-8"><RevisionHistory key={`${detail.id}:${detail.version}`} detail={detail} definition={definition} /><AuditTimeline key={`${detail.id}:${detail.version}`} requestId={detail.id} /></div>}
            {index === 3 && <div className="space-y-2 rounded-xl border bg-card p-5 sm:p-8">
                <h2 className="text-lg font-semibold">Discussion / Files</h2>
                <p className="text-sm text-muted-foreground">Discussion and files are not available yet.</p>
            </div>}
        </section>)}
    </div>;
}
