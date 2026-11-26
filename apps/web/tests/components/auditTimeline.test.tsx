import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AuditTimeline } from "../../app/modules/requests/AuditTimeline";
import { readTimeline } from "../../app/services/decisionService";
import { ApiFailure } from "../../app/api/errors";
const session = vi.hoisted(() => ({ generation: 0, user: { id: "owner", roles: ["REQUESTER"] } }));
vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => session }));
vi.mock("../../app/services/decisionService", () => ({ readTimeline: vi.fn() }));
test.each([500, 503])("history %i displays support ID and can retry without private error text", async (status) =>
{
    vi.mocked(readTimeline).mockRejectedValueOnce(new ApiFailure({ kind: "http", status, message: "private database failure", requestId: "support-id" })).mockResolvedValueOnce({ items: [], pagination: { currentPage: 1, pageSize: 20, totalPages: 0, totalCount: 0, hasPrevious: false, hasNext: false } });
    render(<AuditTimeline requestId="request" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Request ID: support-id");
    expect(screen.queryByText("private database failure")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry history" }));
    expect(await screen.findByText("No history yet.")).toBeVisible();
});
test.each([403, 404])("denied history %i has no unsafe retry or private error details", async (status) =>
{
    vi.mocked(readTimeline).mockRejectedValueOnce(new ApiFailure({ kind: "http", status, message: "private database failure" }));
    render(<AuditTimeline requestId="request" />);
    await screen.findByRole("alert");
    expect(screen.queryByRole("button", { name: "Retry history" })).not.toBeInTheDocument();
    expect(screen.queryByText("private database failure")).not.toBeInTheDocument();
});


const pagination = (page: number, hasNext = false) => ({ currentPage: page, pageSize: 20, totalPages: hasNext ? 2 : page, totalCount: 2, hasPrevious: page > 1, hasNext });
const item = (id: string, eventType: string) => ({ id, requestId: "request", cycleId: "cycle-id", revisionId: "revision-id", eventType, actor: { id: "actor", displayName: "Reviewer" }, occurredAt: "2026-11-06T00:00:00Z", note: null, metadata: { secret: "never render" } });

test("renders chronological readable facts and safely handles unknown events", async () =>
{
    vi.mocked(readTimeline).mockResolvedValueOnce({ items: [item("1", "DECISION_REJECT"), item("2", "REQUEST_RESUBMITTED"), item("3", "toString")], pagination: pagination(1) });
    render(<AuditTimeline requestId="request" />);
    const list = await screen.findByRole("list");
    expect(list).toHaveTextContent(/Decision: rejected.*Request resubmitted.*History event/);
    const resubmitted = screen.getByText("Request resubmitted").closest("li")!;
    expect(resubmitted).toHaveTextContent("Reviewer");
    expect(resubmitted).toHaveTextContent("Cycle ID: cycle-id");
    expect(resubmitted).toHaveTextContent("Revision ID: revision-id");
    expect(list).toHaveTextContent("Reviewer");
    expect(list).toHaveTextContent("Cycle ID: cycle-id");
    expect(list).toHaveTextContent("Revision ID: revision-id");
    expect(list.querySelector("time")).toHaveAttribute("datetime", "2026-11-06T00:00:00Z");
    expect(list.querySelector("time")).toHaveTextContent("Bangkok");
    expect(list).not.toHaveTextContent("never render");
});

test("resets the page on request and identity changes and ignores stale responses", async () =>
{
    let resolveOld!: (value: Awaited<ReturnType<typeof readTimeline>>) => void;
    vi.mocked(readTimeline).mockResolvedValueOnce({ items: [], pagination: pagination(1, true) })
        .mockImplementationOnce(() => new Promise((resolve) =>
        {
            resolveOld = resolve;
        }))
        .mockResolvedValueOnce({ items: [item("new", "REQUEST_SUBMITTED")], pagination: pagination(1, true) })
        .mockResolvedValueOnce({ items: [], pagination: pagination(2) })
        .mockResolvedValueOnce({ items: [item("identity", "REQUEST_CREATED")], pagination: pagination(1) });
    const view = render(<AuditTimeline requestId="first" />);
    fireEvent.click(await screen.findByRole("button", { name: "Next history" }));
    await waitFor(() => expect(readTimeline).toHaveBeenLastCalledWith("first", 2, expect.any(AbortSignal), 0));
    const oldSignal = vi.mocked(readTimeline).mock.calls.at(-1)![2]!;
    view.rerender(<AuditTimeline requestId="second" />);
    expect(await screen.findByText("Request submitted")).toBeVisible();
    expect(oldSignal.aborted).toBe(true);
    expect(readTimeline).toHaveBeenLastCalledWith("second", 1, expect.any(AbortSignal), 0);
    await act(async () => resolveOld({ items: [item("stale", "DECISION_REJECT")], pagination: pagination(2) }));
    expect(screen.queryByText("Decision: rejected")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next history" }));
    await screen.findByText("Page 2");
    session.user.roles = ["REVIEWER"];
    view.rerender(<AuditTimeline requestId="second" />);
    expect(await screen.findByText("Request created")).toBeVisible();
    expect(readTimeline).toHaveBeenLastCalledWith("second", 1, expect.any(AbortSignal), 0);
    session.user.roles = ["REQUESTER"];
});
