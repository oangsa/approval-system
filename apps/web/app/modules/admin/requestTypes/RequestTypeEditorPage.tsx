import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { AlertCircle, ArrowLeft, CheckCircle2, LoaderCircle, Plus } from "lucide-react";
import {
    createRequestTypeSchema,
    patchRequestTypeDraftSchema,
    type AdminRequestTypeDetail,
    type IFieldIssue,
    type PublishedRequestType,
    type RequestField,
    type RequestTypeDraftContent,
} from "@workflow/contracts";
import { isApiFailure } from "~/api/errors";
import { ActionButton } from "~/components/actions/ActionButton";
import { PageHeader } from "~/components/layout/PageHeader";
import { Input } from "~/components/ui/input";
import { useSession } from "~/modules/auth/sessionContext";
import { presentFailure } from "~/modules/requests/requestPresentation";
import {
    branchAdminRequestTypeDraft,
    createAdminRequestType,
    patchAdminRequestTypeDraft,
    publishAdminRequestType,
    readAdminRequestType,
    readRequestTypeVersion,
    RequestTypeActionAttempt,
    setAdminRequestTypeEnabled,
} from "~/services/requestTypeService";
import { FieldEditorCard } from "./FieldEditorCard";
import { RequestTypePreview } from "./RequestTypePreview";

function emptyDraft(): RequestTypeDraftContent
{
    return {
        name: { en: "" },
        monetary: false,
        supportsLineItems: false,
        fields: [],
    };
}

function emptyField(index: number): RequestField
{
    return {
        key: `field_${index + 1}`,
        kind: "TEXT",
        label: { en: `Field ${index + 1}` },
        required: false,
    };
}

function formatIssuePath(path: readonly PropertyKey[]): string
{
    let result = "";
    for (const segment of path)
    {
        if (typeof segment === "number") result += `[${segment}]`;
        else result += result ? `.${String(segment)}` : String(segment);
    }
    return result || "body";
}

export function RequestTypeEditorPage()
{
    const { id } = useParams();
    const isNew = !id;
    const navigate = useNavigate();
    const routeState = useLocation().state as { statusMessage?: string } | null;
    const { user, generation } = useSession();
    const isAdmin = !!user?.roles.includes("ADMINISTRATOR");

    const [detail, setDetail] = useState<AdminRequestTypeDetail | null>(null);
    const [code, setCode] = useState("");
    const [draft, setDraft] = useState<RequestTypeDraftContent>(emptyDraft);
    const [dirty, setDirty] = useState(false);
    const [loading, setLoading] = useState(!isNew);
    const [loadAttempt, setLoadAttempt] = useState(0);
    const [loadError, setLoadError] = useState("");
    const [terminalLoadError, setTerminalLoadError] = useState(false);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [staleConflict, setStaleConflict] = useState(false);
    const [issues, setIssues] = useState<IFieldIssue[]>([]);
    const [statusMessage, setStatusMessage] = useState(routeState?.statusMessage ?? "");
    const [confirmPublish, setConfirmPublish] = useState(false);
    const [confirmToggle, setConfirmToggle] = useState(false);
    const [inspectedVersion, setInspectedVersion] = useState<PublishedRequestType | null>(null);

    const publishDialog = useRef<HTMLDialogElement>(null);
    const toggleDialog = useRef<HTMLDialogElement>(null);
    const attempts = useRef(new RequestTypeActionAttempt());

    useEffect(() =>
    {
        if (!isAdmin || !id) return;
        const controller = new AbortController();
        setLoading(true);
        setLoadError("");
        readAdminRequestType(id, controller.signal, generation).then((loaded) =>
        {
            if (controller.signal.aborted) return;
            setDetail(loaded);
            setCode(loaded.code);
            if (loaded.draft) setDraft(loaded.draft);
            else if (loaded.publishedVersion)
            {
                setDraft({
                    name: loaded.publishedVersion.name,
                    ...(loaded.publishedVersion.description ? { description: loaded.publishedVersion.description } : {}),
                    monetary: loaded.publishedVersion.monetary,
                    supportsLineItems: loaded.publishedVersion.supportsLineItems,
                    fields: loaded.publishedVersion.fields,
                });
            }
            setDirty(false);
            setStaleConflict(false);
            setError("");
            setIssues([]);
        }).catch((failure: unknown) =>
        {
            if (controller.signal.aborted) return;
            const view = presentFailure(failure, "Could not load request type.");
            setLoadError(view.requestId ? `${view.message} Request ID: ${view.requestId}` : view.message);
            setTerminalLoadError(view.terminal);
        }).finally(() =>
        {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [isAdmin, id, generation, loadAttempt]);

    useEffect(() =>
    {
        if (!confirmPublish) return;
        const panel = publishDialog.current;
        const target = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
        panel?.showModal();
        return () =>
        {
            panel?.close();
            if (target && target.isConnected && !target.hasAttribute("disabled")) target.focus();
        };
    }, [confirmPublish]);

    useEffect(() =>
    {
        if (!confirmToggle) return;
        const panel = toggleDialog.current;
        const target = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
        panel?.showModal();
        return () =>
        {
            panel?.close();
            if (target && target.isConnected && !target.hasAttribute("disabled")) target.focus();
        };
    }, [confirmToggle]);

    if (!isAdmin)
    {
        return <div className="mx-auto max-w-5xl space-y-6">
            <div role="alert" className="space-y-3 rounded-lg border bg-card p-6">
                <p>Administrator access is required to configure request types.</p>
                <Link className="inline-block rounded-md bg-primary px-4 py-2 text-primary-foreground" to="/dashboard">Go to Dashboard</Link>
            </div>
        </div>;
    }

    if (loading)
    {
        return <div role="status" className="flex min-h-40 items-center justify-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden="true" className="size-5 text-primary motion-safe:animate-spin" />Loading request type…
        </div>;
    }

    if (loadError)
    {
        return <div className="mx-auto max-w-5xl space-y-4">
            <div role="alert" className="space-y-3 rounded-lg border bg-card p-6">
                <p>{loadError}</p>
                {!terminalLoadError && <ActionButton type="button" onClick={() => setLoadAttempt((value) => value + 1)}>Retry</ActionButton>}
                <Link className="block underline" to="/admin/request-types">Back to Request Types</Link>
            </div>
        </div>;
    }

    const hasDraft = isNew || detail?.draft !== null;
    const isEditable = hasDraft && !busy;

    function updateDraft(changes: Partial<RequestTypeDraftContent>): void
    {
        setDraft((current) => ({ ...current, ...changes }));
        setDirty(true);
        setStatusMessage("");
        setIssues([]);
        setError("");
    }

    function applyActionFailure(failure: unknown, fallback: string): void
    {
        if (isApiFailure(failure))
        {
            const view = presentFailure(failure, fallback);
            setError(view.requestId ? `${view.message} Request ID: ${view.requestId}` : view.message);
            if (failure.details?.length) setIssues(failure.details);
            if (failure.status === 409) setStaleConflict(true);
        }
        else
        {
            setError(fallback);
        }
    }

    async function handleSaveDraft(): Promise<void>
    {
        if (!hasDraft || busy) return;
        setBusy(true);
        setError("");
        setIssues([]);
        setStatusMessage("");
        setStaleConflict(false);
        try
        {
            if (isNew)
            {
                const parsed = createRequestTypeSchema.safeParse({ code, ...draft });
                if (!parsed.success)
                {
                    setIssues(parsed.error.issues.map((issue) => ({ field: formatIssuePath(issue.path), code: "VALIDATION_ERROR", message: issue.message })));
                    setError("Fix the highlighted validation errors before saving.");
                    return;
                }
                const created = await createAdminRequestType(parsed.data, attempts.current, generation);
                attempts.current.Clear();
                setDirty(false);
                setStatusMessage("Draft created.");
                void navigate(`/admin/request-types/${created.id}`, { replace: true, state: { statusMessage: "Draft created." } });
                return;
            }

            const parsed = patchRequestTypeDraftSchema.safeParse({
                expectedVersion: detail!.version,
                name: draft.name,
                description: draft.description ?? null,
                monetary: draft.monetary,
                supportsLineItems: draft.supportsLineItems,
                fields: draft.fields,
            });
            if (!parsed.success)
            {
                setIssues(parsed.error.issues.map((issue) => ({ field: formatIssuePath(issue.path), code: "VALIDATION_ERROR", message: issue.message })));
                setError("Fix the highlighted validation errors before saving.");
                return;
            }
            const saved = await patchAdminRequestTypeDraft(detail!.id, parsed.data, attempts.current, generation);
            attempts.current.Clear();
            setDetail((current) => current ? {
                ...current,
                version: saved.version,
                updatedAt: saved.updatedAt,
                draft: {
                    name: saved.name,
                    ...(saved.description ? { description: saved.description } : {}),
                    monetary: saved.monetary,
                    supportsLineItems: saved.supportsLineItems,
                    fields: saved.fields,
                },
            } : current);
            setDirty(false);
            setStatusMessage("Draft saved.");
        }
        catch (failure: unknown)
        {
            applyActionFailure(failure, "Could not save draft. Your edits are preserved.");
        }
        finally
        {
            setBusy(false);
        }
    }

    async function handleBranchDraft(): Promise<void>
    {
        if (!detail || hasDraft || busy) return;
        setBusy(true);
        setError("");
        setIssues([]);
        setStatusMessage("");
        setStaleConflict(false);
        try
        {
            const branched = await branchAdminRequestTypeDraft(detail.id, { expectedVersion: detail.version }, attempts.current, generation);
            attempts.current.Clear();
            const branchedDraft: RequestTypeDraftContent = {
                name: branched.name,
                ...(branched.description ? { description: branched.description } : {}),
                monetary: branched.monetary,
                supportsLineItems: branched.supportsLineItems,
                fields: branched.fields,
            };
            setDraft(branchedDraft);
            setDetail((current) => current ? { ...current, version: branched.version, updatedAt: branched.updatedAt, draft: branchedDraft } : current);
            setDirty(false);
            setStatusMessage("New draft branched from published version.");
        }
        catch (failure: unknown)
        {
            applyActionFailure(failure, "Could not branch a new draft.");
        }
        finally
        {
            setBusy(false);
        }
    }

    async function handlePublish(): Promise<void>
    {
        if (!detail || !hasDraft || busy) return;
        setBusy(true);
        setError("");
        setIssues([]);
        setStatusMessage("");
        setStaleConflict(false);
        try
        {
            const published = await publishAdminRequestType(detail.id, { expectedVersion: detail.version }, attempts.current, generation);
            attempts.current.Clear();
            setConfirmPublish(false);
            setStatusMessage(`Published immutable version ${published.versionNumber}.`);
            setLoadAttempt((value) => value + 1);
        }
        catch (failure: unknown)
        {
            setConfirmPublish(false);
            applyActionFailure(failure, "Could not publish request type. Your draft is preserved.");
        }
        finally
        {
            setBusy(false);
        }
    }

    async function handleToggleEnabled(): Promise<void>
    {
        if (!detail || busy) return;
        setBusy(true);
        setError("");
        setStatusMessage("");
        setStaleConflict(false);
        try
        {
            const updated = await setAdminRequestTypeEnabled(detail.id, !detail.isEnabled, { expectedVersion: detail.version }, attempts.current, generation);
            attempts.current.Clear();
            setConfirmToggle(false);
            setStatusMessage(updated.isEnabled ? "Request type enabled." : "Request type disabled.");
            setDetail((current) => current ? {
                ...current,
                isEnabled: updated.isEnabled,
                version: updated.version,
                updatedAt: updated.updatedAt,
                publishedVersion: current.publishedVersion ? { ...current.publishedVersion, isEnabled: updated.isEnabled } : null,
            } : current);
        }
        catch (failure: unknown)
        {
            setConfirmToggle(false);
            applyActionFailure(failure, "Could not update enabled status.");
        }
        finally
        {
            setBusy(false);
        }
    }

    function moveField(index: number, delta: -1 | 1): void
    {
        const target = index + delta;
        if (target < 0 || target >= draft.fields.length) return;
        const next = [...draft.fields];
        const [moved] = next.splice(index, 1);
        next.splice(target, 0, moved!);
        updateDraft({ fields: next });
    }

    async function inspectVersion(versionId: string): Promise<void>
    {
        if (!detail) return;
        try
        {
            setInspectedVersion(await readRequestTypeVersion(detail.id, versionId, undefined, generation));
        }
        catch (failure: unknown)
        {
            applyActionFailure(failure, "Could not load published version.");
        }
    }

    const issueFor = (field: string) => issues.find((issue) => issue.field === field)?.message;
    const nextVersionNumber = (detail?.publishedVersion?.versionNumber ?? 0) + 1;

    return <div className="mx-auto max-w-7xl space-y-6">
        <Link to="/admin/request-types" className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-primary hover:underline">
            <ArrowLeft aria-hidden="true" className="size-4" />Request Types
        </Link>

        <PageHeader
            title={isNew ? "New request type" : `${detail?.code ?? code} configuration`}
            description={detail ? `Optimistic version ${detail.version} · ${detail.isEnabled ? "Enabled" : "Disabled"}${detail.publishedVersion ? ` · Published v${detail.publishedVersion.versionNumber}` : " · Unpublished"}${detail.draft ? " · Active draft" : ""}` : "Create an editable request type draft, preview conditions, then publish an immutable version."}
            actions={<div className="flex flex-wrap items-center gap-2">
                {!isNew && detail && <ActionButton type="button" disabled={busy} onClick={() => setConfirmToggle(true)}>{detail.isEnabled ? "Disable" : "Enable"}</ActionButton>}
                {!isNew && !hasDraft && <ActionButton type="button" variant="primary" disabled={busy} onClick={() => void handleBranchDraft()}>Create new draft</ActionButton>}
                {hasDraft && <ActionButton type="button" variant="primary" disabled={busy} onClick={() => void handleSaveDraft()}>{busy ? "Saving…" : "Save draft"}</ActionButton>}
                {!isNew && hasDraft && <ActionButton type="button" disabled={busy || dirty} onClick={() => setConfirmPublish(true)}>Publish version</ActionButton>}
            </div>}
        />

        {hasDraft && !isNew && dirty && <p className="text-xs text-muted-foreground">Save draft changes before publishing.</p>}

        {error && <div role="alert" className="space-y-2 rounded-lg border border-destructive bg-destructive/5 p-4 text-sm">
            <p className="font-medium text-destructive"><AlertCircle aria-hidden="true" className="mr-2 inline size-4" />{error}</p>
            {issues.length > 0 && <ul className="list-disc space-y-1 pl-5 text-xs text-destructive">
                {issues.map((issue, index) => <li key={`${issue.field}-${index}`}>{issue.field}: {issue.message}</li>)}
            </ul>}
            {staleConflict && !isNew && <ActionButton type="button" size="small" onClick={() => setLoadAttempt((value) => value + 1)}>Reload latest</ActionButton>}
        </div>}

        {statusMessage && <p role="status" className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm font-medium">
            <CheckCircle2 aria-hidden="true" className="size-4 text-primary" />{statusMessage}
        </p>}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
            <div className="space-y-6">
                <section aria-label="Type metadata" className="space-y-4 rounded-xl border bg-card p-5">
                    <h2 className="text-lg font-semibold">Metadata and monetary behavior</h2>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-1.5">
                            <label htmlFor="type-code" className="text-sm font-medium">Type code (required)</label>
                            <Input id="type-code" disabled={!isNew || busy} value={code} aria-invalid={!!issueFor("code")} onChange={(event) =>
                            {
                                setCode(event.target.value);
                                setDirty(true);
                            }} />
                            {issueFor("code") && <p className="text-xs text-destructive">{issueFor("code")}</p>}
                        </div>
                        <div className="grid gap-1.5">
                            <label htmlFor="type-name-en" className="text-sm font-medium">English name (required)</label>
                            <Input id="type-name-en" disabled={!isEditable} value={draft.name.en} aria-invalid={!!issueFor("name.en")} onChange={(event) => updateDraft({ name: { ...draft.name, en: event.target.value } })} />
                            {issueFor("name.en") && <p className="text-xs text-destructive">{issueFor("name.en")}</p>}
                        </div>
                        <div className="grid gap-1.5">
                            <label htmlFor="type-name-th" className="text-sm font-medium">Thai name (optional)</label>
                            <Input id="type-name-th" disabled={!isEditable} value={draft.name.th ?? ""} onChange={(event) =>
                            {
                                const th = event.target.value;
                                updateDraft({ name: th ? { en: draft.name.en, th } : { en: draft.name.en } });
                            }} />
                        </div>
                        <div className="grid gap-1.5">
                            <label htmlFor="type-desc-en" className="text-sm font-medium">English description (optional)</label>
                            <Input id="type-desc-en" disabled={!isEditable} value={draft.description?.en ?? ""} onChange={(event) =>
                            {
                                const en = event.target.value;
                                const th = draft.description?.th;
                                updateDraft({ description: en ? { en, ...(th ? { th } : {}) } : undefined });
                            }} />
                        </div>
                        <div className="grid gap-1.5">
                            <label htmlFor="type-desc-th" className="text-sm font-medium">Thai description (optional)</label>
                            <Input
                                id="type-desc-th"
                                disabled={!isEditable || !draft.description?.en.trim()}
                                placeholder={!draft.description?.en.trim() ? "Add English description first" : undefined}
                                value={draft.description?.th ?? ""}
                                onChange={(event) =>
                                {
                                    const th = event.target.value;
                                    if (!draft.description?.en.trim()) return;
                                    updateDraft({ description: th ? { en: draft.description.en, th } : { en: draft.description.en } });
                                }}
                            />
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-6 border-t pt-4">
                        <label className="inline-flex items-center gap-2 text-sm font-medium">
                            <input
                                type="checkbox"
                                className="size-4 rounded border"
                                disabled={!isEditable}
                                checked={draft.monetary}
                                onChange={(event) =>
                                {
                                    const monetary = event.target.checked;
                                    updateDraft({ monetary, supportsLineItems: monetary ? draft.supportsLineItems : false });
                                }}
                            />
                            Monetary request
                        </label>
                        <label className="inline-flex items-center gap-2 text-sm font-medium">
                            <input
                                type="checkbox"
                                className="size-4 rounded border"
                                disabled={!isEditable || !draft.monetary}
                                checked={draft.supportsLineItems}
                                onChange={(event) => updateDraft({ supportsLineItems: event.target.checked })}
                            />
                            Enable line items
                        </label>
                    </div>
                </section>

                <section aria-label="Configured fields" className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h2 className="text-lg font-semibold">Fields ({draft.fields.length})</h2>
                            <p className="text-xs text-muted-foreground">Order fields with Up/Down controls and define bounded visibility or requiredness rules.</p>
                        </div>
                        <ActionButton
                            type="button"
                            disabled={!isEditable || draft.fields.length >= 50}
                            onClick={() => updateDraft({ fields: [...draft.fields, emptyField(draft.fields.length)] })}
                        >
                            <Plus aria-hidden="true" className="size-4" />Add field
                        </ActionButton>
                    </div>
                    {draft.fields.length === 0 ? <p className="rounded-xl border border-dashed bg-card p-6 text-sm text-muted-foreground">No fields configured yet.</p> : <div className="space-y-4">
                        {draft.fields.map((field, index) => (
                            <FieldEditorCard
                                key={index}
                                field={field}
                                index={index}
                                totalFields={draft.fields.length}
                                otherFields={draft.fields.filter((_, otherIndex) => otherIndex !== index)}
                                disabled={!isEditable}
                                issues={issues}
                                onChange={(nextField) => updateDraft({ fields: draft.fields.map((row, rowIndex) => rowIndex === index ? nextField : row) })}
                                onMoveUp={() => moveField(index, -1)}
                                onMoveDown={() => moveField(index, 1)}
                                onRemove={() => updateDraft({ fields: draft.fields.filter((_, rowIndex) => rowIndex !== index) })}
                            />
                        ))}
                    </div>}
                </section>

                {!isNew && detail && detail.versions.length > 0 && <section aria-label="Published versions" className="space-y-3 rounded-xl border bg-card p-5">
                    <h2 className="text-lg font-semibold">Immutable published versions</h2>
                    <ul className="divide-y">
                        {detail.versions.map((version) => <li key={version.versionId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                            <span>Version {version.versionNumber}{detail.publishedVersion?.versionId === version.versionId ? " (active)" : ""} · <time dateTime={version.publishedAt}>{new Date(version.publishedAt).toLocaleString(undefined, { timeZone: "Asia/Bangkok" })}</time></span>
                            <ActionButton type="button" size="small" onClick={() => void inspectVersion(version.versionId)}>Inspect v{version.versionNumber}</ActionButton>
                        </li>)}
                    </ul>
                    {inspectedVersion && <div className="rounded-lg border bg-muted/30 p-3 text-xs">
                        <p className="font-medium">Version {inspectedVersion.versionNumber} snapshot ({inspectedVersion.fields.length} fields)</p>
                        <p className="text-muted-foreground">Name: {inspectedVersion.name.en} · Monetary: {inspectedVersion.monetary ? "Yes" : "No"} · Line items: {inspectedVersion.supportsLineItems ? "Yes" : "No"}</p>
                    </div>}
                </section>}
            </div>

            <RequestTypePreview code={code} definition={draft} />
        </div>

        {confirmPublish && <dialog ref={publishDialog} aria-labelledby="publish-type-title" onCancel={(event) =>
        {
            event.preventDefault();
            if (!busy) setConfirmPublish(false);
        }} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md space-y-4 rounded-xl border bg-background p-6 text-foreground backdrop:bg-black/50">
            <h2 id="publish-type-title" className="text-lg font-semibold">Publish immutable version {nextVersionNumber}?</h2>
            <p className="text-sm text-muted-foreground">Published versions cannot be modified later. New requests will use version {nextVersionNumber}; submitted and returned requests keep their pinned version.</p>
            <div className="flex justify-end gap-2">
                <ActionButton type="button" variant="outline" disabled={busy} onClick={() => setConfirmPublish(false)}>Cancel</ActionButton>
                <ActionButton type="button" variant="primary" disabled={busy} onClick={() => void handlePublish()}>{busy ? "Publishing…" : "Confirm publish"}</ActionButton>
            </div>
        </dialog>}

        {confirmToggle && detail && <dialog ref={toggleDialog} aria-labelledby="toggle-detail-title" onCancel={(event) =>
        {
            event.preventDefault();
            if (!busy) setConfirmToggle(false);
        }} className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md space-y-4 rounded-xl border bg-background p-6 text-foreground backdrop:bg-black/50">
            <h2 id="toggle-detail-title" className="text-lg font-semibold">{detail.isEnabled ? "Disable request type?" : "Enable request type?"}</h2>
            <p className="text-sm text-muted-foreground">{detail.isEnabled ? "Requesters will not be able to create or submit new requests of this type. Existing returned requests remain editable on their pinned version." : "Requesters will be able to select this type when enabled and published."}</p>
            <div className="flex justify-end gap-2">
                <ActionButton type="button" variant="outline" disabled={busy} onClick={() => setConfirmToggle(false)}>Cancel</ActionButton>
                <ActionButton type="button" variant="primary" disabled={busy} onClick={() => void handleToggleEnabled()}>{busy ? "Updating…" : detail.isEnabled ? "Confirm disable" : "Confirm enable"}</ActionButton>
            </div>
        </dialog>}
    </div>;
}
