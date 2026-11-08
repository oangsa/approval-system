import { expect, test, vi } from "vitest";
import { DecisionAttempt } from "../../app/services/decisionService";
import { decisionApi } from "../../app/api/decisions";
vi.mock("../../app/api/decisions", () => ({ decisionApi: { decide: vi.fn() } }));
test("unchanged transport retry retains key; changed body or task receives new identity", async () =>
{
    const submit = vi.mocked(decisionApi.decide);
    submit.mockRejectedValueOnce(new Error("network")).mockResolvedValue({} as never);
    const attempt = new DecisionAttempt();
    const body = { decision: "REJECT" as const, reason: "No", expectedVersion: 1 };
    await expect(attempt.Submit("task", body)).rejects.toThrow("network");
    await attempt.Submit("task", body);
    expect(submit.mock.calls[0]![2]).toBe(submit.mock.calls[1]![2]);
    await attempt.Submit("task", { ...body, reason: "Changed" });
    expect(submit.mock.calls[2]![2]).not.toBe(submit.mock.calls[1]![2]);
    await attempt.Submit("other", body);
    expect(submit.mock.calls[3]![2]).not.toBe(submit.mock.calls[0]![2]);
    await expect(async () => attempt.Submit("task", { ...body, reason: " " })).rejects.toThrow();
    expect(submit).toHaveBeenCalledTimes(4);
});
