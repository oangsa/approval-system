import { expect, test } from "vitest";
import { dashboardSchema } from "../src";

const id = "11111111-1111-4111-8111-111111111111";
const generatedAt = "2026-01-01T00:00:00Z";
const requester = { ownRequests: 0, pendingRequests: 0, returnedRequests: 0, approvedRequests: 0, rejectedRequests: 0 };
const reviewer = { pendingReviews: 0, overdueTasks: 0 };
const administration = { statusCounts: [], configuration: { enabledPublishedTypes: 0, activePolicyVersions: 0, activeAssignmentRules: 0 }, escalation: { actionableTasks: 0, overdueTasks: 0 } };
const decision = { id, decision: "APPROVE", decidedAt: generatedAt, taskId: id, requestId: id, cycleId: id, revisionId: id };
function dashboard(roles: string[])
{
    const hasRequester = roles.includes("REQUESTER");
    const hasReviewer = roles.includes("REVIEWER");
    return { roleContext: roles, generatedAt, ...(hasRequester || hasReviewer ? { summary: { ...(hasRequester ? requester : {}), ...(hasReviewer ? reviewer : {}) } } : {}), ...(hasRequester ? { recentRequests: [] } : {}), ...(hasReviewer ? { pendingTasks: [], recentDecisions: [decision] } : {}), ...(roles.includes("ADMINISTRATOR") ? { administration } : {}) };
}
test("dashboard admits all seven role combinations and only their sections", () =>
{
    for (const roles of [["REQUESTER"], ["REVIEWER"], ["ADMINISTRATOR"], ["REQUESTER", "REVIEWER"], ["REQUESTER", "ADMINISTRATOR"], ["REVIEWER", "ADMINISTRATOR"], ["ADMINISTRATOR", "REQUESTER", "REVIEWER"]]) expect(dashboardSchema.safeParse(dashboard(roles)).success).toBe(true);
    for (const invalid of [dashboard([]), dashboard(["REQUESTER", "REQUESTER"]), dashboard(["OTHER"]), { ...dashboard(["ADMINISTRATOR"]), recentRequests: [] }, { ...dashboard(["REQUESTER"]), summary: { ...requester, pendingReviews: 0 } }, { ...dashboard(["REVIEWER"]), recentDecisions: [{ ...decision, decidedBy: id }] }, { ...dashboard(["REVIEWER"]), recentDecisions: Array(6).fill(decision) }, { ...dashboard(["REVIEWER"]), recentDecisions: [{ ...decision, cycleId: null }] }, { ...dashboard(["REQUESTER"]), summary: { ...requester, ownRequests: -1 } }, { ...dashboard(["REVIEWER"]), summary: { ...reviewer, overdueTasks: 0.5 } }, { ...dashboard(["ADMINISTRATOR"]), generatedAt: "2026-01-01T00:00:00+07:00" }, { ...dashboard(["ADMINISTRATOR"]), unreadNotifications: 0 }]) expect(dashboardSchema.safeParse(invalid).success).toBe(false);
});
