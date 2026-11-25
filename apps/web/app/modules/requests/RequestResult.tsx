import type { Ref } from "react";
import { resolveLocalizedText, type PublishedRequestType, type RequestDetail } from "@workflow/contracts";
import { LineItemsSummary } from "~/components/forms/LineItemsEditor";
import { PriorityBadge } from "~/components/status/PriorityBadge";
import { preferredBrowserLocale, requestStatusLabel, requestTypeLabel } from "./requestPresentation";

export interface IRequestResultProps { detail: RequestDetail; definition?: PublishedRequestType | null; showSummary?: boolean; }
interface IRequestStatusProps { status: RequestDetail["status"]; ref?: Ref<HTMLSpanElement>; tabIndex?: number; }
export function RequestStatus({ status, ref, tabIndex }: IRequestStatusProps)
{
    const tones = { DRAFT: "bg-secondary text-secondary-foreground", PENDING: "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100", RETURNED: "bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-100", APPROVED: "bg-green-100 text-green-950 dark:bg-green-950 dark:text-green-100", REJECTED: "bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-100", WITHDRAWN: "bg-muted text-muted-foreground" };
    return <span ref={ref} tabIndex={tabIndex} className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tones[status]}`}>{requestStatusLabel(status)}</span>;
}
export function RequestResult({ detail, definition, showSummary = true }: IRequestResultProps)
{
    const revision = detail.submittedRevision ?? detail.workingRevision;
    const SectionHeading = showSummary ? "h3" : "h2";
    const fields = Object.entries(revision?.fields ?? {});
    const locale = preferredBrowserLocale();
    return <section aria-label="Request result" className="divide-y rounded-xl border bg-card px-5 wrap-anywhere sm:px-8">
        {showSummary && <div className="space-y-4 py-5 sm:py-6">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                <h2 className="min-w-0 text-xl font-semibold">{detail.title || "Untitled draft"}</h2><RequestStatus status={detail.status} />
            </div>
            <dl className="grid gap-4 sm:grid-cols-2 [&_dt]:text-sm [&_dt]:text-muted-foreground">
                <div><dt>Request number</dt><dd>{detail.requestNumber ?? "Not assigned"}</dd></div>
                <div><dt>Department</dt><dd>{detail.department?.name ?? "Not assigned"}</dd></div>
                <div><dt>Priority</dt><dd><PriorityBadge priority={detail.priority} /></dd></div>
                <div><dt>Request type</dt><dd>{definition ? resolveLocalizedText(definition.name, locale) : requestTypeLabel(detail.typeCode)}</dd></div>
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
                const option = field?.constraints?.options?.find((candidate) => candidate.value === value);
                return <div key={key}>
                    <dt className="text-sm text-muted-foreground">{field ? resolveLocalizedText(field.label, locale) : key.replace(/([A-Z])/g, " $1").replace(/^./, (initial) => initial.toUpperCase())}</dt>
                    <dd>{typeof value === "boolean" ? value ? "Yes" : "No" : option ? resolveLocalizedText(option.label, locale) : String(value)}</dd>
                </div>;
            })}</dl>
        </div>}
        {revision && (revision.lineItems.length > 0 || revision.amount !== null) && <div className="space-y-3 py-5 sm:py-6">
            <SectionHeading className="font-semibold">{revision.lineItems.length ? "Line items" : "Amount"}</SectionHeading>
            <LineItemsSummary items={revision.lineItems} amount={revision.amount} currency={revision.currency} locale={locale} />
        </div>}
    </section>;
}
