import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { RevisionHistory } from "../../app/modules/requests/RevisionHistory";
import { readRevision, readRevisions } from "../../app/services/requestService";
import { draft } from "../helpers/requestLifecycle";
const session = vi.hoisted(() => ({ generation: 0, user: { id: "owner" } as { id: string } | null }));
vi.mock("../../app/modules/auth/sessionContext", () => ({ useSession: () => session }));
vi.mock("../../app/services/requestService", () => ({ readRevision: vi.fn(), readRevisions: vi.fn() }));
test("RR-AC-10 pages revisions and does not fall back to current values on failure", async () =>
{
    const first = { id: "first", revisionNumber: 1, cycleId: "cycle" };
    vi.mocked(readRevisions).mockResolvedValueOnce({ items: [first], pagination: { currentPage: 1, hasPrevious: false, hasNext: true } } as never).mockResolvedValueOnce({ items: [], pagination: { currentPage: 2, hasPrevious: true, hasNext: false } } as never);
    vi.mocked(readRevision).mockRejectedValueOnce(new Error("unavailable"));
    render(<RevisionHistory detail={draft} definition={null} />);
    fireEvent.change(await screen.findByLabelText("Select revision"), { target: { value: "first" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this revision");
    expect(screen.queryByRole("region", { name: "Revision snapshot" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next revisions" }));
    expect(await screen.findByText("No submitted revisions.")).toBeVisible();
});

const page = (items: { id: string; revisionNumber: number; cycleId: string }[], currentPage = 1) => ({ items, pagination: { currentPage, hasPrevious: currentPage > 1, hasNext: currentPage === 1 } });
const snapshot = (name: string, revisionNumber: number) => ({ ...draft.workingRevision!, revisionNumber, fields: { description: name }, lineItems: [{ id: name, description: `${name} item`, quantity: "1", unitAmount: "4.00", totalAmount: "4.00" }], amount: "4.00", currency: "THB" });

test("late selected revision is aborted and cannot replace the newer read-only snapshot", async () =>
{
    const pending: { signal: AbortSignal | undefined; resolve: (value: ReturnType<typeof snapshot>) => void }[] = [];
    vi.mocked(readRevisions).mockResolvedValueOnce(page([{ id: "a", revisionNumber: 1, cycleId: "cycle-a" }, { id: "b", revisionNumber: 2, cycleId: "cycle-b" }]) as never);
    vi.mocked(readRevision).mockImplementation((_id, _revision, signal) => new Promise((resolve) => pending.push({ signal, resolve })));
    render(<RevisionHistory detail={draft} definition={null} />);
    const select = await screen.findByLabelText("Select revision");
    fireEvent.change(select, { target: { value: "a" } });
    await waitFor(() => expect(pending).toHaveLength(1));
    fireEvent.change(select, { target: { value: "b" } });
    await waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[0]!.signal?.aborted).toBe(true);
    await act(async () => pending[1]!.resolve(snapshot("New", 2)));
    expect(screen.getByRole("region", { name: "Revision snapshot" })).toHaveTextContent("New item");
    expect(screen.getByRole("region", { name: "Revision snapshot" })).toHaveTextContent("cycle-b");
    expect(screen.getByRole("region", { name: "Revision snapshot" })).toHaveTextContent(draft.workingRevision!.formDefinitionVersionId);
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    await act(async () => pending[0]!.resolve(snapshot("Old", 1)));
    expect(screen.queryByText("Old item")).not.toBeInTheDocument();
    expect(screen.getByText("New item")).toBeVisible();
});

test("retries list and snapshot, pages back, and handles an empty page", async () =>
{
    vi.mocked(readRevisions).mockRejectedValueOnce(new Error()).mockResolvedValueOnce(page([{ id: "a", revisionNumber: 1, cycleId: "cycle-a" }]) as never).mockResolvedValueOnce(page([], 2) as never).mockResolvedValueOnce(page([{ id: "a", revisionNumber: 1, cycleId: "cycle-a" }]) as never);
    vi.mocked(readRevision).mockRejectedValueOnce(new Error()).mockResolvedValueOnce(snapshot("Saved", 1));
    render(<RevisionHistory detail={draft} definition={null} />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry revisions" }));
    fireEvent.change(await screen.findByLabelText("Select revision"), { target: { value: "a" } });
    fireEvent.click(await screen.findByRole("button", { name: "Retry revision" }));
    expect(await screen.findByText("Saved item")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Next revisions" }));
    expect(await screen.findByText("No submitted revisions.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Previous revisions" }));
    expect(await screen.findByLabelText("Select revision")).toHaveValue("");
    expect(screen.queryByText("Saved item")).not.toBeInTheDocument();
});

test("account changes clear visible and pending history; logout starts no reads", async () =>
{
    session.generation = 0; session.user = { id: "owner" };
    let resolveOld!: (value: ReturnType<typeof snapshot>) => void;
    let oldSignal: AbortSignal | undefined;
    vi.mocked(readRevisions).mockResolvedValue(page([{ id: "a", revisionNumber: 1, cycleId: "cycle-a" }]) as never);
    vi.mocked(readRevision).mockImplementation((_id, _revision, signal) => 
{
 oldSignal = signal; return new Promise((resolve) => 
{
 resolveOld = resolve; 
}); 
});
    const view = render(<RevisionHistory detail={draft} definition={null} />);
    fireEvent.change(await screen.findByLabelText("Select revision"), { target: { value: "a" } });
    await waitFor(() => expect(oldSignal).toBeDefined());
    session.generation = 1; session.user = { id: "other" };
    view.rerender(<RevisionHistory detail={draft} definition={null} />);
    expect(oldSignal?.aborted).toBe(true);
    await screen.findByLabelText("Select revision");
    await act(async () => resolveOld(snapshot("Old account", 1)));
    expect(screen.queryByText("Old account item")).not.toBeInTheDocument();
    const reads = vi.mocked(readRevisions).mock.calls.length;
    session.generation = 2; session.user = null;
    view.rerender(<RevisionHistory detail={draft} definition={null} />);
    expect(screen.queryByLabelText("Select revision")).not.toBeInTheDocument();
    expect(vi.mocked(readRevisions)).toHaveBeenCalledTimes(reads);
    session.generation = 0; session.user = { id: "owner" };
});

test("logout removes an already visible revision without starting reads", async () =>
{
    session.generation = 0; session.user = { id: "owner" };
    vi.mocked(readRevisions).mockResolvedValue(page([{ id: "private", revisionNumber: 1, cycleId: "private-cycle" }]) as never);
    vi.mocked(readRevision).mockResolvedValue(snapshot("Private", 1));
    const view = render(<RevisionHistory detail={draft} definition={null} />);
    fireEvent.change(await screen.findByLabelText("Select revision"), { target: { value: "private" } });
    expect(await screen.findByText("Private item")).toBeVisible();
    expect(screen.getByText(/private-cycle/)).toBeVisible();
    const listReads = vi.mocked(readRevisions).mock.calls.length;
    const snapshotReads = vi.mocked(readRevision).mock.calls.length;
    session.generation = 1; session.user = null;
    view.rerender(<RevisionHistory detail={draft} definition={null} />);
    expect(screen.queryByText("Private item")).not.toBeInTheDocument();
    expect(screen.queryByText(/private-cycle/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Select revision")).not.toBeInTheDocument();
    expect(readRevisions).toHaveBeenCalledTimes(listReads);
    expect(readRevision).toHaveBeenCalledTimes(snapshotReads);
    session.generation = 0; session.user = { id: "owner" };
});
