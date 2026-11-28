import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertCircle, Download, FileText, LoaderCircle, MessageSquare, Send } from "lucide-react";
import {
    MAX_COMMENT_BODY_LENGTH,
    createCommentSchema,
    type AttachmentDTO,
    type CommentDTO,
    type IRequestTypeSearchResult,
    type RequestDetail,
} from "@workflow/contracts";
import { ActionButton } from "~/components/actions/ActionButton";
import { useSession } from "~/modules/auth/sessionContext";
import { formatInstant } from "~/modules/reviews/formatDue";
import { addComment, downloadRequestAttachment, readAttachments, readComments } from "~/services/requestService";
import { WorkingAttachmentsUploader } from "./WorkingAttachmentsUploader";
import { formatFileSize, presentCollaborationFailure, presentFailure, type IViewError } from "./requestPresentation";

export interface IDiscussionFilesPanelProps
{
    detail: RequestDetail;
}

type Pagination = IRequestTypeSearchResult["pagination"];

interface ICommentsState
{
    scope: string;
    items: CommentDTO[];
    pagination: Pagination;
}

interface IAttachmentsState
{
    scope: string;
    items: AttachmentDTO[];
}

export function DiscussionFilesPanel({ detail }: IDiscussionFilesPanelProps)
{
    const { user, generation } = useSession();
    const signedIn = Boolean(user);
    const sessionScope = `${generation}:${user?.id ?? ""}:${detail.id}`;
    const sessionScopeRef = useRef(sessionScope);
    sessionScopeRef.current = sessionScope;

    const commentInputId = useId();
    const commentCounterId = useId();
    const commentErrorId = useId();
    const commentTextareaRef = useRef<HTMLTextAreaElement>(null);
    const activeControllersRef = useRef<Set<AbortController>>(new Set());

    const [commentPage, setCommentPage] = useState(1);
    const [commentAttempt, setCommentAttempt] = useState(0);
    const [commentsState, setCommentsState] = useState<{ requestScope: string; data?: ICommentsState; error?: IViewError } | null>(null);

    const [draftBody, setDraftBody] = useState("");
    const [submittingComment, setSubmittingComment] = useState(false);
    const [commentSubmitError, setCommentSubmitError] = useState<IViewError | null>(null);

    const [attachmentAttempt, setAttachmentAttempt] = useState(0);
    const [attachmentsState, setAttachmentsState] = useState<{ requestScope: string; data?: IAttachmentsState; error?: IViewError } | null>(null);
    const [downloadingId, setDownloadingId] = useState<string | null>(null);
    const [downloadError, setDownloadError] = useState<IViewError | null>(null);

    const isOwner = Boolean(user && detail.requester.id === user.id && user.roles.includes("REQUESTER"));
    const canEditWorking = isOwner && (detail.status === "DRAFT" || detail.status === "RETURNED") && detail.workingRevision !== null;
    const workingRevisionId = detail.workingRevision?.id ?? null;

    const abortActionControllers = useCallback(() =>
    {
        for (const controller of activeControllersRef.current)
        {
            controller.abort();
        }
        activeControllersRef.current.clear();
    }, []);

    useEffect(() =>
    {
        setCommentPage(1);
        setCommentAttempt(0);
        setCommentsState(null);
        setDraftBody("");
        setSubmittingComment(false);
        setCommentSubmitError(null);
        setAttachmentAttempt(0);
        setAttachmentsState(null);
        setDownloadingId(null);
        setDownloadError(null);
        return () =>
        {
            abortActionControllers();
        };
    }, [sessionScope, abortActionControllers]);

    const commentsRequestScope = `${sessionScope}:${commentPage}:${commentAttempt}`;
    useEffect(() =>
    {
        if (!signedIn)
        {
            return;
        }
        const controller = new AbortController();
        void readComments(detail.id, { pageNumber: commentPage, pageSize: 20 }, controller.signal, generation)
            .then((result) =>
            {
                if (!controller.signal.aborted && sessionScopeRef.current === sessionScope)
                {
                    setCommentsState({
                        requestScope: commentsRequestScope,
                        data: { scope: sessionScope, items: result.items, pagination: result.pagination },
                    });
                }
            })
            .catch((failure: unknown) =>
            {
                if (!controller.signal.aborted && sessionScopeRef.current === sessionScope)
                {
                    setCommentsState({
                        requestScope: commentsRequestScope,
                        error: presentFailure(failure, "Could not load comments."),
                    });
                }
            });
        return () => controller.abort();
    }, [signedIn, detail.id, commentPage, generation, sessionScope, commentsRequestScope]);

    const attachmentsRequestScope = `${sessionScope}:${workingRevisionId ?? ""}:${attachmentAttempt}`;
    useEffect(() =>
    {
        if (!signedIn)
        {
            return;
        }
        const controller = new AbortController();
        void readAttachments(detail.id, { pageNumber: 1, pageSize: 100 }, controller.signal, generation)
            .then((result) =>
            {
                if (!controller.signal.aborted && sessionScopeRef.current === sessionScope)
                {
                    setAttachmentsState({
                        requestScope: attachmentsRequestScope,
                        data: { scope: sessionScope, items: result.items },
                    });
                }
            })
            .catch((failure: unknown) =>
            {
                if (!controller.signal.aborted && sessionScopeRef.current === sessionScope)
                {
                    setAttachmentsState({
                        requestScope: attachmentsRequestScope,
                        error: presentFailure(failure, "Could not load attachments."),
                    });
                }
            });
        return () => controller.abort();
    }, [signedIn, detail.id, generation, sessionScope, attachmentsRequestScope]);

    const currentComments = commentsState?.requestScope === commentsRequestScope ? commentsState : null;
    const currentAttachments = attachmentsState?.requestScope === attachmentsRequestScope ? attachmentsState : null;
    const loadedComments = currentComments?.data?.scope === sessionScope ? currentComments.data : null;
    const loadedAttachments = currentAttachments?.data?.scope === sessionScope ? currentAttachments.data.items : [];

    const workingAttachments = useMemo(() =>
    {
        if (!canEditWorking || !workingRevisionId)
        {
            return [];
        }
        return loadedAttachments.filter((item) => item.workingOrSubmittedRevisionId === workingRevisionId);
    }, [canEditWorking, loadedAttachments, workingRevisionId]);

    const submittedGroups = useMemo(() =>
    {
        const submittedItems = loadedAttachments.filter((item) => !canEditWorking || item.workingOrSubmittedRevisionId !== workingRevisionId);
        const groups = new Map<string, AttachmentDTO[]>();
        for (const item of submittedItems)
        {
            const group = groups.get(item.workingOrSubmittedRevisionId) ?? [];
            group.push(item);
            groups.set(item.workingOrSubmittedRevisionId, group);
        }
        const entries = Array.from(groups.entries());
        return entries.map(([revisionId, items], index) =>
        {
            const label = detail.submittedRevision?.id === revisionId
                ? `Revision ${detail.submittedRevision.revisionNumber}`
                : entries.length === 1 && detail.revisionNumber !== null
                    ? `Revision ${detail.revisionNumber}`
                    : `Submitted revision ${index + 1}`;
            return { revisionId, label, items };
        });
    }, [canEditWorking, detail.revisionNumber, detail.submittedRevision, loadedAttachments, workingRevisionId]);

    async function handleCommentSubmit(event: FormEvent<HTMLFormElement>): Promise<void>
    {
        event.preventDefault();
        if (submittingComment || !signedIn)
        {
            return;
        }
        const parsed = createCommentSchema.safeParse({ body: draftBody });
        if (!parsed.success)
        {
            const trimmedLength = draftBody.trim().length;
            setCommentSubmitError({
                message: trimmedLength === 0
                    ? "Enter a comment before posting."
                    : `Comment must be ${MAX_COMMENT_BODY_LENGTH} characters or fewer.`,
                terminal: false,
            });
            commentTextareaRef.current?.focus();
            return;
        }

        const activeScope = sessionScope;
        const controller = new AbortController();
        activeControllersRef.current.add(controller);
        setSubmittingComment(true);
        setCommentSubmitError(null);

        try
        {
            const created = await addComment(detail.id, parsed.data, controller.signal, generation);
            if (sessionScopeRef.current !== activeScope || controller.signal.aborted)
            {
                return;
            }
            setDraftBody("");

            const snapshot = loadedComments;
            if (snapshot && !snapshot.pagination.hasNext && snapshot.items.length < snapshot.pagination.pageSize)
            {
                const alreadyExists = snapshot.items.some((item) => item.id === created.id);
                const nextItems = alreadyExists ? snapshot.items : [...snapshot.items, created];
                const nextTotalCount = alreadyExists ? snapshot.pagination.totalCount : snapshot.pagination.totalCount + 1;
                setCommentsState({
                    requestScope: commentsRequestScope,
                    data: {
                        scope: activeScope,
                        items: nextItems,
                        pagination: {
                            ...snapshot.pagination,
                            totalCount: nextTotalCount,
                            totalPages: Math.max(1, Math.ceil(nextTotalCount / snapshot.pagination.pageSize)),
                        },
                    },
                });
            }
            else if (snapshot)
            {
                const nextTotalCount = snapshot.pagination.totalCount + 1;
                const lastPage = Math.max(1, Math.ceil(nextTotalCount / snapshot.pagination.pageSize));
                if (lastPage !== commentPage)
                {
                    setCommentPage(lastPage);
                }
                else
                {
                    setCommentAttempt((value) => value + 1);
                }
            }
            else
            {
                setCommentAttempt((value) => value + 1);
            }
        }
        catch (failure)
        {
            if (sessionScopeRef.current !== activeScope || controller.signal.aborted)
            {
                return;
            }
            setCommentSubmitError(presentCollaborationFailure(failure, "Could not post comment. Your message is preserved."));
        }
        finally
        {
            activeControllersRef.current.delete(controller);
            if (sessionScopeRef.current === activeScope)
            {
                setSubmittingComment(false);
            }
        }
    }

    async function handleDownload(attachment: AttachmentDTO): Promise<void>
    {
        if (downloadingId || !signedIn)
        {
            return;
        }
        const activeScope = sessionScope;
        const controller = new AbortController();
        activeControllersRef.current.add(controller);
        setDownloadingId(attachment.id);
        setDownloadError(null);
        try
        {
            await downloadRequestAttachment(attachment.id, attachment.fileName, controller.signal, generation);
        }
        catch (failure)
        {
            if (sessionScopeRef.current !== activeScope || controller.signal.aborted)
            {
                return;
            }
            setDownloadError(presentCollaborationFailure(failure, "Could not download attachment."));
        }
        finally
        {
            activeControllersRef.current.delete(controller);
            if (sessionScopeRef.current === activeScope)
            {
                setDownloadingId(null);
            }
        }
    }

    function handleWorkingUploaded(attachment: AttachmentDTO): void
    {
        setAttachmentsState((current) =>
        {
            const existing = current?.requestScope === attachmentsRequestScope && current.data ? current.data.items : [];
            if (existing.some((item) => item.id === attachment.id))
            {
                return current;
            }
            return {
                requestScope: attachmentsRequestScope,
                data: { scope: sessionScope, items: [...existing, attachment] },
            };
        });
    }

    function handleWorkingDeleted(attachmentId: string): void
    {
        setAttachmentsState((current) =>
        {
            if (!current || current.requestScope !== attachmentsRequestScope || !current.data)
            {
                return current;
            }
            return {
                requestScope: attachmentsRequestScope,
                data: { scope: sessionScope, items: current.data.items.filter((item) => item.id !== attachmentId) },
            };
        });
    }

    function handleWorkingReconciled(serverWorkingItems: AttachmentDTO[]): void
    {
        setAttachmentsState((current) =>
        {
            const existing = current?.requestScope === attachmentsRequestScope && current.data ? current.data.items : [];
            const nonWorking = existing.filter((item) => item.workingOrSubmittedRevisionId !== workingRevisionId);
            return {
                requestScope: attachmentsRequestScope,
                data: { scope: sessionScope, items: [...nonWorking, ...serverWorkingItems] },
            };
        });
    }

    const commentListError = currentComments?.error;
    const attachmentListError = currentAttachments?.error;

    return <div className="space-y-8 rounded-xl border bg-card p-5 sm:p-8">
        <section aria-label="Discussion" className="space-y-4">
            <div className="space-y-1">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                    <MessageSquare aria-hidden="true" className="size-5 text-primary" />
                    Discussion
                </h2>
                <p className="rounded-md bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                    Comments are for business discussion only and do not record formal approval decisions.
                </p>
            </div>

            {commentListError ? <div role="alert" className="space-y-2 rounded-md border border-destructive/60 bg-destructive/5 p-4 text-sm text-destructive">
                <p>{commentListError.message}</p>
                {commentListError.requestId && <p className="text-xs text-muted-foreground">Request ID: <span className="select-all">{commentListError.requestId}</span></p>}
                {!commentListError.terminal && <ActionButton type="button" size="small" onClick={() => setCommentAttempt((value) => value + 1)}>Retry comments</ActionButton>}
            </div> : !loadedComments ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle aria-hidden="true" className="size-4 text-primary motion-safe:animate-spin" />
                Loading comments…
            </p> : <>
                {loadedComments.items.length === 0 ? <p className="text-sm text-muted-foreground">No comments yet.</p> : <ol aria-label="Comments list" className="space-y-3">
                    {loadedComments.items.map((comment) => <li key={comment.id} className="space-y-1.5 rounded-lg border bg-background p-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                            <span className="font-semibold">{comment.author.displayName}</span>
                            <time dateTime={comment.createdAt} className="text-xs text-muted-foreground">{formatInstant(comment.createdAt)}</time>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">{comment.body}</p>
                    </li>)}
                </ol>}

                {loadedComments.pagination.totalPages > 1 && <nav aria-label="Comment pages" className="flex flex-wrap items-center gap-3 pt-1 text-sm">
                    <ActionButton type="button" size="small" disabled={!loadedComments.pagination.hasPrevious} onClick={() => setCommentPage((value) => Math.max(1, value - 1))}>
                        Previous comments
                    </ActionButton>
                    <span className="tabular-nums text-muted-foreground">
                        Page {loadedComments.pagination.currentPage} of {loadedComments.pagination.totalPages} ({loadedComments.pagination.totalCount} total)
                    </span>
                    <ActionButton type="button" size="small" disabled={!loadedComments.pagination.hasNext} onClick={() => setCommentPage((value) => value + 1)}>
                        Next comments
                    </ActionButton>
                </nav>}
            </>}

            {!commentListError?.terminal && <form onSubmit={(event) => void handleCommentSubmit(event)} className="space-y-3 border-t pt-4">
                <div className="space-y-1.5">
                    <label htmlFor={commentInputId} className="block text-sm font-medium">Add a comment</label>
                    <textarea
                        ref={commentTextareaRef}
                        id={commentInputId}
                        rows={3}
                        maxLength={MAX_COMMENT_BODY_LENGTH}
                        disabled={submittingComment}
                        value={draftBody}
                        onChange={(event) =>
                        {
                            setDraftBody(event.target.value);
                            if (commentSubmitError)
                            {
                                setCommentSubmitError(null);
                            }
                        }}
                        aria-invalid={Boolean(commentSubmitError)}
                        aria-describedby={commentSubmitError ? `${commentCounterId} ${commentErrorId}` : commentCounterId}
                        placeholder="Write a comment for request participants…"
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p id={commentCounterId} className="text-xs tabular-nums text-muted-foreground">
                            {draftBody.trim().length} / {MAX_COMMENT_BODY_LENGTH} characters
                        </p>
                        <ActionButton type="submit" variant="primary" disabled={submittingComment}>
                            <Send aria-hidden="true" className="size-4" />
                            {submittingComment ? "Posting…" : "Post comment"}
                        </ActionButton>
                    </div>
                </div>
                {commentSubmitError && <div id={commentErrorId} role="alert" className="flex items-start gap-2 rounded-md border border-destructive/60 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    <div>
                        <p>{commentSubmitError.message}</p>
                        {commentSubmitError.requestId && <p className="text-xs text-muted-foreground">Request ID: <span className="select-all">{commentSubmitError.requestId}</span></p>}
                    </div>
                </div>}
            </form>}
        </section>

        <section aria-label="Files" className="space-y-6 border-t pt-6">
            <h2 className="text-lg font-semibold">Files</h2>

            {canEditWorking && <WorkingAttachmentsUploader
                requestId={detail.id}
                workingRevisionId={workingRevisionId}
                attachments={workingAttachments}
                loading={!currentAttachments?.data && !attachmentListError}
                loadError={attachmentListError ? (attachmentListError.requestId ? `${attachmentListError.message} Request ID: ${attachmentListError.requestId}` : attachmentListError.message) : ""}
                canEdit={true}
                heading="Working Revision Files"
                onUploaded={handleWorkingUploaded}
                onDeleted={handleWorkingDeleted}
                onReconciled={handleWorkingReconciled}
                onReload={attachmentListError?.terminal ? undefined : () => setAttachmentAttempt((value) => value + 1)}
            />}

            {(!canEditWorking || submittedGroups.length > 0) && <section aria-label="Submitted Revision Evidence" className="space-y-3">
                <h3 className="text-base font-semibold">Submitted Revision Evidence</h3>
                {downloadError && <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/60 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    <div>
                        <p>{downloadError.message}</p>
                        {downloadError.requestId && <p className="text-xs text-muted-foreground">Request ID: <span className="select-all">{downloadError.requestId}</span></p>}
                    </div>
                </div>}

                {attachmentListError && !canEditWorking ? <div role="alert" className="space-y-2 rounded-md border border-destructive/60 bg-destructive/5 p-4 text-sm text-destructive">
                    <p>{attachmentListError.message}</p>
                    {attachmentListError.requestId && <p className="text-xs text-muted-foreground">Request ID: <span className="select-all">{attachmentListError.requestId}</span></p>}
                    {!attachmentListError.terminal && <ActionButton type="button" size="small" onClick={() => setAttachmentAttempt((value) => value + 1)}>Retry files</ActionButton>}
                </div> : !currentAttachments?.data && !canEditWorking ? <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
                    <LoaderCircle aria-hidden="true" className="size-4 text-primary motion-safe:animate-spin" />
                    Loading attachments…
                </p> : submittedGroups.length === 0 ? <p className="text-sm text-muted-foreground">No submitted files attached.</p> : <div className="space-y-4">
                    {submittedGroups.map((group) => <div key={group.revisionId} className="space-y-2">
                        <h4 className="text-sm font-medium text-muted-foreground">{group.label}</h4>
                        <ul aria-label={`${group.label} attachments`} className="divide-y rounded-lg border">
                            {group.items.map((attachment) => <li key={attachment.id} className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                                    <div className="min-w-0">
                                        <p className="truncate font-medium">{attachment.fileName}</p>
                                        <p className="text-xs tabular-nums text-muted-foreground">{formatFileSize(attachment.sizeBytes)} · {attachment.mediaType}</p>
                                    </div>
                                </div>
                                <ActionButton type="button" size="small" disabled={downloadingId === attachment.id} onClick={() => void handleDownload(attachment)}>
                                    <Download aria-hidden="true" className="size-3.5" />
                                    {downloadingId === attachment.id ? "Downloading…" : "Download"}
                                </ActionButton>
                            </li>)}
                        </ul>
                    </div>)}
                </div>}
            </section>}
        </section>
    </div>;
}
