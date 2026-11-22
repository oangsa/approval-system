import { z } from "zod";
import { requestStatusSchema } from "./requests";

export const decisionTypeSchema = z.enum(["APPROVE", "REJECT", "RETURN"]);
export const rejectionReasonMinimumLength = 10;
export const decisionReasonMaximumLength = 4000;
// Transport compatibility for replay of decisions accepted before Lab 7.
export const decisionReplayRequestSchema = z.strictObject({
    decision: decisionTypeSchema, reason: z.string().trim().max(decisionReasonMaximumLength).optional(), expectedVersion: z.number().int().nonnegative(),
}).superRefine((body, context) =>
{
    if (body.decision !== "APPROVE" && !body.reason) context.addIssue({ code: "custom", path: ["reason"], message: "A reason is required" });
});
export const decisionRequestSchema = decisionReplayRequestSchema.superRefine((body, context) =>
{
    if (body.decision === "REJECT" && body.reason && body.reason.length < rejectionReasonMinimumLength)
    {
        context.addIssue({ code: "custom", path: ["reason"], message: "Rejection reason must contain at least 10 characters after trimming surrounding whitespace." });
    }
});
export const decisionResultSchema = z.strictObject({
    taskId: z.uuid(), slotId: z.uuid(), decisionId: z.uuid(), decision: decisionTypeSchema,
    decidedBy: z.uuid(), decidedAt: z.iso.datetime(), requestStatus: requestStatusSchema,
    currentStageNumber: z.union([z.literal(1), z.literal(2)]).nullable(),
    requestVersion: z.number().int().nonnegative(), taskVersion: z.number().int().nonnegative(),
});
export const auditTimelineItemSchema = z.strictObject({
    id: z.uuid(), requestId: z.uuid(), cycleId: z.uuid().nullable(), revisionId: z.uuid().nullable(), eventType: z.string(),
    actor: z.strictObject({ id: z.uuid(), displayName: z.string() }).nullable(), occurredAt: z.iso.datetime(), note: z.string().nullable(),
    metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export const timelineQuerySchema = z.strictObject({
    pageNumber: z.coerce.number().int().min(1).max(10000).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type DecisionRequest = z.infer<typeof decisionRequestSchema>;
export type DecisionResult = z.infer<typeof decisionResultSchema>;
export type AuditTimelineItem = z.infer<typeof auditTimelineItemSchema>;
export type TimelineQuery = z.infer<typeof timelineQuerySchema>;
