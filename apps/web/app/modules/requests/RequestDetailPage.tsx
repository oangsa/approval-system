import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { PublishedRequestType, RequestDetail } from "@workflow/contracts";
import { readRequestResult } from "~/services/requestService";
import { isApiFailure } from "~/api/errors";
import { Button } from "~/components/ui/button";
import { useSession } from "~/modules/auth/sessionContext";
import { RequestDetailTabs } from "./RequestDetailTabs";

export function RequestDetailPage()
{
    const { id } = useParams();
    const { generation, user } = useSession();
    const scope = `${generation}:${user?.id ?? ""}:${id ?? ""}`;
    const [result, setResult] = useState<{ scope: string; detail: RequestDetail; definition: PublishedRequestType | null } | null>(null);
    const [error, setError] = useState<{ scope: string; message: string } | null>(null);
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
            if (!controller.signal.aborted) setError({ scope, message: isApiFailure(failure) ? failure.message : "Could not load request." });
        });
        return () => controller.abort();
    }, [id, attempt, generation, user?.id, scope]);
    return <div className="mx-auto max-w-3xl space-y-6">{error?.scope === scope ? <div role="alert">{error.message}<Button onClick={() => setAttempt((value) => value + 1)}>Retry</Button></div> : result?.scope === scope ? <RequestDetailTabs key={scope} detail={result.detail} definition={result.definition} /> : <p role="status">Loading request…</p>}</div>;
}
