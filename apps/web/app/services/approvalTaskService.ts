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
    if (!task.canCurrentUserDecide) throw new Error("Task unavailable");
    const result = await readRequestResult(task.requestId, signal);
    if (signal?.aborted || generation !== currentGeneration()) throw abortFailure();
    if (result.detail.currentCycleId !== task.cycleId || result.detail.submittedRevision?.id !== task.revisionId) throw new Error("Task unavailable");
    return { task, ...result };
}
