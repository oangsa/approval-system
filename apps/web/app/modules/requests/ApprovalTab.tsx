import { useEffect, useState } from "react";
import type { ApproverSummary, RequestDetail } from "@workflow/contracts";
import { useSession } from "~/modules/auth/sessionContext";
import { readApprovers } from "~/services/requestService";
import { Button } from "~/components/ui/button";
import { ApprovalProgress } from "./ApprovalProgress";
import { presentFailure } from "./requestPresentation";

interface IApprovalTabProps { detail: RequestDetail; }
export function ApprovalTab({ detail }: IApprovalTabProps)
{
    const { user, generation } = useSession();
    const [attempt, setAttempt] = useState(0);
    const scope = `${generation}:${user?.id ?? ""}:${detail.id}:${detail.version}:${attempt}`;
    const [state, setState] = useState<{ scope: string; approvers?: ApproverSummary[]; failure?: unknown } | null>(null);
    useEffect(() =>
    {
        if (!user) return;
        const controller = new AbortController();
        void readApprovers(detail.id, controller.signal, generation).then((approvers) =>
        {
            if (!controller.signal.aborted) setState({ scope, approvers });
        }).catch((failure: unknown) =>
        {
            if (!controller.signal.aborted) setState({ scope, failure });
        });
        return () => controller.abort();
    }, [detail.id, generation, scope, user?.id]);
    const current = state?.scope === scope ? state : null;
    const error = current?.failure ? presentFailure(current.failure, "Could not load approval progress.") : null;
    const activeStage = current?.approvers?.find((slot) => slot.status === "ACTIONABLE")?.stageNumber ?? null;
    return <div className="space-y-5 rounded-xl border bg-card p-5 sm:p-8">
        <div className="space-y-1"><h2 className="text-lg font-semibold">Current approval</h2>{current?.approvers && <p className="text-sm text-muted-foreground">{activeStage === null ? "No active stage" : `Stage ${activeStage} active`}</p>}</div>
        {error ? <div role="alert" className="space-y-3"><p>{error.message}</p>{error.requestId && <p className="select-text text-sm">Request ID: {error.requestId}</p>}{!error.terminal && <Button onClick={() => setAttempt((value) => value + 1)}>Retry</Button>}</div> : current?.approvers ? <ApprovalProgress approvers={current.approvers} currentStageNumber={activeStage} userId={user?.id} /> : <p role="status">Loading approval progress…</p>}
    </div>;
}
