import type { ReactNode } from "react";
import type { z } from "zod";
import { paginationSchema } from "@workflow/contracts";
import { ActionButton } from "~/components/actions/ActionButton";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Inbox } from "lucide-react";

interface ICollectionSort
{
    orderBy: string;
    fields: Record<string, string>;
    onChange(orderBy: string): void;
}

export interface IRequestCollectionProps<T extends { id: string }>
{
    items: T[];
    pagination: z.infer<typeof paginationSchema> | null;
    loading: boolean;
    refreshing?: boolean;
    error: string;
    columns: string[];
    emptyMessage?: string;
    loadingMessage?: string;
    requestId?: string;
    onRetry?: () => void;
    emptyAction?: ReactNode;
    sort?: ICollectionSort;
    onPageChange(page: number): void;
    renderDesktopRow(item: T): ReactNode;
    renderMobileCard(item: T): ReactNode;
}

export function RequestCollection<T extends { id: string }>({ items, pagination, loading, refreshing = false, error, columns, emptyMessage = "No requests yet.", loadingMessage = "Loading requests…", requestId, onRetry, emptyAction, sort, onPageChange, renderDesktopRow, renderMobileCard }: IRequestCollectionProps<T>)
{
    if (error) return <div role="alert" className="space-y-3 rounded-lg border bg-card p-6"><p>{error}</p>{requestId && <p className="text-sm text-muted-foreground">Request ID: <span className="select-all">{requestId}</span></p>}{onRetry && <ActionButton type="button" className="min-h-11 border px-4 hover:bg-secondary" onClick={onRetry}>Retry</ActionButton>}</div>;

    return <div className="space-y-4" aria-busy={loading || refreshing}>
        {loading && <p role="status" className="text-sm text-muted-foreground">{loadingMessage}</p>}
        {refreshing && <p role="status" className="text-sm text-muted-foreground">Refreshing results…</p>}
        {!loading && !items.length && <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card px-4 py-12 text-center"><Inbox aria-hidden="true" className="size-8 text-muted-foreground" /><p role="status" className="text-sm text-muted-foreground">{emptyMessage}</p>{emptyAction}</div>}
        {(loading || items.length > 0) && <div className="hidden overflow-x-auto rounded-lg border bg-card md:block"><table className="w-full text-left text-sm"><caption className="sr-only">Collection results</caption><thead className="bg-muted/60 text-muted-foreground"><tr>{columns.map((column) =>
        {
            const field = sort?.fields[column];
            const active = !!field && sort?.orderBy.startsWith(`${field} `);
            const descending = active && sort?.orderBy.endsWith(" desc");
            const Icon = active ? descending ? ArrowDown : ArrowUp : ArrowUpDown;
            return <th key={column} scope="col" aria-sort={field ? active ? descending ? "descending" : "ascending" : "none" : undefined} className="px-3 py-2 text-xs font-medium">{field && sort ? <ActionButton type="button" variant="ghost" className="-ml-1 min-h-9 gap-2 whitespace-nowrap px-1 text-xs" onClick={() => sort.onChange(`${field} ${active && !descending ? "desc" : "asc"}`)}>{column}<Icon aria-hidden="true" className="size-3.5" /></ActionButton> : column}</th>;
        })}</tr></thead><tbody>{loading ? [1, 2, 3].map((row) => <tr key={row}><td colSpan={Math.max(1, columns.length)} className="p-3"><div aria-hidden="true" className="h-12 rounded bg-muted motion-safe:animate-pulse" /></td></tr>) : items.map((item) => <tr key={item.id} className="border-t transition-colors hover:bg-muted/40 motion-reduce:transition-none">{renderDesktopRow(item)}</tr>)}</tbody></table></div>}
        {loading && <div aria-hidden="true" className="space-y-3 md:hidden motion-safe:animate-pulse">{[1, 2, 3].map((row) => <div key={row} className="h-24 rounded-lg border bg-muted" />)}</div>}
        {!loading && items.length > 0 && <ul className="space-y-3 md:hidden">{items.map((item) => <li key={item.id} className="rounded-lg border bg-card p-4">{renderMobileCard(item)}</li>)}</ul>}
        {!loading && pagination && <nav aria-label="Results pagination" className="flex flex-wrap items-center justify-between gap-3 text-sm"><div className="space-y-1"><p aria-live="polite" className="tabular-nums text-muted-foreground">{pagination.totalCount} results{pagination.totalPages > 0 ? ` · Page ${pagination.currentPage} of ${pagination.totalPages}` : ""}</p>{items.length > 0 && <p className="text-xs tabular-nums text-muted-foreground">Showing {(pagination.currentPage - 1) * pagination.pageSize + 1}–{(pagination.currentPage - 1) * pagination.pageSize + items.length}</p>}</div><div className="flex gap-2"><ActionButton type="button" className="min-h-11 border px-4 hover:bg-secondary disabled:pointer-events-none" disabled={refreshing || !pagination.hasPrevious} onClick={() => onPageChange(pagination.currentPage - 1)}><ChevronLeft aria-hidden="true" className="size-4" />Previous</ActionButton><ActionButton type="button" className="min-h-11 border px-4 hover:bg-secondary disabled:pointer-events-none" disabled={refreshing || !pagination.hasNext} onClick={() => onPageChange(pagination.currentPage + 1)}>Next<ChevronRight aria-hidden="true" className="size-4" /></ActionButton></div></nav>}
    </div>;
}
