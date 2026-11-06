import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { PublishedRequestType, RequestDetail } from "@workflow/contracts";
import { readRequestResult } from "~/services/requestService";
import { isApiFailure } from "~/api/errors";
import { Button } from "~/components/ui/button";
import { RequestResult } from "./RequestResult";

export function RequestDetailPage()
{
    const { id } = useParams();
    const [detail, setDetail] = useState<RequestDetail | null>(null);
    const [definition, setDefinition] = useState<PublishedRequestType | null>(null);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    useEffect(() =>
    {
        const controller = new AbortController();
        setError("");
        setDetail(null);
        setDefinition(null);
        readRequestResult(id!, controller.signal).then(({ detail, definition }) =>
        {
            if (!controller.signal.aborted)
            {
                setDefinition(definition);
                setDetail(detail);
            }
        }).catch((failure: unknown) =>
        {
            if (!controller.signal.aborted) setError(isApiFailure(failure) ? failure.message : "Could not load request.");
        });
        return () => controller.abort();
    }, [id, attempt]);
    return <div className="mx-auto max-w-3xl space-y-6"><h1 className="text-2xl font-semibold">Request details</h1>{error ? <div role="alert">{error}<Button onClick={() => setAttempt((value) => value + 1)}>Retry</Button></div> : detail ? <RequestResult detail={detail} definition={definition} /> : <p role="status">Loading request…</p>}</div>;
}
