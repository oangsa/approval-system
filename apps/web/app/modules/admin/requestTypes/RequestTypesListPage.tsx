import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { Plus, Search } from "lucide-react";
import { adminRequestTypeSearchSchema, type AdminRequestTypeSearch, type AdminRequestTypeSummary, type IAdminRequestTypeSearchResult } from "@workflow/contracts";
import { ActionButton, actionStyles } from "~/components/actions/ActionButton";
import { RequestCollection } from "~/components/collections/RequestCollection";
import { fieldClassName } from "~/components/forms/FieldRenderer";
import { PageHeader } from "~/components/layout/PageHeader";
import { Input } from "~/components/ui/input";
import { useSession } from "~/modules/auth/sessionContext";
import { presentFailure } from "~/modules/requests/requestPresentation";
import { RequestTypeActionAttempt, searchAdminRequestTypes, setAdminRequestTypeEnabled } from "~/services/requestTypeService";

export function RequestTypesListPage()
{
    const { user, generation } = useSession();
    const isAdmin = !!user?.roles.includes("ADMINISTRATOR");
    const [searchInput, setSearchInput] = useState("");
    const [term, setTerm] = useState("");
    const [enabledFilter, setEnabledFilter] = useState<"all" | "enabled" | "disabled">("all");
    const [draftFilter, setDraftFilter] = useState<"all" | "draft" | "published">("all");
    const [orderBy, setOrderBy] = useState<AdminRequestTypeSearch["orderBy"]>("code asc");
    const [pageNumber, setPageNumber] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [attempt, setAttempt] = useState(0);
    const [result, setResult] = useState<IAdminRequestTypeSearchResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [requestId, setRequestId] = useState<string | undefined>(undefined);
    const [toggleTarget, setToggleTarget] = useState<AdminRequestTypeSummary | null>(null);
    const [toggleBusy, setToggleBusy] = useState(false);
    const [toggleError, setToggleError] = useState("");
    const toggleDialog = useRef<HTMLDialogElement>(null);
    const attempts = useRef(new RequestTypeActionAttempt());

    useEffect(() =>
    {
        const trimmed = searchInput.trim();
        if (trimmed === term) return;
        const timer = setTimeout(() =>
        {
            setTerm(trimmed);
            setPageNumber(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchInput, term]);

    useEffect(() =>
    {
        if (!isAdmin) return;
        const controller = new AbortController();
        setLoading(true);
        setError("");
        const search: AdminRequestTypeSearch["search"] = [];
        if (enabledFilter !== "all") search.push({ name: "isEnabled", condition: "EQUAL", value: enabledFilter === "enabled" });
        if (draftFilter === "draft") search.push({ name: "hasDraft", condition: "EQUAL", value: true });
        if (draftFilter === "published")
        {
            search.push({ name: "isPublished", condition: "EQUAL", value: true });
            search.push({ name: "hasDraft", condition: "EQUAL", value: false });
        }
        const query = adminRequestTypeSearchSchema.parse({
            pageNumber,
            pageSize,
            search,
            ...(term ? { searchTerm: { name: "code,name", value: term } } : {}),
            orderBy,
        });
        searchAdminRequestTypes(query, controller.signal, generation).then((data) =>
        {
            if (!controller.signal.aborted)
            {
                setResult(data);
                setError("");
                setRequestId(undefined);
            }
        }).catch((failure: unknown) =>
        {
            if (!controller.signal.aborted)
            {
                const view = presentFailure(failure, "Could not load request types.");
                setError(view.message);
                setRequestId(view.requestId);
            }
        }).finally(() =>
        {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [isAdmin, generation, term, enabledFilter, draftFilter, orderBy, pageNumber, pageSize, attempt]);

    useEffect(() =>
    {
        if (!toggleTarget) return;
        const panel = toggleDialog.current;
        const target = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
        panel?.showModal();
        return () =>
        {
            panel?.close();
            if (target && target.isConnected && !target.hasAttribute("disabled")) target.focus();
        };
    }, [toggleTarget]);

    if (!isAdmin)
    {
        return <div className="mx-auto max-w-5xl space-y-6">
            <div role="alert" className="space-y-3 rounded-lg border bg-card p-6">
                <p>Administrator access is required to manage request types.</p>
                <Link className="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground" to="/dashboard">Go to Dashboard</Link>
            </div>
        </div>;
    }

    async function confirmToggle(): Promise<void>
    {
        if (!toggleTarget || toggleBusy) return;
        setToggleBusy(true);
        setToggleError("");
        try
        {
            await setAdminRequestTypeEnabled(toggleTarget.id, !toggleTarget.isEnabled, { expectedVersion: toggleTarget.version }, attempts.current, generation);
            attempts.current.Clear();
            setToggleTarget(null);
            setAttempt((value) => value + 1);
        }
        catch (failure: unknown)
        {
            const view = presentFailure(failure, "Could not update request type status.");
            setToggleError(view.requestId ? `${view.message} Request ID: ${view.requestId}` : view.message);
        }
        finally
        {
            setToggleBusy(false);
        }
    }

    const filtered = !!term || enabledFilter !== "all" || draftFilter !== "all";

    function clearFilters(): void
    {
        setSearchInput("");
        setTerm("");
        setEnabledFilter("all");
        setDraftFilter("all");
        setPageNumber(1);
    }

    return <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
            title="Request Types"
            description="Create, version, preview, and publish configurable request forms."
            actions={<Link className={actionStyles({ variant: "primary" })} to="/admin/request-types/new"><Plus aria-hidden="true" className="size-4" />New request type</Link>}
        />
        <section aria-label="Request type search and filters" className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <div className="grid gap-1.5 text-sm font-medium">
                <label htmlFor="admin-type-search">Search</label>
                <span className="relative">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
                    <Input id="admin-type-search" className="min-h-11 pl-9" value={searchInput} maxLength={100} onChange={(event) => setSearchInput(event.target.value)} placeholder="Type code or name…" />
                </span>
            </div>
            <div className="grid gap-1.5 text-sm font-medium">
                <label htmlFor="admin-type-enabled">Status</label>
                <select id="admin-type-enabled" className={`${fieldClassName} min-h-11`} value={enabledFilter} onChange={(event) =>
                {
                    setEnabledFilter(event.target.value as "all" | "enabled" | "disabled");
                    setPageNumber(1);
                }}>
                    <option value="all">All statuses</option>
                    <option value="enabled">Enabled</option>
                    <option value="disabled">Disabled</option>
                </select>
            </div>
            <div className="grid gap-1.5 text-sm font-medium">
                <label htmlFor="admin-type-draft">Draft state</label>
                <select id="admin-type-draft" className={`${fieldClassName} min-h-11`} value={draftFilter} onChange={(event) =>
                {
                    setDraftFilter(event.target.value as "all" | "draft" | "published");
                    setPageNumber(1);
                }}>
                    <option value="all">All definitions</option>
                    <option value="draft">Has active draft</option>
                    <option value="published">Published only</option>
                </select>
            </div>
        </section>

        <RequestCollection
            items={result?.items ?? []}
            pagination={result?.pagination ?? null}
            loading={loading}
            error={error}
            requestId={requestId}
            onRetry={() => setAttempt((value) => value + 1)}
            columns={["Code", "Name", "Version", "State", "Monetary", "Actions"]}
            emptyMessage={filtered ? "No request types match your filters." : "No request types configured yet."}
            emptyAction={filtered ? <ActionButton type="button" onClick={clearFilters}>Reset filters</ActionButton> : undefined}
            loadingMessage="Loading request types…"
            sort={{
                orderBy,
                fields: { Code: "code", Name: "name" },
                onChange: (nextOrder) =>
                {
                    setOrderBy(nextOrder as AdminRequestTypeSearch["orderBy"]);
                    setPageNumber(1);
                },
            }}
            paginationOptions={<div className="flex flex-wrap items-center gap-2">
                <label htmlFor="admin-type-page-size" className="text-muted-foreground">Rows per page</label>
                <select id="admin-type-page-size" className={`${fieldClassName} min-h-11 w-auto`} value={pageSize} onChange={(event) =>
                {
                    setPageSize(Number(event.target.value));
                    setPageNumber(1);
                }}>
                    {[10, 20, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
            </div>}
            onPageChange={(next) => setPageNumber(next)}
            renderDesktopRow={(item) => <>
                <td className="whitespace-nowrap p-3 font-mono text-xs font-medium">{item.code}</td>
                <td className="p-3">
                    <Link className="font-medium underline-offset-4 hover:underline" to={`/admin/request-types/${item.id}`}>{item.name.en}</Link>
                    {item.name.th && <p className="text-xs text-muted-foreground">{item.name.th}</p>}
                </td>
                <td className="whitespace-nowrap p-3 tabular-nums text-muted-foreground">{item.publishedVersionNumber ? `v${item.publishedVersionNumber}` : "Unpublished"}{item.hasDraft ? " · Draft" : ""}</td>
                <td className="whitespace-nowrap p-3">{item.isEnabled ? "Enabled" : "Disabled"}</td>
                <td className="whitespace-nowrap p-3 text-muted-foreground">{item.monetary ? item.supportsLineItems ? "Line items" : "Direct amount" : "Non-monetary"}</td>
                <td className="whitespace-nowrap p-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <Link className={actionStyles({ size: "small" })} to={`/admin/request-types/${item.id}`}>{item.hasDraft ? "Edit draft" : "Open"}</Link>
                        <ActionButton type="button" size="small" onClick={() =>
                        {
                            setToggleError("");
                            setToggleTarget(item);
                        }}>{item.isEnabled ? "Disable" : "Enable"}</ActionButton>
                    </div>
                </td>
            </>}
            renderMobileCard={(item) => <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{item.code}</span>
                    <span className="text-xs font-medium">{item.isEnabled ? "Enabled" : "Disabled"}</span>
                </div>
                <Link className="block font-medium underline-offset-4 hover:underline" to={`/admin/request-types/${item.id}`}>{item.name.en}</Link>
                <p className="text-xs text-muted-foreground">{item.publishedVersionNumber ? `v${item.publishedVersionNumber}` : "Unpublished"}{item.hasDraft ? " · Draft" : ""} · {item.monetary ? item.supportsLineItems ? "Line items" : "Direct amount" : "Non-monetary"}</p>
                <div className="flex flex-wrap gap-2 pt-2">
                    <Link className={actionStyles({ size: "small" })} to={`/admin/request-types/${item.id}`}>{item.hasDraft ? "Edit draft" : "Open"}</Link>
                    <ActionButton type="button" size="small" onClick={() =>
                    {
                        setToggleError("");
                        setToggleTarget(item);
                    }}>{item.isEnabled ? "Disable" : "Enable"}</ActionButton>
                </div>
            </div>}
        />

        {toggleTarget && <dialog ref={toggleDialog} aria-labelledby="toggle-type-title" onCancel={(event) =>
        {
            event.preventDefault();
            if (!toggleBusy) setToggleTarget(null);
        }} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md space-y-4 rounded-xl border bg-background p-6 text-foreground backdrop:bg-black/50">
            <h2 id="toggle-type-title" className="text-lg font-semibold">{toggleTarget.isEnabled ? "Disable request type?" : "Enable request type?"}</h2>
            <p className="text-sm text-muted-foreground">{toggleTarget.isEnabled ? "Disabling stops new drafts and first submissions while preserving historical and returned requests." : "Enabling allows requesters to start new requests using the active published version."}</p>
            {toggleError && <p role="alert" className="text-sm text-destructive">{toggleError}</p>}
            <div className="flex justify-end gap-2">
                <ActionButton type="button" variant="outline" disabled={toggleBusy} onClick={() => setToggleTarget(null)}>Cancel</ActionButton>
                <ActionButton type="button" variant="primary" disabled={toggleBusy} onClick={() => void confirmToggle()}>{toggleBusy ? "Updating…" : toggleTarget.isEnabled ? "Confirm disable" : "Confirm enable"}</ActionButton>
            </div>
        </dialog>}
    </div>;
}
