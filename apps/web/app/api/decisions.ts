import { z } from "zod";
import { auditTimelineItemSchema, decisionResultSchema, type DecisionRequest } from "@workflow/contracts";
import { httpFor, httpPageFor } from "./http";
export const decisionApi = {
    decide: (taskId: string, body: DecisionRequest, key: string, generation: number) => httpFor(`/v1/approval-tasks/${encodeURIComponent(taskId)}/decisions`, decisionResultSchema, { method: "POST", body, headers: { "Idempotency-Key": key }, generation }),
    timeline: (requestId: string, pageNumber: number, signal?: AbortSignal, generation?: number) => httpPageFor(`/v1/requests/${encodeURIComponent(requestId)}/timeline?pageNumber=${pageNumber}&pageSize=20`, z.array(auditTimelineItemSchema), { signal, generation }),
};
