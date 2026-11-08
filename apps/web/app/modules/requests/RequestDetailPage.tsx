import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import type { PublishedRequestType, RequestDetail } from "@workflow/contracts";
import { readRequestResult } from "~/services/requestService";
import { Button } from "~/components/ui/button";
import { useSession } from "~/modules/auth/sessionContext";
import { RequestDetailTabs } from "./RequestDetailTabs";
import { presentFailure, type IViewError } from "./requestPresentation";

export function RequestDetailPage()
{
    const { id } = useParams();
    const { generation, user } = useSession();
    const scope = `${generation}:${user?.id ?? ""}:${id ?? ""}`;
    const [result, setResult] = useState<{ scope: string; detail: RequestDetail; definition: PublishedRequestType | null } | null>(null);
    const [error, setError] = useState<{ scope: string; failure: unknown } | null>(null);
    const [attempt, setAttempt] = useState(0);
    useEffect(() =>
    {
        const controller = new AbortController();
        setError(null);
        setResult(null);
        if (!id || !user) return () => controller.abort();
        readRequestResult(id, controller.signal, generation).then(({ detail, definition }) =>
        {
            if (!controller.signal.aborted) setResult({ scope, detail, definition });
        }).catch((failure: unknown) =>
        {
            if (!controller.signal.aborted) setError({ scope, failure });
        });
        return () => controller.abort();
    }, [id, attempt, generation, user?.id, scope]);
    const viewError: IViewError | null = error?.scope === scope ? presentFailure(error.failure, "Could not load request.") : null;
    return <div className="mx-auto max-w-3xl space-y-6">{viewError ? <div role="alert" className="space-y-3 rounded-lg border bg-card p-6"><p>{viewError.message}</p>{viewError.requestId && <p className="text-sm text-muted-foreground">Request ID: <span className="select-all">{viewError.requestId}</span></p>}{viewError.status === 403 && <Link className="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground" to="/dashboard">Go to Dashboard</Link>}{!viewError.terminal && <Button onClick={() => setAttempt((value) => value + 1)}>Retry</Button>}</div> : result?.scope === scope ? <RequestDetailTabs key={scope} detail={result.detail} definition={result.definition} /> : <p role="status">Loading request…</p>}</div>;
}