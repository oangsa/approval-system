import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { compareDecimals, moneySchema, policyContentSchema, type ApprovalPolicyDTO, type PolicyContent } from "@workflow/contracts";
import { ActionButton } from "~/components/actions/ActionButton";
import { CollectionDialog } from "~/components/collections/CollectionDialog";
import { ManagedForm } from "~/components/forms/ManagedForm";
import { PageHeader } from "~/components/layout/PageHeader";
import { Input } from "~/components/ui/input";
import { useSession } from "~/modules/auth/sessionContext";
import { configurationFailure, createPolicy, policyAction, searchConfiguration } from "~/services/configurationService";
import { RequestTypeActionAttempt } from "~/services/requestTypeService";
import { ConfigurationLookup } from "./ConfigurationLookup";
const initial: PolicyContent = { typeId: "", departmentId: null, priority: 10, minAmount: null, maxAmount: null, stages: [{ stageNumber: 1, reviewerAssignmentKeys: [], slaBusinessMinutes: 480 }] };
function contentOf(policy: ApprovalPolicyDTO): PolicyContent
{
    const { typeId, departmentId, priority, minAmount, maxAmount, stages } = policy;
    return { typeId, departmentId, priority, minAmount, maxAmount, stages };
}
export function ApprovalPolicyEditorPage()
{
    const { id = "new" } = useParams();
    const navigate = useNavigate();
    const { user, generation } = useSession();
    const admin = !!user?.roles.includes("ADMINISTRATOR");
    const [record, setRecord] = useState<ApprovalPolicyDTO | null>(null);
    const [content, setContent] = useState<PolicyContent>(initial);
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(id !== "new");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");
    const [retry, setRetry] = useState(0);
    const [confirmation, setConfirmation] = useState<"publish" | "disable" | null>(null);
    const [sample, setSample] = useState("");
    const attempts = useRef(new RequestTypeActionAttempt());
    const dirty = !!record && JSON.stringify(content) !== JSON.stringify(contentOf(record));
    const editable = id === "new" || !!record && !record.isPublished;
    useEffect(() =>
    {
        if (!admin || id === "new") return;
        const controller = new AbortController();
        setLoading(true); setError("");
        void searchConfiguration("approval-policies", { search: [{ name: "id", condition: "EQUAL", value: id }], pageSize: 1 }, controller.signal, generation).then((result) =>
        {
            if (controller.signal.aborted) return;
            const item = result.items[0];
            if (!item || !("stages" in item))
            {
                setError("Policy unavailable."); return;
            }
            setRecord(item); setContent(contentOf(item)); setCode(item.code); attempts.current.Clear();
        }).catch((failure: unknown) =>
        {
            if (!controller.signal.aborted) setError(configurationFailure(failure));
        }).finally(() =>
        {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [admin, id, generation, retry]);
    async function action(operation: "save" | "branch" | "publish" | "disable")
    {
        setBusy(true); setError(""); setNotice("");
        try
        {
            const result = operation === "save" && !record ? await createPolicy({ ...content, code }, generation) : await policyAction(record!.id, operation === "save" ? "patch" : operation, { expectedVersion: record!.version, ...(operation === "save" ? policyContentSchema.parse(content) : {}) }, attempts.current, generation);
            setRecord(result); setContent(contentOf(result)); setCode(result.code); attempts.current.Clear();
            setNotice(operation === "publish" ? `Published immutable version ${result.versionNumber}. Future cycles use this configuration.` : operation === "branch" ? "New draft branched from published version." : operation === "disable" ? "Disabled for future cycles. Accepted snapshots remain unchanged." : "Draft saved.");
            setConfirmation(null);
            if (id === "new") void navigate(`/admin/approval-policies/${result.id}`, { replace: true });
        }
        catch (failure)
        {
            setError(configurationFailure(failure)); setConfirmation(null);
        }
        finally
        {
            setBusy(false);
        }
    }
    if (!admin) return <p role="alert">Administrator access required.</p>;
    if (loading) return <p role="status">Loading policy…</p>;
    function updateStage(index: number, changes: Partial<PolicyContent["stages"][number]>)
    {
        setContent((current) => ({ ...current, stages: current.stages.map((stage, position) => position === index ? { ...stage, ...changes } : stage) }));
    }
    const validSample = moneySchema.safeParse(sample).success;
    const validBounds = [content.minAmount, content.maxAmount].every((value) => value === null || moneySchema.safeParse(value).success);
    const match = validBounds && validSample && (content.minAmount === null || compareDecimals(sample, content.minAmount) >= 0) && (content.maxAmount === null || compareDecimals(sample, content.maxAmount) <= 0);
    return <div className="min-w-0 space-y-6 wrap-anywhere">
        <PageHeader title={record ? `Policy ${record.code}` : "New approval policy"} description="One or two sequential stages. Every parallel slot must approve. Published content is immutable." actions={<Link className="text-sm underline" to="/admin/approval-policies">Back to policies</Link>} />
        {notice && <p role="status" className="text-sm">{notice}</p>}
        {error && <div role="alert" className="space-y-2 rounded-xl border p-4"><p className="text-destructive">{error}</p>{id !== "new" && <ActionButton type="button" onClick={() => setRetry((value) => value + 1)}>Reload server version</ActionButton>}</div>}
        {(record || id === "new") && <>
            <section className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 text-sm">
                <p>{record ? `${record.isPublished ? `Published v${record.versionNumber}` : "Editable draft"} · version ${record.version} · ${record.isEnabled ? "Enabled" : "Disabled"}` : "Unpublished draft"}</p>
                {record?.isPublished && <ActionButton type="button" disabled={busy} onClick={() => void action("branch")}>Branch new draft</ActionButton>}
                {record && !record.isPublished && <ActionButton type="button" disabled={busy || dirty} onClick={() => setConfirmation("publish")}>Publish version</ActionButton>}
                {record?.isEnabled && <ActionButton type="button" disabled={busy || dirty} onClick={() => setConfirmation("disable")}>Disable policy</ActionButton>}
                {dirty && <p className="text-muted-foreground">Save draft before publishing or disabling.</p>}
            </section>
            <ManagedForm busy={busy} onSubmit={(event) =>
            {
                event.preventDefault(); if (editable) void action("save");
            }}>
                <fieldset disabled={!editable} className="min-w-0 space-y-6">
                    <section className="grid gap-6 rounded-xl border bg-card p-5 sm:grid-cols-2">
                        <label className="grid gap-2 text-sm">Policy code<Input value={code} disabled={!!record} onChange={(event) => setCode(event.target.value)} /></label>
                        <label className="grid gap-2 text-sm">Numeric priority<Input type="number" value={content.priority} onChange={(event) => setContent({ ...content, priority: Number(event.target.value) })} /></label>
                        <ConfigurationLookup kind="types" label="Request type" values={content.typeId ? [content.typeId] : []} onChange={(ids) => setContent({ ...content, typeId: ids[0] ?? "" })} />
                        <ConfigurationLookup kind="departments" label="Department" values={content.departmentId ? [content.departmentId] : []} optional onChange={(ids) => setContent({ ...content, departmentId: ids[0] ?? null })} />
                        <label className="grid gap-2 text-sm">Minimum amount (inclusive, optional)<Input inputMode="decimal" value={content.minAmount ?? ""} onChange={(event) => setContent({ ...content, minAmount: event.target.value || null })} /></label>
                        <label className="grid gap-2 text-sm">Maximum amount (inclusive, optional)<Input inputMode="decimal" value={content.maxAmount ?? ""} onChange={(event) => setContent({ ...content, maxAmount: event.target.value || null })} /></label>
                    </section>
                    {content.stages.map((stage, index) => <section key={stage.stageNumber} aria-label={`Stage ${stage.stageNumber}`} className="space-y-4 rounded-xl border bg-card p-5">
                        <h2 className="font-semibold">Stage {stage.stageNumber} — ALL must approve</h2>
                        <ConfigurationLookup kind="assignments" label={`Stage ${stage.stageNumber} assignment keys`} values={stage.reviewerAssignmentKeys} multiple onChange={(ids) => updateStage(index, { reviewerAssignmentKeys: ids })} />
                        <label className="grid max-w-xs gap-2 text-sm">Stage {stage.stageNumber} SLA business minutes<Input type="number" min="1" value={stage.slaBusinessMinutes} onChange={(event) => updateStage(index, { slaBusinessMinutes: Number(event.target.value) })} /></label>
                        <p className="text-sm text-muted-foreground">Default 480 minutes. Mon–Fri, 09:00–17:00 Asia/Bangkok. {index === 0 ? "Starts at submission." : "Starts when this stage becomes actionable."}</p>
                        {index === 1 && <ActionButton type="button" onClick={() => setContent({ ...content, stages: content.stages.slice(0, 1) })}>Remove stage 2</ActionButton>}
                    </section>)}
                    {content.stages.length === 1 && <ActionButton type="button" onClick={() => setContent({ ...content, stages: [...content.stages, { stageNumber: 2, reviewerAssignmentKeys: [], slaBusinessMinutes: 480 }] })}>Add stage 2</ActionButton>}
                    {editable && <ActionButton type="submit" variant="primary">{busy ? "Saving…" : "Save draft"}</ActionButton>}
                </fieldset>
            </ManagedForm>
            <aside aria-label="Local routing explanation" className="space-y-3 rounded-xl border bg-muted/30 p-5">
                <h2 className="font-semibold">Local routing explanation</h2>
                <p className="text-sm">Matches configured type and {content.departmentId ? "selected trusted department" : "any trusted department"}, with inclusive amount bounds. Highest matching numeric priority wins ({content.priority}). Equal highest priorities cause 409 AMBIGUOUS_APPROVAL_POLICY; review overlaps before publication.</p>
                <label className="grid max-w-xs gap-2 text-sm">Sample amount<Input inputMode="decimal" value={sample} onChange={(event) => setSample(event.target.value)} /></label>
                <p className="text-sm">{sample ? validSample && validBounds ? match ? `Amount matches this policy's bounds: ${content.stages.length} stage(s), ALL slots required.` : "Amount falls outside this policy's bounds." : "Enter a decimal amount." : "Enter a sample to inspect inclusive amount predicates."}</p>
                <p className="text-sm text-muted-foreground">Local explanation only. Submit checks current published policies, trusted department, active non-self reviewers in every stage and most-specific hard ceiling. This preview does not confirm eligibility or reserve funds.</p>
            </aside>
        </>}
        {confirmation && <CollectionDialog title={confirmation === "publish" ? "Publish immutable policy version?" : "Disable policy for future cycles?"} description="Current approval cycles keep their accepted policy and reviewer snapshots." onClose={() =>
        {
            if (!busy) setConfirmation(null);
        }}><div className="flex justify-end gap-3 p-6"><ActionButton type="button" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</ActionButton><ActionButton type="button" variant="primary" disabled={busy} onClick={() => void action(confirmation)}>Confirm {confirmation}</ActionButton></div></CollectionDialog>}
    </div>;
}
