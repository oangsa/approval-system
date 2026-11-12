import type { PublishedRequestType, RequestDetail } from "@workflow/contracts";
import { requestPriorityLabel, requestStatusLabel, requestTypeLabel } from "./requestPresentation";

export interface IRequestResultProps { detail: RequestDetail; definition?: PublishedRequestType | null; }
interface IRequestStatusProps { status: RequestDetail["status"]; }
export function RequestStatus({ status }: IRequestStatusProps)
{
    const tones = { DRAFT: "bg-secondary text-secondary-foreground", PENDING: "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100", RETURNED: "bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-100", APPROVED: "bg-green-100 text-green-950 dark:bg-green-950 dark:text-green-100", REJECTED: "bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-100", WITHDRAWN: "bg-muted text-muted-foreground" };
    return <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-sm font-medium ${tones[status]}`}>{requestStatusLabel(status)}</span>;
}
export function RequestResult({ detail, definition }: IRequestResultProps)
{
    const revision = detail.submittedRevision ?? detail.workingRevision;
    return <section aria-label="Request result" className="space-y-5 rounded-lg border bg-card p-6">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3"><h2 className="min-w-0 wrap-anywhere text-xl font-semibold">{detail.title || "Untitled draft"}</h2><RequestStatus status={detail.status} /></div>
        <dl className="grid gap-4 sm:grid-cols-2"><div><dt className="text-sm text-muted-foreground">Request number</dt><dd className="font-medium">{detail.requestNumber ?? "Not assigned"}</dd></div><div><dt className="text-sm text-muted-foreground">Department</dt><dd>{detail.department?.name ?? "Not assigned"}</dd></div><div><dt className="text-sm text-muted-foreground">Priority</dt><dd>{requestPriorityLabel(detail.priority)}</dd></div><div><dt className="text-sm text-muted-foreground">Request type</dt><dd>{definition?.name.en ?? requestTypeLabel(detail.typeCode)}</dd></div></dl>
        <p className="whitespace-pre-wrap">{detail.justification}</p>
        {revision && <><dl className="space-y-2">{Object.entries(revision.fields).map(([key, value]) => <div key={key}><dt className="text-sm text-muted-foreground">{definition?.fields.find((field) => field.key === key)?.label.en ?? key.replace(/([A-Z])/g, " $1").replace(/^./, (value) => value.toUpperCase())}</dt><dd>{typeof value === "boolean" ? value ? "Yes" : "No" : definition?.fields.find((field) => field.key === key)?.constraints?.options?.find((option) => option.value === value)?.label.en ?? String(value)}</dd></div>)}</dl>
            {revision.lineItems.map((item) => <p key={item.id}>{item.description} · {item.quantity} × {item.unitAmount} = {item.totalAmount}</p>)}
            {revision.amount !== null && <p>Total: {revision.amount} {revision.currency}</p>}</>}
        <p className="text-sm text-muted-foreground">This is the saved server result. Submitted content is read-only.</p>
    </section>;
}
