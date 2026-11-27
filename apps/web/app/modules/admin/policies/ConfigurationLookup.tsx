import { useEffect, useState } from "react";
import { type IPageResult } from "@workflow/contracts";
import { ActionButton } from "~/components/actions/ActionButton";
import { CollectionDialog } from "~/components/collections/CollectionDialog";
import { RequestCollection } from "~/components/collections/RequestCollection";
import { Input } from "~/components/ui/input";
import { useSession } from "~/modules/auth/sessionContext";
import { configurationFailure, lookupConfiguration, lookupSelection, type ISelection, type LookupKind } from "~/services/configurationService";
interface IConfigurationLookupProps
{
    label: string; kind: LookupKind; values: string[]; multiple?: boolean; optional?: boolean; emptyLabel?: string;
    onChange(values: string[]): void;
}
export function ConfigurationLookup({ label, kind, values, multiple = false, optional = false, emptyLabel = "All departments", onChange }: IConfigurationLookupProps)
{
    const { generation } = useSession();
    const [open, setOpen] = useState(false);
    const [labels, setLabels] = useState<ISelection[]>([]);
    const [selected, setSelected] = useState<string[]>([]);
    const [input, setInput] = useState("");
    const [term, setTerm] = useState("");
    const [page, setPage] = useState(1);
    const [result, setResult] = useState<IPageResult<ISelection> | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);
    const identities = JSON.stringify(values);
    useEffect(() =>
    {
        const controller = new AbortController();
        setLabels([]);
        void Promise.all((JSON.parse(identities) as string[]).map((id) => lookupSelection(kind, id, controller.signal, generation).catch(() => ({ id, label: "Unavailable selection — choose again" })))).then((items) =>
        {
            if (!controller.signal.aborted) setLabels(items);
        });
        return () => controller.abort();
    }, [kind, identities, generation]);
    useEffect(() =>
    {
        const timer = setTimeout(() =>
        {
            setTerm(input.trim()); setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [input]);
    useEffect(() =>
    {
        if (!open) return;
        const controller = new AbortController();
        setLoading(true); setError("");
        void lookupConfiguration(kind, term, page, controller.signal, generation).then((next) =>
        {
            if (!controller.signal.aborted) setResult(next);
        }).catch((failure: unknown) =>
        {
            if (!controller.signal.aborted) setError(configurationFailure(failure));
        }).finally(() =>
        {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [open, kind, term, page, generation, retry]);
    function choose(item: ISelection)
    {
        if (!multiple)
        {
            onChange([item.id]); setOpen(false); return;
        }
        setSelected((previous) => previous.includes(item.id) ? previous.filter((id) => id !== item.id) : [...previous, item.id]);
    }
    function selection(item: ISelection)
    {
        return <ActionButton type="button" aria-pressed={multiple ? selected.includes(item.id) : undefined} disabled={loading || input.trim() !== term} onClick={() => choose(item)}>{multiple && selected.includes(item.id) ? "Remove" : "Select"} {item.label}</ActionButton>;
    }
    return <div className="space-y-2">
        <p className="text-sm font-medium">{label}</p>
        <p className="break-words text-sm text-muted-foreground">{values.length ? labels.length ? labels.map((item) => item.label).join(", ") : "Loading selection…" : optional ? emptyLabel : "No selection"}</p>
        <div className="flex flex-wrap gap-2"><ActionButton type="button" onClick={() =>
        {
            setSelected(values); setInput(""); setTerm(""); setPage(1); setOpen(true);
        }}>Choose {label.toLowerCase()}</ActionButton>{(optional || multiple) && values.length > 0 && <ActionButton type="button" onClick={() => onChange([])}>Clear {label.toLowerCase()}</ActionButton>}</div>
        {open && <CollectionDialog title={`Choose ${label.toLowerCase()}`} description="Search eligible configuration metadata. Selection does not grant access to requests." onClose={() => setOpen(false)}>
            <div className="space-y-4 p-6">
                <label className="grid gap-2 text-sm">Search {label.toLowerCase()}<Input value={input} onChange={(event) => setInput(event.target.value)} /></label>
                <RequestCollection items={result?.items ?? []} pagination={result?.pagination ?? null} loading={loading} error={error} columns={["Name", "Select"]} emptyMessage="No eligible matches." onRetry={() => setRetry((value) => value + 1)} onPageChange={setPage} renderDesktopRow={(item) => <><td className="p-3">{item.label}</td><td className="p-3">{selection(item)}</td></>} renderMobileCard={(item) => <div>{selection(item)}</div>} />
                {multiple && <div className="flex flex-wrap justify-end gap-2"><p className="text-sm">{selected.length} selected</p><ActionButton type="button" onClick={() => setOpen(false)}>Cancel</ActionButton><ActionButton type="button" variant="primary" disabled={!selected.length || selected.length > 50} onClick={() =>
                {
                    onChange(selected); setOpen(false);
                }}>Apply selection</ActionButton></div>}
            </div>
        </CollectionDialog>}
    </div>;
}
