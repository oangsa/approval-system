import { useEffect, useState } from "react";
import { useParams } from "react-router";
import type { RequestDetail } from "@workflow/contracts";
import { requestApi } from "~/api/requests";
import { isApiFailure } from "~/api/errors";
import { Button } from "~/components/ui/button";
import { RequestResult } from "./RequestResult";

export function RequestDetailPage()
{
    const { id } = useParams();
    const [detail, setDetail] = useState<RequestDetail | null>(null);
    const [error, setError] = useState("");
    const [attempt, setAttempt] = useState(0);
    useEffect(() =>
    {
        const controller = new AbortController();
        setError("");
        setDetail(null);
        requestApi.read(id!, controller.signal).then((value) =>
        {
            if (!controller.signal.aborted) setDetail(value);
        }).catch((failure: unknown) =>
        {
            if (!controller.signal.aborted) setError(isApiFailure(failure) ? failure.message : "Could not load request.");
        });
        return () => controller.abort();
    }, [id, attempt]);
    return <div className="mx-auto max-w-3xl space-y-6"><h1 className="text-2xl font-semibold">Request details</h1>{error ? <div role="alert">{error}<Button onClick={() => setAttempt((value) => value + 1)}>Retry</Button></div> : detail ? <RequestResult detail={detail} /> : <p role="status">Loading request…</p>}</div>;
}
