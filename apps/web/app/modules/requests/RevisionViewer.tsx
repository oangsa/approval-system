import { resolveLocalizedText, type PublishedRequestType, type RequestRevision } from "@workflow/contracts";
import { LineItemsSummary } from "~/components/forms/LineItemsEditor";
import { formatInstant } from "~/modules/reviews/formatDue";
import { preferredBrowserLocale } from "./requestPresentation";

interface IRevisionViewerProps { revision: RequestRevision; definition?: PublishedRequestType | null; cycleId?: string; }
export function RevisionViewer({ revision, definition, cycleId }: IRevisionViewerProps)
{
    const locale = preferredBrowserLocale();
    return <section aria-label="Revision snapshot" className="space-y-4 rounded-lg border p-4 wrap-anywhere">
        <h3 className="font-semibold">Revision {revision.revisionNumber}</h3>
        <p className="text-sm text-muted-foreground">Form version: {definition?.versionId === revision.formDefinitionVersionId ? definition.versionNumber : revision.formDefinitionVersionId}{cycleId && <> · Cycle: {cycleId}</>}</p>
        {revision.submittedAt && <p className="text-sm text-muted-foreground">Submitted <time dateTime={revision.submittedAt}>{formatInstant(revision.submittedAt)}</time></p>}
        <dl className="grid gap-4 sm:grid-cols-2">{Object.entries(revision.fields).map(([key, value]) =>
        {
            const field = definition?.fields.find((candidate) => candidate.key === key);
            const option = field?.constraints?.options?.find((candidate) => candidate.value === value);
            return <div key={key}><dt className="text-sm text-muted-foreground">{field ? resolveLocalizedText(field.label, locale) : key}</dt><dd>{typeof value === "boolean" ? value ? "Yes" : "No" : option ? resolveLocalizedText(option.label, locale) : String(value ?? "—")}</dd></div>;
        })}</dl>
        {(revision.lineItems.length > 0 || revision.amount !== null) && <LineItemsSummary items={revision.lineItems} amount={revision.amount} currency={revision.currency} locale={locale} />}
    </section>;
}
