import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { searchRequestTypes } from "~/services/requestService";
import { presentFailure } from "./requestPresentation";

interface IRequestTypeFilterProps
{
    value: string;
    generation: number;
    onChange(value: string): void;
}

export function RequestTypeFilter({ value, generation, onChange }: IRequestTypeFilterProps)
{
    const id = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState("");
    const [term, setTerm] = useState("");
    const [page, setPage] = useState(1);
    const [attempt, setAttempt] = useState(0);
    const [selection, setSelection] = useState<{ id: string; label: string } | null>(null);
    const key = `${generation}:${term}:${page}:${attempt}`;
    const [state, setState] = useState<{ key: string; result?: Awaited<ReturnType<typeof searchRequestTypes>>; error?: ReturnType<typeof presentFailure> } | null>(null);
    useEffect(() =>
    {
        const timer = setTimeout(() =>
        {
            setTerm(input.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [input]);
    useEffect(() =>
    {
        if (!open) return;
        const controller = new AbortController();
        searchRequestTypes(term, page, controller.signal, generation).then((result) =>
        {
            if (!controller.signal.aborted) setState({ key, result });
        }).catch((error: unknown) =>
        {
            if (!controller.signal.aborted) setState({ key, error: presentFailure(error, "Could not load request types.") });
        });
        return () => controller.abort();
    }, [open, key, term, page, generation]);
    const current = state?.key === key && input.trim() === term ? state : null;
    const selectedLabel = selection?.id === value ? selection.label : "Selected request type";
    return <div className="space-y-2 sm:col-span-2">
        <div className="flex items-center justify-between"><span id={`${id}-label`} className="text-sm font-medium">Request type</span>{value && <Button type="button" className="px-2 py-1 text-xs underline" onClick={() => onChange("")}>Clear request type</Button>}</div>
        <Button ref={trigger} type="button" className="flex min-h-11 w-full items-center justify-between gap-2 border px-3 py-2 text-left hover:bg-secondary" aria-labelledby={`${id}-label ${id}-value`} aria-expanded={open} aria-controls={`${id}-options`} onClick={() =>
        {
            setState(null);
            setOpen((current) => !current);
        }}><span id={`${id}-value`} className="truncate">{value ? selectedLabel : "All request types"}</span><ChevronDown aria-hidden="true" className="size-4 shrink-0" /></Button>
        {open && <div id={`${id}-options`} className="space-y-3 rounded-md border p-3">
            <label className="grid gap-1 text-sm">Search request types<Input value={input} maxLength={100} onChange={(event) => setInput(event.target.value)} placeholder="Type name or code…" /></label>
            {!current && <p role="status" className="text-sm text-muted-foreground">Loading request types…</p>}
            {current?.error && <div role="alert" className="text-sm"><p>{current.error.message}</p>{!current.error.terminal && <Button className="mt-2 border px-3 py-2" type="button" onClick={() => setAttempt((value) => value + 1)}>Retry request types</Button>}</div>}
            {current?.result && <>
                <p className="text-xs text-muted-foreground">Enabled published types only. A previous selection may be unavailable; clear it or choose another type.</p>
                {!current.result.items.length && <p className="text-sm">No request types match.</p>}
                <ul className="max-h-44 space-y-1 overflow-y-auto">{current.result.items.map((type) => <li key={type.id}><Button type="button" className="w-full px-3 py-2 text-left hover:bg-secondary" onClick={() =>
                {
                    setSelection({ id: type.id, label: `${type.name.en} (${type.code})` });
                    onChange(type.id);
                    setOpen(false);
                    trigger.current?.focus();
                }}>{type.name.en} <span className="text-muted-foreground">({type.code})</span>{type.id === value ? " — Selected" : ""}</Button></li>)}</ul>
                <div className="flex items-center justify-between gap-2 text-sm"><Button type="button" className="border px-3 py-2" disabled={!current.result.pagination.hasPrevious} onClick={() => setPage((value) => value - 1)}>Previous types</Button><span>{current.result.pagination.totalCount} types</span><Button type="button" className="border px-3 py-2" disabled={!current.result.pagination.hasNext} onClick={() => setPage((value) => value + 1)}>Next types</Button></div>
            </>}
        </div>}
    </div>;
}
