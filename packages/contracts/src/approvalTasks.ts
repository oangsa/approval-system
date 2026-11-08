import { z } from "zod";

export const approvalTaskSchema = z.strictObject({
    id: z.uuid(), slotId: z.uuid(), requestId: z.uuid(), cycleId: z.uuid(), revisionId: z.uuid(),
    stageNumber: z.union([z.literal(1), z.literal(2)]), assignedReviewer: z.strictObject({ id: z.uuid(), displayName: z.string() }),
    status: z.enum(["WAITING", "ACTIONABLE", "APPROVED", "REJECTED", "RETURNED", "CANCELLED"]), dueAt: z.iso.datetime().nullable(),
    canCurrentUserDecide: z.boolean(), version: z.number().int().nonnegative(),
});
const filter = z.union([
    z.strictObject({ name: z.literal("stageNumber"), condition: z.literal("EQUAL"), value: z.union([z.literal(1), z.literal(2)]) }),
    z.strictObject({ name: z.literal("status"), condition: z.literal("EQUAL"), value: z.literal("ACTIONABLE") }),
    z.strictObject({ name: z.literal("overdue"), condition: z.literal("EQUAL"), value: z.boolean() }),
    z.strictObject({ name: z.literal("dueAt"), condition: z.enum(["GREATER", "LESSER", "GREATEROREQUAL", "LESSEROREQUAL"]), value: z.iso.datetime() }),
    z.strictObject({ name: z.literal("dueAt"), condition: z.enum(["ISNULL", "ISNOTNULL"]) }),
    z.strictObject({ name: z.literal("requestNumber"), condition: z.enum(["EQUAL", "CONTAINS", "STARTWITH"]), value: z.string().min(1).max(100) }),
]);
export const approvalTaskSearchSchema = z.strictObject({
    pageNumber: z.number().int().min(1).max(10000).default(1), pageSize: z.number().int().min(1).max(100).default(20),
    search: z.array(filter).max(20).default([]),
    searchTerm: z.strictObject({ name: z.enum(["requestNumber", "title", "requestNumber,title"]), value: z.string().min(1).max(100) }).optional(),
    orderBy: z.enum(["dueAt asc", "dueAt desc", "stageNumber asc", "stageNumber desc", "requestNumber asc", "requestNumber desc"]).default("dueAt asc"),
});
export type ApprovalTask = z.infer<typeof approvalTaskSchema>;
export type ApprovalTaskSearch = z.infer<typeof approvalTaskSearchSchema>;
