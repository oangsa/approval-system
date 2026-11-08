import { isApiFailure } from "~/api/errors";
import { approvalTaskSearchSchema, type ApprovalTaskSearch } from "@workflow/contracts";
import { approvalTaskApi } from "~/api/approvalTasks";
import { abortFailure } from "~/api/http";
import { currentGeneration } from "~/api/tokenStore";
import { readRequestResult } from "~/services/requestService";

export function searchApprovalTasks(query: ApprovalTaskSearch, signal?: AbortSignal, generation = currentGeneration())
{
    return approvalTaskApi.search(approvalTaskSearchSchema.parse(query), signal, generation);
}

export async function readApprovalTaskResult(id: string, signal?: AbortSignal, generation = currentGeneration())
{
    const task = await approvalTaskApi.read(id, signal, generation);
    if (signal?.aborted || generation !== currentGeneration()) throw abortFailure();
    if (!task.canCurrentUserDecide) return { task, detail: null, definition: null };
    const result = await readRequestResult(task.requestId, signal);
    if (signal?.aborted || generation !== currentGeneration()) throw abortFailure();
    if (result.detail.currentCycleId !== task.cycleId || result.detail.submittedRevision?.id !== task.revisionId) throw new Error("Task unavailable");
    return { task, ...result };
}

export async function refreshAfterDecision(task: import("@workflow/contracts").ApprovalTask, decision: import("@workflow/contracts").DecisionResult, generation: number)
{
    const [currentTask, request, queue] = await Promise.allSettled([
        approvalTaskApi.read(task.id, undefined, generation),
        readRequestResult(task.requestId, undefined, generation),
        searchApprovalTasks(approvalTaskSearchSchema.parse({}), undefined, generation),
    ]);
    const expectedDenial = (failure: unknown) => isApiFailure(failure) && [403, 404].includes(failure.status ?? 0);
    return { decision, detail: request.status === "fulfilled" ? request.value.detail : null,
        refreshFailed: queue.status === "rejected" || currentTask.status === "rejected" && !expectedDenial(currentTask.reason) || request.status === "rejected" && !expectedDenial(request.reason) };
}
