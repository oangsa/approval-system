import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, CheckCircle2, Download, FileText, LoaderCircle, RefreshCw, Trash2, Upload, X } from "lucide-react";
import { ALLOWED_ATTACHMENT_MEDIA_TYPES, MAX_ATTACHMENTS_PER_REVISION, type AttachmentDTO } from "@workflow/contracts";
import { isApiFailure } from "~/api/errors";
import { ActionButton } from "~/components/actions/ActionButton";
import { useSession } from "~/modules/auth/sessionContext";
import { downloadRequestAttachment, readAttachments, removeWorkingAttachment, uploadWorkingAttachment } from "~/services/requestService";
import { formatFileSize, presentCollaborationFailure } from "./requestPresentation";

type UploadItemStatus = "Uploading" | "Finalizing" | "Error" | "Unknown";

interface IUploadQueueItem
{
    localId: string;
    file: File;
    fileName: string;
    sizeBytes: number;
    progress: number;
    status: UploadItemStatus;
    reconciling: boolean;
    errorMessage?: string;
    requestId: string;
    workingRevisionId: string;
    knownIds: Set<string>;
    controller: AbortController;
}

export interface IWorkingAttachmentsUploaderProps
{
    requestId: string;
    workingRevisionId: string | null;
    attachments: AttachmentDTO[];
    loading?: boolean;
    loadError?: string;
    canEdit: boolean;
    disabled?: boolean;
    heading?: string;
    onEnsureDraft?: () => Promise<{ requestId: string; workingRevisionId: string } | null>;
    onUploaded: (attachment: AttachmentDTO) => void;
    onDeleted: (attachmentId: string) => void;
    onReconciled?: (attachments: AttachmentDTO[]) => void;
    onReload?: () => void;
}

export function WorkingAttachmentsUploader({
    requestId,
    workingRevisionId,
    attachments,
    loading = false,
    loadError = "",
    canEdit,
    disabled = false,
    heading = "Supporting attachments",
    onEnsureDraft,
    onUploaded,
    onDeleted,
    onReconciled,
    onReload,
}: IWorkingAttachmentsUploaderProps)
{
    const { user, generation } = useSession();
    const inputId = useId();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const sessionKey = `${generation}:${user?.id ?? ""}`;
    const sessionKeyRef = useRef(sessionKey);
    sessionKeyRef.current = sessionKey;
    const previousResetContextRef = useRef({ sessionKey, requestId });
    const attachmentsRef = useRef(attachments);
    attachmentsRef.current = attachments;
    const controllersRef = useRef<Set<AbortController>>(new Set());

    const [queue, setQueue] = useState<IUploadQueueItem[]>([]);
    const [ensuringDraft, setEnsuringDraft] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [actionError, setActionError] = useState("");

    const abortAllActive = useCallback(() =>
    {
        for (const controller of controllersRef.current)
        {
            controller.abort();
        }
        controllersRef.current.clear();
    }, []);

    useEffect(() =>
    {
        const prev = previousResetContextRef.current;
        const sessionChanged = prev.sessionKey !== sessionKey;
        const switchedSavedRequest = prev.requestId !== "" && prev.requestId !== requestId;
        previousResetContextRef.current = { sessionKey, requestId };
        if (sessionChanged || switchedSavedRequest)
        {
            abortAllActive();
            setQueue([]);
            setEnsuringDraft(false);
            setDeletingId(null);
            setDownloadingId(null);
            setActionError("");
        }
    }, [sessionKey, requestId, abortAllActive]);

    useEffect(() => () =>
    {
        abortAllActive();
    }, [abortAllActive]);

    const reconcileUnknownUpload = useCallback(async (
        localId: string,
        targetRequestId: string,
        targetRevisionId: string,
        fileName: string,
        sizeBytes: number,
        knownIds: Set<string>,
        activeSessionKey: string,
    ): Promise<void> =>
    {
        const controller = new AbortController();
        controllersRef.current.add(controller);
        setQueue((current) => current.map((item) => item.localId === localId ? { ...item, status: "Unknown", reconciling: true, errorMessage: "UNKNOWN — verifying with server" } : item));
        try
        {
            const result = await readAttachments(targetRequestId, { revisionId: targetRevisionId, pageNumber: 1, pageSize: 100 }, controller.signal, generation);
            if (sessionKeyRef.current !== activeSessionKey || controller.signal.aborted)
            {
                return;
            }
            const matched = result.items.find((item) => !knownIds.has(item.id) && item.fileName === fileName && item.sizeBytes === sizeBytes)
                ?? result.items.find((item) => !knownIds.has(item.id) && item.fileName === fileName);
            if (matched)
            {
                if (onReconciled)
                {
                    onReconciled(result.items);
                }
                else
                {
                    onUploaded(matched);
                }
                setQueue((current) => current.filter((item) => item.localId !== localId));
            }
            else
            {
                setQueue((current) => current.map((item) => item.localId === localId ? {
                    ...item,
                    status: "Error",
                    reconciling: false,
                    errorMessage: "Upload was interrupted before server confirmation. You can retry safely.",
                } : item));
            }
        }
        catch (failure)
        {
            if (sessionKeyRef.current !== activeSessionKey || controller.signal.aborted)
            {
                return;
            }
            const view = presentCollaborationFailure(failure, "Could not verify upload status with server.");
            setQueue((current) => current.map((item) => item.localId === localId ? {
                ...item,
                status: "Unknown",
                reconciling: false,
                errorMessage: `UNKNOWN — ${view.message}`,
            } : item));
        }
        finally
        {
            controllersRef.current.delete(controller);
        }
    }, [generation, onReconciled, onUploaded]);

    const startFileUpload = useCallback(async (
        file: File,
        targetRequestId: string,
        targetRevisionId: string,
        activeSessionKey: string,
        existingLocalId?: string,
    ): Promise<void> =>
    {
        const localId = existingLocalId ?? crypto.randomUUID();
        const controller = new AbortController();
        controllersRef.current.add(controller);
        const knownIds = new Set(attachmentsRef.current.map((item) => item.id));

        const nextItem: IUploadQueueItem = {
            localId,
            file,
            fileName: file.name,
            sizeBytes: file.size,
            progress: 0,
            status: "Uploading",
            reconciling: false,
            requestId: targetRequestId,
            workingRevisionId: targetRevisionId,
            knownIds,
            controller,
        };

        setQueue((current) => existingLocalId
            ? current.map((item) => item.localId === existingLocalId ? nextItem : item)
            : [...current, nextItem]);

        try
        {
            const created = await uploadWorkingAttachment({
                requestId: targetRequestId,
                file,
                workingRevisionId: targetRevisionId,
                signal: controller.signal,
                generation,
                onProgress: (percent) =>
                {
                    if (sessionKeyRef.current !== activeSessionKey || controller.signal.aborted)
                    {
                        return;
                    }
                    setQueue((current) => current.map((item) => item.localId === localId && item.status === "Uploading" ? { ...item, progress: percent } : item));
                },
                onPhaseChange: (phase) =>
                {
                    if (sessionKeyRef.current !== activeSessionKey || controller.signal.aborted)
                    {
                        return;
                    }
                    setQueue((current) => current.map((item) => item.localId === localId ? { ...item, status: phase, progress: phase === "Finalizing" ? 100 : item.progress } : item));
                },
            });

            if (sessionKeyRef.current !== activeSessionKey || controller.signal.aborted)
            {
                return;
            }
            setQueue((current) => current.filter((item) => item.localId !== localId));
            onUploaded(created);
        }
        catch (failure)
        {
            if (sessionKeyRef.current !== activeSessionKey || controller.signal.aborted)
            {
                return;
            }
            if (isApiFailure(failure) && failure.ambiguousCommit)
            {
                await reconcileUnknownUpload(localId, targetRequestId, targetRevisionId, file.name, file.size, knownIds, activeSessionKey);
                return;
            }
            const view = presentCollaborationFailure(failure, "Upload failed. Check the file and try again.");
            const errorMessage = view.requestId ? `${view.message} Request ID: ${view.requestId}` : view.message;
            setQueue((current) => current.map((item) => item.localId === localId ? {
                ...item,
                status: "Error",
                reconciling: false,
                errorMessage,
            } : item));
        }
        finally
        {
            controllersRef.current.delete(controller);
        }
    }, [generation, onUploaded, reconcileUnknownUpload]);

    async function handleFilesSelected(event: ChangeEvent<HTMLInputElement>): Promise<void>
    {
        const files = Array.from(event.target.files ?? []);
        event.target.value = "";
        if (!files.length || !canEdit || disabled)
        {
            return;
        }
        setActionError("");

        let targetRequestId = requestId;
        let targetRevisionId = workingRevisionId;
        const activeSessionKey = sessionKeyRef.current;

        if (!targetRequestId || !targetRevisionId)
        {
            if (!onEnsureDraft)
            {
                setActionError("Save the draft before uploading attachments.");
                return;
            }
            setEnsuringDraft(true);
            let ensured: { requestId: string; workingRevisionId: string } | null = null;
            try
            {
                ensured = await onEnsureDraft();
            }
            catch (failure)
            {
                if (sessionKeyRef.current === activeSessionKey)
                {
                    const view = presentCollaborationFailure(failure, "Could not save draft before uploading.");
                    setActionError(view.requestId ? `${view.message} Request ID: ${view.requestId}` : view.message);
                }
                return;
            }
            finally
            {
                if (sessionKeyRef.current === activeSessionKey)
                {
                    setEnsuringDraft(false);
                }
            }
            if (!ensured || sessionKeyRef.current !== activeSessionKey)
            {
                return;
            }
            targetRequestId = ensured.requestId;
            targetRevisionId = ensured.workingRevisionId;
        }

        for (const file of files)
        {
            void startFileUpload(file, targetRequestId, targetRevisionId, activeSessionKey);
        }
    }

    async function handleDelete(attachment: AttachmentDTO): Promise<void>
    {
        if (!canEdit || disabled || deletingId)
        {
            return;
        }
        const activeSessionKey = sessionKeyRef.current;
        const controller = new AbortController();
        controllersRef.current.add(controller);
        setDeletingId(attachment.id);
        setActionError("");
        try
        {
            await removeWorkingAttachment(requestId, attachment.id, controller.signal, generation);
            if (sessionKeyRef.current !== activeSessionKey || controller.signal.aborted)
            {
                return;
            }
            onDeleted(attachment.id);
        }
        catch (failure)
        {
            if (sessionKeyRef.current !== activeSessionKey || controller.signal.aborted)
            {
                return;
            }
            const view = presentCollaborationFailure(failure, "Could not delete attachment.");
            setActionError(view.requestId ? `${view.message} Request ID: ${view.requestId}` : view.message);
        }
        finally
        {
            controllersRef.current.delete(controller);
            if (sessionKeyRef.current === activeSessionKey)
            {
                setDeletingId(null);
            }
        }
    }

    async function handleDownload(attachment: AttachmentDTO): Promise<void>
    {
        if (downloadingId)
        {
            return;
        }
        const activeSessionKey = sessionKeyRef.current;
        const controller = new AbortController();
        controllersRef.current.add(controller);
        setDownloadingId(attachment.id);
        setActionError("");
        try
        {
            await downloadRequestAttachment(attachment.id, attachment.fileName, controller.signal, generation);
        }
        catch (failure)
        {
            if (sessionKeyRef.current !== activeSessionKey || controller.signal.aborted)
            {
                return;
            }
            const view = presentCollaborationFailure(failure, "Could not download attachment.");
            setActionError(view.requestId ? `${view.message} Request ID: ${view.requestId}` : view.message);
        }
        finally
        {
            controllersRef.current.delete(controller);
            if (sessionKeyRef.current === activeSessionKey)
            {
                setDownloadingId(null);
            }
        }
    }

    return <section aria-label={heading} className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="space-y-1">
                <h3 className="text-base font-semibold">{heading}</h3>
                <p className="text-sm text-muted-foreground">Allowed types: PDF, PNG, JPEG, WebP, or plain text (max 10 MB each, up to {MAX_ATTACHMENTS_PER_REVISION} files).</p>
            </div>
            <span className="text-xs font-medium tabular-nums text-muted-foreground">{attachments.length} / {MAX_ATTACHMENTS_PER_REVISION} files</span>
        </div>

        {canEdit && <div className="rounded-lg border border-dashed bg-muted/30 p-4">
            <label htmlFor={inputId} className="block text-sm font-medium">Attach supporting file</label>
            <div className="mt-2 flex flex-wrap items-center gap-3">
                <input
                    ref={fileInputRef}
                    id={inputId}
                    type="file"
                    multiple
                    accept={ALLOWED_ATTACHMENT_MEDIA_TYPES.join(",")}
                    disabled={disabled || ensuringDraft}
                    onChange={(event) => void handleFilesSelected(event)}
                    className="block w-full max-w-md cursor-pointer text-sm file:mr-3 file:rounded-md file:border file:bg-background file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                />
                {ensuringDraft && <span role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircle aria-hidden="true" className="size-4 text-primary motion-safe:animate-spin" />
                    Saving draft before upload…
                </span>}
            </div>
        </div>}

        {actionError && <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/60 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span>{actionError}</span>
        </div>}

        {loadError && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/60 bg-destructive/5 p-3 text-sm text-destructive">
            <span>{loadError}</span>
            {onReload && <ActionButton type="button" size="small" onClick={onReload}>Retry files</ActionButton>}
        </div>}

        {queue.length > 0 && <ul aria-label="Pending file uploads" className="space-y-2">
            {queue.map((item) => <li key={item.localId} className="space-y-2 rounded-lg border bg-card p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        <Upload aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{item.fileName}</span>
                        <span className="tabular-nums text-xs text-muted-foreground">{formatFileSize(item.sizeBytes)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {item.status === "Uploading" && <span className="text-xs font-medium tabular-nums text-primary">Uploading ({item.progress}%)</span>}
                        {item.status === "Finalizing" && <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                            <LoaderCircle aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />
                            Finalizing
                        </span>}
                        {item.status === "Unknown" && <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                            UNKNOWN
                        </span>}
                        {item.status === "Error" && <ActionButton type="button" size="small" onClick={() => void startFileUpload(item.file, item.requestId, item.workingRevisionId, sessionKeyRef.current, item.localId)}>
                            <RefreshCw aria-hidden="true" className="size-3.5" />Retry
                        </ActionButton>}
                        {item.status === "Unknown" && !item.reconciling && <ActionButton type="button" size="small" onClick={() => void reconcileUnknownUpload(item.localId, item.requestId, item.workingRevisionId, item.fileName, item.sizeBytes, item.knownIds, sessionKeyRef.current)}>
                            <RefreshCw aria-hidden="true" className="size-3.5" />Verify status
                        </ActionButton>}
                        {(item.status === "Error" || (item.status === "Unknown" && !item.reconciling)) && <ActionButton type="button" size="small" variant="ghost" aria-label={`Dismiss ${item.fileName}`} onClick={() => setQueue((current) => current.filter((candidate) => candidate.localId !== item.localId))}>
                            <X aria-hidden="true" className="size-3.5" />
                        </ActionButton>}
                    </div>
                </div>
                {item.status === "Uploading" && <div role="progressbar" aria-label={`Upload progress for ${item.fileName}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.progress} className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary transition-all motion-reduce:transition-none" style={{ width: `${item.progress}%` }} />
                </div>}
                {item.errorMessage && (item.status === "Error" || item.status === "Unknown") && <p role={item.status === "Error" ? "alert" : "status"} className="text-xs text-destructive">{item.errorMessage}</p>}
            </li>)}
        </ul>}

        {loading ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden="true" className="size-4 text-primary motion-safe:animate-spin" />
            Loading attachments…
        </p> : attachments.length === 0 ? <p className="text-sm text-muted-foreground">No working files attached yet.</p> : <ul aria-label="Working attachments" className="divide-y rounded-lg border">
            {attachments.map((attachment) => <li key={attachment.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                <div className="flex min-w-0 items-center gap-2.5">
                    <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                        <p className="truncate font-medium">{attachment.fileName}</p>
                        <p className="text-xs tabular-nums text-muted-foreground">{formatFileSize(attachment.sizeBytes)} · {attachment.mediaType}</p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <CheckCircle2 aria-hidden="true" className="size-3.5" />Uploaded
                    </span>
                    <ActionButton type="button" size="small" disabled={downloadingId === attachment.id} onClick={() => void handleDownload(attachment)}>
                        <Download aria-hidden="true" className="size-3.5" />{downloadingId === attachment.id ? "Downloading…" : "Download"}
                    </ActionButton>
                    {canEdit && <ActionButton type="button" size="small" variant="danger" aria-label={`Delete ${attachment.fileName}`} disabled={disabled || deletingId === attachment.id} onClick={() => void handleDelete(attachment)}>
                        <Trash2 aria-hidden="true" className="size-3.5" />{deletingId === attachment.id ? "Deleting…" : "Delete"}
                    </ActionButton>}
                </div>
            </li>)}
        </ul>}
    </section>;
}
