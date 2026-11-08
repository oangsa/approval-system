import { describe, expect, it } from "vitest";
import { approvalTaskSchema, approvalTaskSearchSchema } from "../src/approvalTasks";

describe("approval task contracts", () =>
{
    it("defaults and strictly validates the search allowlist", () =>
    {
        expect(approvalTaskSearchSchema.parse({})).toEqual({ pageNumber: 1, pageSize: 20, search: [], orderBy: "dueAt asc" });
        for (const query of [{ reviewerId: "x" }, { orderBy: "createdAt asc" }, { search: [{ name: "status", condition: "EQUAL", value: "WAITING" }] }, { search: [{ name: "dueAt", condition: "GREATER", value: "bad" }] }]) expect(approvalTaskSearchSchema.safeParse(query).success).toBe(false);
    });
    it("rejects private fields in the task projection", () =>
    {
        const id = "d233f6d7-64de-49bd-8e8d-e2eb899bb2a0";
        const task = { id, slotId: id, requestId: id, cycleId: id, revisionId: id, stageNumber: 1, assignedReviewer: { id, displayName: "Reviewer" }, status: "ACTIONABLE", dueAt: null, canCurrentUserDecide: true, version: 0 };
        expect(approvalTaskSchema.safeParse(task).success).toBe(true);
        expect(approvalTaskSchema.safeParse({ ...task, requestTitle: "private" }).success).toBe(false);
    });
});
