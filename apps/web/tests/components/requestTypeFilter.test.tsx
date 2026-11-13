import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import type { PublishedRequestType } from "@workflow/contracts";
import { RequestTypeFilter } from "../../app/modules/requests/RequestTypeFilter";
import { searchRequestTypes } from "../../app/services/requestService";

vi.mock("../../app/services/requestService", () => ({ searchRequestTypes: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const type: PublishedRequestType = { id: "11111111-1111-4111-8111-111111111111", code: "OPS", name: { en: "Operations" }, versionId: "22222222-2222-4222-8222-222222222222", versionNumber: 1, isEnabled: true, supportsLineItems: false, monetary: false, fields: [], publishedAt: "2026-11-01T00:00:00Z" };
const page = { items: [type], pagination: { currentPage: 1, pageSize: 20, totalPages: 2, totalCount: 21, hasPrevious: false, hasNext: true } };

test("type selection uses server pages and preserves missing selected identity until cleared", async () =>
{
    vi.mocked(searchRequestTypes).mockResolvedValue(page);
    const change = vi.fn();
    render(<RequestTypeFilter value="unavailable" generation={4} onChange={change} />);
    expect(searchRequestTypes).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Request type Selected request type" }));
    expect(await screen.findByRole("button", { name: "Operations (OPS)" })).toBeVisible();
    expect(searchRequestTypes).toHaveBeenLastCalledWith("", 1, expect.any(AbortSignal), 4);
    fireEvent.click(screen.getByRole("button", { name: "Next types" }));
    await waitFor(() => expect(searchRequestTypes).toHaveBeenLastCalledWith("", 2, expect.any(AbortSignal), 4));
    fireEvent.click(await screen.findByRole("button", { name: "Operations (OPS)" }));
    expect(change).toHaveBeenLastCalledWith(type.id);
    fireEvent.click(screen.getByRole("button", { name: "Clear request type" }));
    expect(change).toHaveBeenLastCalledWith("");
});

test("closed and superseded lookup responses are ignored; errors remain retryable", async () =>
{
    const pending: { signal: AbortSignal; resolve: (result: typeof page) => void }[] = [];
    vi.mocked(searchRequestTypes).mockImplementation((_term, _page, signal) => new Promise((resolve) => pending.push({ signal, resolve })));
    const view = render(<RequestTypeFilter value="" generation={1} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Request type All request types" }));
    await waitFor(() => expect(pending).toHaveLength(1));
    view.rerender(<RequestTypeFilter value="" generation={2} onChange={vi.fn()} />);
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0]!.signal.aborted).toBe(true);
    await act(async () => pending[0]!.resolve(page));
    expect(screen.queryByText("Operations")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Request type All request types" }));
    expect(pending[1]!.signal.aborted).toBe(true);
    vi.mocked(searchRequestTypes).mockRejectedValueOnce(new Error("network"));
    fireEvent.click(screen.getByRole("button", { name: "Request type All request types" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load request types.");
    vi.mocked(searchRequestTypes).mockResolvedValueOnce(page);
    fireEvent.click(screen.getByRole("button", { name: "Retry request types" }));
    expect(await screen.findByRole("button", { name: "Operations (OPS)" })).toBeVisible();
});
