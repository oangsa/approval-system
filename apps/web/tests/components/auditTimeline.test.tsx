import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { AuditTimeline } from "../../app/modules/requests/AuditTimeline";
import { readTimeline } from "../../app/services/decisionService";
import { ApiFailure } from "../../app/api/errors";
vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => ({ generation: 0, user: { id: "owner" } }) }));
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
