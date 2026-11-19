import type { PublishedRequestType, RequestDetail } from "@workflow/contracts";
import { requestPriorityLabel, requestStatusLabel, requestTypeLabel } from "./requestPresentation";

export interface IRequestResultProps { detail: RequestDetail; definition?: PublishedRequestType | null; showSummary?: boolean; }
interface IRequestStatusProps { status: RequestDetail["status"]; }
export function RequestStatus({ status }: IRequestStatusProps)
{
    const tones = { DRAFT: "bg-secondary text-secondary-foreground", PENDING: "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100", RETURNED: "bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-100", APPROVED: "bg-green-100 text-green-950 dark:bg-green-950 dark:text-green-100", REJECTED: "bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-100", WITHDRAWN: "bg-muted text-muted-foreground" };
    return <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-sm font-medium ${tones[status]}`}>{requestStatusLabel(status)}</span>;
}
export function RequestResult({ detail, definition, showSummary = true }: IRequestResultProps)
{
    const revision = detail.submittedRevision ?? detail.workingRevision;
    const SectionHeading = showSummary ? "h3" : "h2";
    const fields = Object.entries(revision?.fields ?? {});
    return <section aria-label="Request result" className="divide-y rounded-xl border bg-card px-5 wrap-anywhere sm:px-8">
        {showSummary && <div className="space-y-4 py-5 sm:py-6">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <h2 className="min-w-0 text-xl font-semibold">{detail.title || "Untitled draft"}</h2><RequestStatus status={detail.status} />
            </div>
            <dl className="grid gap-4 sm:grid-cols-2 [&_dt]:text-sm [&_dt]:text-muted-foreground">
                <div><dt>Request number</dt><dd>{detail.requestNumber ?? "Not assigned"}</dd></div>
                <div><dt>Department</dt><dd>{detail.department?.name ?? "Not assigned"}</dd></div>
                <div><dt>Priority</dt><dd>{requestPriorityLabel(detail.priority)}</dd></div>
                <div><dt>Request type</dt><dd>{definition?.name.en ?? requestTypeLabel(detail.typeCode)}</dd></div>
            </dl>
        </div>}
        <div className="space-y-2 py-5 sm:py-6">
            <SectionHeading className="font-semibold">Justification</SectionHeading>
            <p className="max-w-prose leading-relaxed whitespace-pre-wrap">{detail.justification || "No justification provided."}</p>
        </div>
        {fields.length > 0 && <div className="space-y-4 py-5 sm:py-6">
            <SectionHeading className="font-semibold">Request details</SectionHeading>
            <dl className="grid gap-4 sm:grid-cols-2">{fields.map(([key, value]) =>
            {
                const field = definition?.fields.find((candidate) => candidate.key === key);
                return <div key={key}>
                    <dt className="text-sm text-muted-foreground">{field?.label.en ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (initial) => initial.toUpperCase())}</dt>
                    <dd>{typeof value === "boolean" ? value ? "Yes" : "No" : field?.constraints?.options?.find((option) => option.value === value)?.label.en ?? String(value)}</dd>
                </div>;
            })}</dl>
        </div>}
        {revision && (revision.lineItems.length > 0 || revision.amount !== null) && <div className="space-y-3 py-5 sm:py-6">
            <SectionHeading className="font-semibold">{revision.lineItems.length ? "Line items" : "Amount"}</SectionHeading>
            {revision.lineItems.length > 0 && <ul className="divide-y">{revision.lineItems.map((item) => <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-2">
                <p className="min-w-0 font-medium">{item.description}</p>
                <p className="text-sm tabular-nums text-muted-foreground">{item.quantity} × {item.unitAmount} = {item.totalAmount}</p>
            </li>)}</ul>}
            {revision.amount !== null && <p className="font-medium tabular-nums">Total: {revision.amount} {revision.currency}</p>}
        </div>}
    </section>;
}
