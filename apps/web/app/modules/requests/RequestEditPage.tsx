import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useSession } from "~/modules/auth/sessionContext";
import { resumeDraft } from "~/services/requestService";
import { ActionButton } from "~/components/actions/ActionButton";
import { presentFailure } from "./requestPresentation";
import { RequestWizard } from "./RequestWizard";

export function RequestEditPage()
{
    const { id } = useParams();
    const { user, generation } = useSession();
    const scope = `${generation}:${user?.id}:${id}`;
    const [attempt, setAttempt] = useState(0);
    const [state, setState] = useState<{ scope: string; result?: Awaited<ReturnType<typeof resumeDraft>>; failure?: unknown } | null>(null);
    useEffect(() =>
    {
        if (!id || !user?.roles.includes("REQUESTER")) return;
        const controller = new AbortController();
        setState(null);
        resumeDraft(id, controller.signal, generation).then((result) =>
        {
            if (!controller.signal.aborted) setState({ scope, result });
        }).catch((failure: unknown) =>
        {
            if (!controller.signal.aborted) setState({ scope, failure });
        });
        return () => controller.abort();
    }, [id, user?.id, generation, scope, attempt]);
    if (!user?.roles.includes("REQUESTER")) return <p role="alert">Requester access is required to edit drafts.</p>;
    const current = state?.scope === scope ? state : null;
    if (current?.result) return <RequestWizard key={scope} initial={current.result} />;
    if (current?.failure)
    {
        const error = presentFailure(current.failure, "This draft cannot be edited.");
        return <div role="alert" className="space-y-3"><p>{error.message}</p>{!error.terminal && <ActionButton onClick={() => setAttempt((value) => value + 1)}>Retry draft</ActionButton>}<Link className="block underline" to="/requests">My Requests</Link></div>;
    }
    return <p role="status">Loading saved draft…</p>;
}
