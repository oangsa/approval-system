import { afterEach, expect, test, vi } from "vitest";
import { RequestEditingSession, resumeDraft, WithdrawalAttempt } from "../../app/services/requestService";
import { requestApi } from "../../app/api/requests";
import { definition, draft, id } from "../helpers/requestLifecycle";
import { ApiFailure } from "../../app/api/errors";
vi.mock("../../app/api/requests", () => ({ requestApi: { read: vi.fn(), version: vi.fn(), create: vi.fn(), patch: vi.fn(), submit: vi.fn(), withdraw: vi.fn() } }));
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

test("B03 unchanged save revalidates without a mutation", async () =>
{
    const content = { typeId: id, formDefinitionVersionId: definition.versionId };
    const session = new RequestEditingSession(draft, content);
    vi.mocked(requestApi.read).mockResolvedValue(draft);
    expect(await session.Save(content)).toEqual(draft);
    expect(requestApi.read).toHaveBeenCalledWith(id);
    expect(requestApi.create).not.toHaveBeenCalled();
    expect(requestApi.patch).not.toHaveBeenCalled();
});

test.each([
    { server: { ...draft, version: 3 }, code: "REQUEST_STALE" },
    { server: { ...draft, status: "PENDING" as const, version: 3 }, code: "INVALID_REQUEST_TRANSITION" },
    { server: { ...draft, availableActions: [] }, code: "FORBIDDEN" },
])("B03 unchanged save rejects authoritative $code without adopting stale state", async ({ server, code }) =>
{
    const content = { typeId: id, formDefinitionVersionId: definition.versionId, title: draft.title };
    const session = new RequestEditingSession(draft, content);
    vi.mocked(requestApi.read).mockResolvedValue(server);
    await expect(session.Save(content)).rejects.toMatchObject({ code });
    expect(requestApi.patch).not.toHaveBeenCalled();
    vi.mocked(requestApi.patch).mockResolvedValue({ ...draft, version: 3 });
    await session.Save({ ...content, title: "Local correction" });
    expect(requestApi.patch).toHaveBeenCalledWith(id, { title: "Local correction", expectedVersion: 2 }, expect.any(String));
});

test("B03 unchanged save propagates read permission errors and allows retry", async () =>
{
    const content = { typeId: id, formDefinitionVersionId: definition.versionId };
    const session = new RequestEditingSession(draft, content);
    vi.mocked(requestApi.read).mockRejectedValueOnce(new ApiFailure({ kind: "http", status: 403, code: "FORBIDDEN", message: "Forbidden" })).mockResolvedValue(draft);
    await expect(session.Save(content)).rejects.toMatchObject({ status: 403 });
    expect(await session.Save(content)).toEqual(draft);
    expect(requestApi.patch).not.toHaveBeenCalled();
});

test("B03 changed-content lost-response retry preserves body and idempotency key", async () =>
{
    const content = { typeId: id, formDefinitionVersionId: definition.versionId, title: draft.title };
    const session = new RequestEditingSession(draft, content);
    vi.mocked(requestApi.patch).mockRejectedValueOnce(new Error("network")).mockResolvedValue({ ...draft, version: 3 });
    await expect(session.Save({ ...content, title: "Changed" })).rejects.toThrow("network");
    await session.Save({ ...content, title: "Changed" });
    const calls = vi.mocked(requestApi.patch).mock.calls;
    expect(calls[0]).toEqual(calls[1]);
    expect(requestApi.read).not.toHaveBeenCalled();
});

test("B03 submission retry still replays accepted lost response after server leaves DRAFT", async () =>
{
    const content = { typeId: id, formDefinitionVersionId: definition.versionId };
    const session = new RequestEditingSession(draft, content);
    const pending = { ...draft, status: "PENDING" as const, workingRevision: null, version: 3 };
    vi.mocked(requestApi.read).mockResolvedValueOnce(draft).mockResolvedValue(pending);
    vi.mocked(requestApi.submit).mockRejectedValueOnce(new Error("network")).mockResolvedValue(pending);
    await expect(session.Submit(content)).rejects.toThrow("network");
    expect(await session.Submit(content)).toEqual(pending);
    const calls = vi.mocked(requestApi.submit).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual(calls[1]);
});

test("B05 unchanged save with reordered fields keys triggers GET with no PATCH", async () =>
{
    const content = { typeId: id, formDefinitionVersionId: definition.versionId, fields: { reason: "Details", category: "OTHER" } };
    const reordered = { typeId: id, formDefinitionVersionId: definition.versionId, fields: { category: "OTHER", reason: "Details" } };
    const session = new RequestEditingSession(draft, content);
    vi.mocked(requestApi.read).mockResolvedValue(draft);
    expect(await session.Save(reordered)).toEqual(draft);
    expect(requestApi.read).toHaveBeenCalledWith(id);
    expect(requestApi.create).not.toHaveBeenCalled();
    expect(requestApi.patch).not.toHaveBeenCalled();
});

test("B05 changed title with reordered fields omits unchanged fields from PATCH", async () =>
{
    const content = { typeId: id, formDefinitionVersionId: definition.versionId, title: "Initial", fields: { reason: "Details", category: "OTHER" } };
    const session = new RequestEditingSession(draft, content);
    vi.mocked(requestApi.patch).mockResolvedValue({ ...draft, title: "Updated", version: 3 });
    await session.Save({ typeId: id, formDefinitionVersionId: definition.versionId, title: "Updated", fields: { category: "OTHER", reason: "Details" } });
    expect(requestApi.patch).toHaveBeenCalledWith(id, { title: "Updated", expectedVersion: 2 }, expect.any(String));
});

test("B05 submit with reordered fields keys skips PATCH and submits directly", async () =>
{
    const content = { typeId: id, formDefinitionVersionId: definition.versionId, fields: { reason: "Details", category: "OTHER" } };
    const reordered = { typeId: id, formDefinitionVersionId: definition.versionId, fields: { category: "OTHER", reason: "Details" } };
    const session = new RequestEditingSession(draft, content);
    const pending = { ...draft, status: "PENDING" as const, workingRevision: null, version: 3 };
    vi.mocked(requestApi.submit).mockResolvedValue(pending);
    expect(await session.Submit(reordered)).toEqual(pending);
    expect(requestApi.patch).not.toHaveBeenCalled();
    expect(requestApi.submit).toHaveBeenCalledWith(id, 2, expect.any(String));
});

test("B05 changed field value with reordered keys still sends PATCH with updated fields", async () =>
{
    const content = { typeId: id, formDefinitionVersionId: definition.versionId, fields: { reason: "Details", category: "OTHER" } };
    const session = new RequestEditingSession(draft, content);
    vi.mocked(requestApi.patch).mockResolvedValue({ ...draft, version: 3 });
    await session.Save({ typeId: id, formDefinitionVersionId: definition.versionId, fields: { category: "OPERATIONS", reason: "Updated" } });
    expect(requestApi.patch).toHaveBeenCalledWith(id, { fields: { category: "OPERATIONS", reason: "Updated" }, expectedVersion: 2 }, expect.any(String));
});
