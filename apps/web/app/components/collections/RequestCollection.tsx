import type { ReactNode } from "react";
import type { z } from "zod";
import { paginationSchema } from "@workflow/contracts";
import { Button } from "~/components/ui/button";

export interface IRequestCollectionProps<T extends { id: string }>
{
    items: T[];
    pagination: z.infer<typeof paginationSchema> | null;
    loading: boolean;
    error: string;
    columns: string[];
    emptyMessage?: string;
    loadingMessage?: string;
    onRetry?: () => void;
    onPageChange(page: number): void;
    renderDesktopRow(item: T): ReactNode;
    renderMobileCard(item: T): ReactNode;
}

export function RequestCollection<T extends { id: string }>({ items, pagination, loading, error, columns, emptyMessage = "No requests yet.", loadingMessage = "Loading requests…", onRetry, onPageChange, renderDesktopRow, renderMobileCard }: IRequestCollectionProps<T>)
{
    if (loading) return <p role="status">{loadingMessage}</p>;
    if (error) return <div role="alert" className="space-y-2"><p>{error}</p>{onRetry && <Button type="button" onClick={onRetry}>Retry</Button>}</div>;

    return <div className="space-y-4">
        {!items.length && <p>{emptyMessage}</p>}
        {items.length > 0 && <div className="hidden overflow-x-auto rounded-lg border md:block"><table className="w-full text-left text-sm"><thead><tr>{columns.map((column) => <th key={column} scope="col" className="p-3">{column}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={item.id} className="border-t">{renderDesktopRow(item)}</tr>)}</tbody></table></div>}
        {items.length > 0 && <ul className="space-y-3 md:hidden">{items.map((item) => <li key={item.id} className="rounded-lg border p-4">{renderMobileCard(item)}</li>)}</ul>}
        {pagination && <div className="flex flex-wrap items-center gap-3 text-sm"><span className="tabular-nums">{pagination.totalCount} results · Page {pagination.currentPage} of {pagination.totalPages}</span><Button type="button" disabled={!pagination.hasPrevious} onClick={() => onPageChange(pagination.currentPage - 1)}>Previous</Button><Button type="button" disabled={!pagination.hasNext} onClick={() => onPageChange(pagination.currentPage + 1)}>Next</Button></div>}
    </div>;
}
