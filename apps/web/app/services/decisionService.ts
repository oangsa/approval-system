import { decisionRequestSchema, type DecisionRequest } from "@workflow/contracts";
import { decisionApi } from "~/api/decisions";
import { currentGeneration } from "~/api/tokenStore";
export class DecisionAttempt
{
    private attempt: { payload: string; key: string } | null = null;
    public Submit(taskId: string, input: DecisionRequest, generation = currentGeneration())
    {
        const body = decisionRequestSchema.parse(input);
        const payload = JSON.stringify([taskId, body]);
        if (this.attempt?.payload !== payload) this.attempt = { payload, key: crypto.randomUUID() };
        return decisionApi.decide(taskId, body, this.attempt.key, generation);
    }
}
export function readTimeline(requestId: string, pageNumber: number, signal?: AbortSignal, generation?: number)
{
    return decisionApi.timeline(requestId, pageNumber, signal, generation);
}
