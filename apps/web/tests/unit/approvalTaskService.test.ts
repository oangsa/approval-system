import { beforeEach, expect, test, vi } from "vitest";
import { approvalTaskApi } from "../../app/api/approvalTasks";
import { readRequestResult } from "../../app/services/requestService";
import { readApprovalTaskResult } from "../../app/services/approvalTaskService";

vi.mock("../../app/api/approvalTasks", () => ({ approvalTaskApi: { read: vi.fn(), search: vi.fn() } }));
vi.mock("../../app/services/requestService", () => ({ readRequestResult: vi.fn() }));
const task = { id: "task", requestId: "request", cycleId: "cycle", revisionId: "revision", canCurrentUserDecide: true };
beforeEach(() => vi.resetAllMocks());
test("reads the task before requesting private content", async () =>
{
    vi.mocked(approvalTaskApi.read).mockResolvedValue(task as never);
    vi.mocked(readRequestResult).mockResolvedValue({ detail: { currentCycleId: "cycle", submittedRevision: { id: "revision" } }, definition: null } as never);
    await readApprovalTaskResult("task");
    expect(vi.mocked(approvalTaskApi.read).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(readRequestResult).mock.invocationCallOrder[0]!);
    expect(readRequestResult).toHaveBeenCalledWith("request", undefined);
});
test("denied tasks never trigger a request read", async () =>
{
    vi.mocked(approvalTaskApi.read).mockRejectedValue(new Error("denied"));
    await expect(readApprovalTaskResult("task")).rejects.toThrow();
    expect(readRequestResult).not.toHaveBeenCalled();
});
test("rejects content from a different submitted revision", async () =>
{
    vi.mocked(approvalTaskApi.read).mockResolvedValue(task as never);
    vi.mocked(readRequestResult).mockResolvedValue({ detail: { currentCycleId: "cycle", submittedRevision: { id: "other" } }, definition: null } as never);
    await expect(readApprovalTaskResult("task")).rejects.toThrow("Task unavailable");
});
