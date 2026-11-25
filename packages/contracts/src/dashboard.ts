import { z } from "zod";
import { approvalTaskSchema } from "./approvalTasks";
import { userRoleSchema } from "./auth";
import { decisionTypeSchema } from "./decisions";
import { reportAggregateRowSchema } from "./reporting";
import { requestSummarySchema } from "./requests";

const count = z.number().int().nonnegative();
const requesterSummary = { ownRequests: count, pendingRequests: count, returnedRequests: count, approvedRequests: count, rejectedRequests: count };
const reviewerSummary = { pendingReviews: count, overdueTasks: count };
const requester = { recentRequests: z.array(requestSummarySchema).max(5) };
const reviewer = {
    pendingTasks: z.array(approvalTaskSchema).max(5),
    recentDecisions: z.array(z.strictObject({ id: z.uuid(), decision: decisionTypeSchema, decidedAt: z.iso.datetime(), taskId: z.uuid(), requestId: z.uuid(), cycleId: z.uuid(), revisionId: z.uuid() })).max(5),
};
const administration = { administration: z.strictObject({
    statusCounts: z.array(reportAggregateRowSchema),
    configuration: z.strictObject({ enabledPublishedTypes: count, activePolicyVersions: count, activeAssignmentRules: count }),
    escalation: z.strictObject({ actionableTasks: count, overdueTasks: count }),
}) };
const roles = (...expected: z.infer<typeof userRoleSchema>[]) => z.array(userRoleSchema).length(expected.length).refine((value) => new Set(value).size === expected.length && expected.every((role) => value.includes(role)));
const base = { generatedAt: z.iso.datetime() };
export const dashboardSchema = z.union([
    z.strictObject({ ...base, roleContext: roles("REQUESTER"), summary: z.strictObject(requesterSummary), ...requester }),
    z.strictObject({ ...base, roleContext: roles("REVIEWER"), summary: z.strictObject(reviewerSummary), ...reviewer }),
    z.strictObject({ ...base, roleContext: roles("ADMINISTRATOR"), ...administration }),
    z.strictObject({ ...base, roleContext: roles("REQUESTER", "REVIEWER"), summary: z.strictObject({ ...requesterSummary, ...reviewerSummary }), ...requester, ...reviewer }),
    z.strictObject({ ...base, roleContext: roles("REQUESTER", "ADMINISTRATOR"), summary: z.strictObject(requesterSummary), ...requester, ...administration }),
    z.strictObject({ ...base, roleContext: roles("REVIEWER", "ADMINISTRATOR"), summary: z.strictObject(reviewerSummary), ...reviewer, ...administration }),
    z.strictObject({ ...base, roleContext: roles("REQUESTER", "REVIEWER", "ADMINISTRATOR"), summary: z.strictObject({ ...requesterSummary, ...reviewerSummary }), ...requester, ...reviewer, ...administration }),
]);
export type DashboardDTO = z.infer<typeof dashboardSchema>;
