import { useEffect, useState } from "react";
import type { PublishedRequestType, RequestDetail } from "@workflow/contracts";
import { readRevision, readRevisions } from "~/services/requestService";
import { Button } from "~/components/ui/button";
import { useSession } from "~/modules/auth/sessionContext";
import { RevisionViewer } from "./RevisionViewer";

interface IRevisionHistoryProps { detail: RequestDetail; definition: PublishedRequestType | null; }
export function RevisionHistory({ detail, definition }: IRevisionHistoryProps)
{
    const { generation, user } = useSession();
    const scope = `${generation}:${user?.id}:${detail.id}`;
    return <History key={scope} detail={detail} definition={definition} generation={generation} signedIn={Boolean(user)} />;
}
interface IHistoryProps extends IRevisionHistoryProps { generation: number; signedIn: boolean; }
function History({ detail, definition, generation, signedIn }: IHistoryProps)
{
    const [page, setPage] = useState(1);
    const [attempt, setAttempt] = useState(0);
    const [selected, setSelected] = useState("");
    const [snapshotAttempt, setSnapshotAttempt] = useState(0);
    const [list, setList] = useState<{ scope: string; result?: Awaited<ReturnType<typeof readRevisions>>; error?: boolean } | null>(null);
    const [snapshot, setSnapshot] = useState<{ scope: string; result?: Awaited<ReturnType<typeof readRevision>>; error?: boolean } | null>(null);
    const listScope = `${page}:${attempt}`;
    const snapshotScope = `${selected}:${snapshotAttempt}`;
    useEffect(() =>
    {
        const controller = new AbortController();
        if (signedIn) void readRevisions(detail.id, page, controller.signal, generation).then((result) =>
        {
            if (!controller.signal.aborted) setList({ scope: listScope, result });
        }).catch(() =>
        {
            if (!controller.signal.aborted) setList({ scope: listScope, error: true });
        });
        return () => controller.abort();
    }, [detail.id, generation, signedIn, page, listScope]);
    useEffect(() =>
    {
        const controller = new AbortController();
        if (signedIn && selected) void readRevision(detail.id, selected, controller.signal, generation).then((result) =>
        {
            if (!controller.signal.aborted) setSnapshot({ scope: snapshotScope, result });
        }).catch(() =>
        {
            if (!controller.signal.aborted) setSnapshot({ scope: snapshotScope, error: true });
        });
        return () => controller.abort();
    }, [detail.id, generation, signedIn, selected, snapshotScope]);
    const current = list?.scope === listScope ? list : null;
    const shown = snapshot?.scope === snapshotScope ? snapshot : null;
    const metadata = current?.result?.items.find((item) => item.id === selected);
    return <section aria-label="Revision history" className="space-y-4">
        <h2 className="text-lg font-semibold">Revision history</h2>
        {current?.error ? <div role="alert">Could not load revisions. <Button onClick={() => setAttempt((value) => value + 1)}>Retry revisions</Button></div> : !current?.result ? <p role="status">Loading revisions…</p> : <>
            {current.result.items.length === 0 ? <p>No submitted revisions.</p> : <label className="block space-y-2"><span>Select revision</span><select className="w-full rounded-md border bg-background p-2" value={selected} onChange={(event) => setSelected(event.target.value)}><option value="">Choose a revision</option>{current.result.items.map((item) => <option key={item.id} value={item.id}>Revision {item.revisionNumber}{item.id === detail.submittedRevision?.id ? " (current)" : ""}</option>)}</select></label>}
            <nav aria-label="Revision pages" className="flex flex-wrap items-center gap-3"><Button disabled={!current.result.pagination.hasPrevious} onClick={() =>
{
 setSelected(""); setPage((value) => value - 1);
}}>Previous revisions</Button><span className="tabular-nums">Page {current.result.pagination.currentPage}</span><Button disabled={!current.result.pagination.hasNext} onClick={() =>
{
 setSelected(""); setPage((value) => value + 1);
}}>Next revisions</Button></nav>
        </>}
        {selected && (shown?.error ? <div role="alert">Could not load this revision. <Button onClick={() => setSnapshotAttempt((value) => value + 1)}>Retry revision</Button></div> : shown?.result ? <RevisionViewer revision={shown.result} definition={definition?.versionId === shown.result.formDefinitionVersionId ? definition : null} cycleId={metadata?.cycleId} /> : <p role="status">Loading revision…</p>)}
    </section>;
}
