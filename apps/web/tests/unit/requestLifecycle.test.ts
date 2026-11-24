import { afterEach, expect, test, vi } from "vitest";
import { RequestEditingSession, resumeDraft, WithdrawalAttempt } from "../../app/services/requestService";
import { requestApi } from "../../app/api/requests";
import { definition, draft, id } from "../helpers/requestLifecycle";
vi.mock("../../app/api/requests", () => ({ requestApi: { read: vi.fn(), version: vi.fn(), create: vi.fn(), patch: vi.fn(), withdraw: vi.fn() } }));
afterEach(() => vi.resetAllMocks());
test("resume initializes saved session and PATCH sends only changed fields with current version", async () =>
{
    vi.mocked(requestApi.read).mockResolvedValue(draft);
    vi.mocked(requestApi.version).mockResolvedValue(definition);
    const restored = await resumeDraft(id, new AbortController().signal, 3);
    const session = new RequestEditingSession(restored.detail, restored.content);
    expect(await session.Save(restored.content)).toEqual(draft);
    expect(requestApi.create).not.toHaveBeenCalled();
    expect(requestApi.patch).not.toHaveBeenCalled();
    vi.mocked(requestApi.patch).mockResolvedValue({ ...draft, title: "Updated", version: 3 });
    await session.Save({ ...restored.content, title: "Updated" });
    expect(requestApi.patch).toHaveBeenCalledWith(id, { title: "Updated", expectedVersion: 2 }, expect.any(String));
    await session.Save({ ...restored.content, title: "Updated", fields: { extra: "value" } });
    expect(requestApi.patch).toHaveBeenLastCalledWith(id, { fields: { extra: "value" }, expectedVersion: 3 }, expect.any(String));
});
test("lost draft response and withdrawal response retain unchanged retry key", async () =>
{
    const content = { typeId: id, formDefinitionVersionId: definition.versionId };
    vi.mocked(requestApi.create).mockRejectedValueOnce(new Error("network")).mockResolvedValue(draft);
    const session = new RequestEditingSession();
    await expect(session.Save(content)).rejects.toThrow("network");
    await session.Save(content);
    expect(vi.mocked(requestApi.create).mock.calls[0]![1]).toBe(vi.mocked(requestApi.create).mock.calls[1]![1]);
    const attempt = new WithdrawalAttempt();
    const submit = vi.mocked(requestApi.withdraw);
    submit.mockRejectedValueOnce(new Error("network")).mockResolvedValue({ ...draft, status: "WITHDRAWN" });
    await expect(attempt.Submit(id, { expectedVersion: 2 }, 3)).rejects.toThrow("network");
    await attempt.Submit(id, { expectedVersion: 2 }, 3);
    expect(submit.mock.calls[0]![2]).toBe(submit.mock.calls[1]![2]);
    await attempt.Submit(id, { expectedVersion: 2, reason: "Changed" }, 3);
    expect(submit.mock.calls[2]![2]).not.toBe(submit.mock.calls[1]![2]);
});
test("resume rejects submitted state and missing editable permission", async () =>
{
    vi.mocked(requestApi.version).mockResolvedValue(definition);
    for (const detail of [{ ...draft, status: "PENDING" as const }, { ...draft, availableActions: [] }])
    {
        vi.mocked(requestApi.read).mockResolvedValue(detail);
        await expect(resumeDraft(id, new AbortController().signal, 1)).rejects.toThrow("cannot be edited");
    }
});
