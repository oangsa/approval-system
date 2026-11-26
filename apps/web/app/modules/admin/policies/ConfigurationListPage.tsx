import { useEffect, useState } from "react";
import { Link } from "react-router";
import { type ApprovalPolicyDTO, type AssignmentRuleDTO, type BudgetPolicyDTO, type IPageResult, formatMoney } from "@workflow/contracts";
import { ActionButton, actionStyles } from "~/components/actions/ActionButton";
import { CollectionDialog } from "~/components/collections/CollectionDialog";
import { RequestCollection } from "~/components/collections/RequestCollection";
import { fieldClassName } from "~/components/forms/FieldRenderer";
import { ManagedForm } from "~/components/forms/ManagedForm";
import { PageHeader } from "~/components/layout/PageHeader";
import { Input } from "~/components/ui/input";
import { useSession } from "~/modules/auth/sessionContext";
import { configurationFailure, saveAssignment, saveBudget, searchConfiguration } from "~/services/configurationService";
import { ConfigurationReference } from "./ConfigurationReference";
import { ConfigurationLookup } from "./ConfigurationLookup";
export type AdminConfigurationKind = "approval-policies" | "reviewer-assignments" | "budget-policies";
type Row = ApprovalPolicyDTO | AssignmentRuleDTO | BudgetPolicyDTO;
interface IConfigurationListPageProps { kind: AdminConfigurationKind; }
const titles = { "approval-policies": "Approval policies", "reviewer-assignments": "Reviewer assignments", "budget-policies": "Budget policies" };
export function ConfigurationListPage({ kind }: IConfigurationListPageProps)
{
    const { user, generation } = useSession();
    const admin = !!user?.roles.includes("ADMINISTRATOR");
    const [input, setInput] = useState("");
    const [term, setTerm] = useState("");
    const [active, setActive] = useState("all");
    const [departmentId, setDepartmentId] = useState<string | null>(null);
    const [typeId, setTypeId] = useState<string | null>(null);
    const [orderBy, setOrderBy] = useState(kind === "approval-policies" ? "code asc" : kind === "reviewer-assignments" ? "key asc" : "maxAmount asc");
    const [page, setPage] = useState(1);
    const [retry, setRetry] = useState(0);
    const [result, setResult] = useState<IPageResult<Row> | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [editor, setEditor] = useState<AssignmentRuleDTO | BudgetPolicyDTO | "new" | null>(null);
    const [notice, setNotice] = useState("");
    useEffect(() =>
    {
        const timer = setTimeout(() =>
        {
            setTerm(input.trim()); setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [input]);
    useEffect(() =>
    {
        if (!admin) return;
        const controller = new AbortController();
        setLoading(true); setError("");
        const name = kind === "approval-policies" ? "code" : "key";
        void searchConfiguration(kind, {
            pageNumber: page, pageSize: 20, orderBy, search: [
                ...(active === "all" ? [] : [{ name: kind === "approval-policies" ? "isEnabled" : "isActive", condition: "EQUAL", value: active === "active" }]),
                ...(departmentId ? [{ name: "departmentId", condition: "EQUAL", value: departmentId }] : []),
                ...(typeId ? [{ name: "typeId", condition: "EQUAL", value: typeId }] : []),
            ], ...(term && kind !== "budget-policies" ? { searchTerm: { name, value: term } } : {})
        }, controller.signal, generation).then((next) =>
        {
            if (!controller.signal.aborted) setResult({ ...next, items: next.items.filter((item): item is Row => "stages" in item || "reviewerUserIds" in item || "maxAmount" in item) });
        }).catch((failure: unknown) =>
        {
            if (!controller.signal.aborted) setError(configurationFailure(failure));
        }).finally(() =>
        {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [admin, generation, kind, term, active, departmentId, typeId, orderBy, page, retry]);
    if (!admin) return <p role="alert">Administrator access required.</p>;
    function identity(item: Row)
    {
        if ("code" in item) return <Link className="font-medium underline" to={`/admin/approval-policies/${item.id}`}>{item.code}</Link>;
        return <span className="font-medium">{"key" in item ? item.key : `${formatMoney(item.maxAmount)} ceiling`}</span>;
    }
    function details(item: Row)
    {
        return "stages" in item ? `Priority ${item.priority} · ${item.stages.length} stage(s) · ALL must approve · ${item.isPublished ? `Published v${item.versionNumber}` : "Draft"}` : "reviewerUserIds" in item ? `${item.reviewerUserIds.length} reviewer(s) · ${item.departmentId ? "Department-specific" : "All departments"}` : `${item.departmentId ? "Department-specific" : "Type-wide"} hard ceiling`;
    }
    function scope(item: Row)
    {
        return <p className="mt-1 text-xs text-muted-foreground">{"typeId" in item && <><ConfigurationReference kind="types" id={item.typeId} /> · </>}{item.departmentId ? <ConfigurationReference kind="departments" id={item.departmentId} /> : "All departments"}</p>;
    }
    function edit(item: Row)
    {
        return "stages" in item ? <Link className={actionStyles({ size: "small" })} to={`/admin/approval-policies/${item.id}`}>Open policy</Link> : <ActionButton type="button" size="small" onClick={() => setEditor(item)}>Edit {"key" in item ? item.key : "ceiling"}</ActionButton>;
    }
    return <div className="min-w-0 space-y-6 wrap-anywhere">
        <PageHeader title={titles[kind]} description={kind === "budget-policies" ? "Hard amount ceilings only. No remaining balance or payment accounting. Approval thresholds belong to approval policies." : "Configuration affects future cycles only. Accepted assignments and decisions retain their snapshots."} actions={kind === "approval-policies" ? <Link className={actionStyles({ variant: "primary" })} to="/admin/approval-policies/new">New policy</Link> : <ActionButton type="button" variant="primary" onClick={() => setEditor("new")}>New {kind === "reviewer-assignments" ? "assignment" : "ceiling"}</ActionButton>} />
        {notice && <p role="status" className="text-sm">{notice}</p>}
        <section className="flex flex-wrap gap-4 rounded-xl border bg-card p-4">
            {kind !== "budget-policies" && <label className="grid gap-2 text-sm">Search {kind === "approval-policies" ? "code" : "key"}<Input value={input} onChange={(event) => setInput(event.target.value)} /></label>}
            <label className="grid gap-2 text-sm">Status<select className={fieldClassName} value={active} onChange={(event) =>
            {
                setActive(event.target.value); setPage(1);
            }}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
            <ConfigurationLookup kind="departments" label="Department filter" optional values={departmentId ? [departmentId] : []} onChange={(ids) =>
            {
                setDepartmentId(ids[0] ?? null); setPage(1);
            }} />
            {kind !== "reviewer-assignments" && <ConfigurationLookup kind="types" label="Request type filter" optional emptyLabel="All request types" values={typeId ? [typeId] : []} onChange={(ids) =>
            {
                setTypeId(ids[0] ?? null); setPage(1);
            }} />}
        </section>
        {kind === "approval-policies" && <p className="text-sm text-muted-foreground">Highest matching numeric priority wins. Equal highest priorities block submission with AMBIGUOUS_APPROVAL_POLICY. Check overlaps across all enabled published policies.</p>}
        <RequestCollection items={result?.items ?? []} pagination={result?.pagination ?? null} loading={loading} error={error} onRetry={() => setRetry((value) => value + 1)} columns={["Configuration", "Routing", "State", "Actions"]} emptyMessage="No configuration matches. Create a record or clear filters." onPageChange={setPage}
            sort={{
                orderBy, fields: { Configuration: kind === "approval-policies" ? "code" : kind === "reviewer-assignments" ? "key" : "maxAmount", ...(kind === "approval-policies" ? { Routing: "priority" } : {}) }, onChange: (next) =>
                {
                    setOrderBy(next); setPage(1);
                }
            }}
            renderDesktopRow={(item) => <><td className="p-3">{identity(item)}{scope(item)}</td><td className="p-3 text-sm text-muted-foreground">{details(item)}</td><td className="p-3">{("isEnabled" in item ? item.isEnabled : item.isActive) ? "Active" : "Inactive"} · version {item.version}</td><td className="p-3">{edit(item)}</td></>}
            renderMobileCard={(item) => <div className="space-y-3">{identity(item)}{scope(item)}<p className="text-sm">{details(item)}</p>{edit(item)}</div>} />
        {editor && kind !== "approval-policies" && <CollectionDialog title={kind === "reviewer-assignments" ? "Reviewer assignment" : "Budget ceiling"} description="Future cycles only. Server validates active references and optimistic version." onClose={() => setEditor(null)}><ConfigurationRecordForm kind={kind} initial={editor} onSaved={() =>
        {
            setEditor(null); setRetry((value) => value + 1); setNotice("Configuration saved.");
        }} /></CollectionDialog>}
    </div>;
}
interface IConfigurationRecordFormProps { kind: "reviewer-assignments" | "budget-policies"; initial: AssignmentRuleDTO | BudgetPolicyDTO | "new"; onSaved(): void; }
function ConfigurationRecordForm({ kind, initial, onSaved }: IConfigurationRecordFormProps)
{
    const { generation } = useSession();
    const existing = initial === "new" ? null : initial;
    const [key, setKey] = useState(existing && "key" in existing ? existing.key : "");
    const [departmentId, setDepartmentId] = useState(existing?.departmentId ?? null);
    const [typeId, setTypeId] = useState(existing && "typeId" in existing ? existing.typeId : "");
    const [reviewerUserIds, setReviewerUserIds] = useState(existing && "reviewerUserIds" in existing ? existing.reviewerUserIds : []);
    const [maxAmount, setMaxAmount] = useState(existing && "maxAmount" in existing ? existing.maxAmount : "");
    const [isActive, setIsActive] = useState(existing?.isActive ?? true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    async function save()
    {
        setBusy(true); setError("");
        try
        {
            if (kind === "reviewer-assignments")
            {
                if (existing) await saveAssignment(existing.id, { expectedVersion: existing.version, departmentId, reviewerUserIds, isActive }, generation);
                else await saveAssignment(null, { key, departmentId, reviewerUserIds, isActive }, generation);
            }
            else await saveBudget(existing?.id ?? null, { typeId, departmentId, maxAmount, isActive, ...(existing ? { expectedVersion: existing.version } : {}) }, generation);
            onSaved();
        }
        catch (failure)
        {
            setError(configurationFailure(failure));
        }
        finally
        {
            setBusy(false);
        }
    }
    return <div className="p-6"><ManagedForm busy={busy} onSubmit={(event) =>
    {
        event.preventDefault(); void save();
    }}>
        {kind === "reviewer-assignments" ? <>
            <label className="grid gap-2 text-sm">Assignment key<Input value={key} readOnly={!!existing} className={existing ? "bg-muted text-muted-foreground" : undefined} onChange={(event) =>
            {
                if (!existing) setKey(event.target.value);
            }} /></label>
            <ConfigurationLookup kind="reviewers" label="Eligible reviewers" values={reviewerUserIds} multiple onChange={setReviewerUserIds} />
            <p className="text-sm text-muted-foreground">All selected reviewers receive required parallel slots. Active Reviewer role is checked again on submit; self-approval blocks the entire cycle.</p>
        </> : <>
            <ConfigurationLookup kind="types" label="Request type" values={typeId ? [typeId] : []} onChange={(ids) => setTypeId(ids[0] ?? "")} />
            <label className="grid gap-2 text-sm">Maximum amount<Input inputMode="decimal" value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} /></label>
            <p className="text-sm text-muted-foreground">Amount at the ceiling is allowed. Above it returns 422 BUDGET_LIMIT_EXCEEDED. Department-specific limit overrides type-wide limit. No balance ledger.</p>
        </>}
        <ConfigurationLookup kind="departments" label="Department" values={departmentId ? [departmentId] : []} optional onChange={(ids) => setDepartmentId(ids[0] ?? null)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} />Active</label>
        {error && <p role="alert" className="whitespace-pre-wrap text-sm text-destructive">{error}</p>}
        <ActionButton type="submit" variant="primary">{busy ? "Saving…" : "Save configuration"}</ActionButton>
    </ManagedForm></div>;
}
