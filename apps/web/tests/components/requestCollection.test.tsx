import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { RequestCollection } from "../../app/components/collections/RequestCollection";

test("collection renders responsive representations and server pagination", () =>
{
    const change = vi.fn();
    render(<RequestCollection items={[{ id: "1", title: "First" }]} pagination={{ currentPage: 1, pageSize: 1, totalPages: 2, totalCount: 2, hasPrevious: false, hasNext: true }} loading={false} error="" columns={["Title"]} onPageChange={change} renderDesktopRow={(item) => <td>{item.title}</td>} renderMobileCard={(item) => <span>{item.title}</span>} />);
    expect(screen.getAllByText("First")).toHaveLength(2);
    expect(screen.getByText("2 results · Page 1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(change).toHaveBeenCalledWith(2);
});

test("collection exposes retry for failures", () =>
{
    const retry = vi.fn();
    render(<RequestCollection items={[]} pagination={null} loading={false} error="Unavailable" columns={[]} onPageChange={vi.fn()} onRetry={retry} renderDesktopRow={() => null} renderMobileCard={() => null} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledOnce();
});

test("collection reports the actual final-page range instead of page capacity", () =>
{
    render(<RequestCollection items={[{ id: "last" }]} pagination={{ currentPage: 3, pageSize: 10, totalPages: 3, totalCount: 21, hasPrevious: true, hasNext: false }} loading={false} error="" columns={["Request"]} onPageChange={vi.fn()} renderDesktopRow={() => <td>Last result</td>} renderMobileCard={() => <span>Last result</span>} />);
    expect(screen.getByText("Showing 21–21")).toBeVisible();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
});
