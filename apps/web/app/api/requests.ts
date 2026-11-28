import { z } from "zod";
import {
    approverSummarySchema,
    attachmentQuerySchema,
    attachmentSchema,
    commentQuerySchema,
    commentSchema,
    createCommentSchema,
    publishedRequestTypeSchema,
    requestDetailSchema,
    requestRevisionSchema,
    requestSummarySchema,
    revisionMetadataSchema,
    type AttachmentDTO,
    type AttachmentQuery,
    type CommentDTO,
    type CommentQuery,
    type CreateCommentInput,
    type CreateRequest,
    type PatchDraft,
    type RequestSearchQuery,
    type RequestTypeSearch,
    type WithdrawRequest,
} from "@workflow/contracts";
import { ApiFailure, parseErrorEnvelope, parseErrorEnvelopeFromValues } from "./errors";
import { abortFailure, apiBaseUrl, http, httpFor, httpPageFor, refreshAccessToken } from "./http";
import { currentGeneration, endSession, readAccessToken } from "./tokenStore";

export type UploadPhase = "Uploading" | "Finalizing";

export interface IUploadAttachmentOptions
{
    requestId: string;
    file: File;
    workingRevisionId?: string;
    onProgress?: (percent: number) => void;
    onPhaseChange?: (phase: UploadPhase) => void;
    signal?: AbortSignal;
    generation?: number;
}

function parseJsonSafely(text: string): unknown
{
    if (!text)
    {
        return undefined;
    }
    try
    {
        return JSON.parse(text);
    }
    catch
    {
        return undefined;
    }
}

function sanitizeDownloadFileName(name: string): string
{
    const baseName = name.replace(/^.*[/\\]/, "");
    let clean = "";
    for (const ch of baseName)
    {
        const code = ch.charCodeAt(0);
        if (code >= 0x20 && code !== 0x7f)
        {
            clean += ch;
        }
    }
    return clean.trim();
}

export function parseContentDispositionFileName(header: string | null, fallbackFileName: string): string
{
    if (header)
    {
        const extMatch = /filename\*\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(header);
        const extRaw = extMatch?.[1] ?? extMatch?.[2];
        if (extRaw)
        {
            const parts = /^[^']*'[^']*'(.*)$/.exec(extRaw);
            const encoded = parts ? parts[1]! : extRaw;
            try
            {
                const decoded = sanitizeDownloadFileName(decodeURIComponent(encoded));
                if (decoded)
                {
                    return decoded;
                }
            }
            catch
            {
                // Fall back to quoted filename or fallbackFileName if percent-encoding is malformed.
            }
        }

        const basicMatch = /filename\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^;\s]+))/i.exec(header);
        const basicRaw = basicMatch?.[1] ?? basicMatch?.[2];
        if (basicRaw)
        {
            const unescaped = sanitizeDownloadFileName(basicRaw.replace(/\\(.)/g, "$1"));
            if (unescaped)
            {
                return unescaped;
            }
        }
    }
    return sanitizeDownloadFileName(fallbackFileName) || "attachment";
}

export function listComments(id: string, query?: Partial<CommentQuery>, signal?: AbortSignal, generation?: number)
{
    const parsed = commentQuerySchema.parse(query ?? {});
    const params = new URLSearchParams({
        pageNumber: String(parsed.pageNumber),
        pageSize: String(parsed.pageSize),
    });
    return httpPageFor(`/v1/requests/${id}/comments?${params.toString()}`, z.array(commentSchema), { signal, generation });
}

export function createComment(id: string, input: CreateCommentInput, signal?: AbortSignal, generation?: number): Promise<CommentDTO>
{
    const body = createCommentSchema.parse(input);
    return httpFor(`/v1/requests/${id}/comments`, commentSchema, { method: "POST", body, signal, generation });
}

export function listAttachments(id: string, query?: Partial<AttachmentQuery>, signal?: AbortSignal, generation?: number)
{
    const parsed = attachmentQuerySchema.parse(query ?? {});
    const params = new URLSearchParams({
        pageNumber: String(parsed.pageNumber),
        pageSize: String(parsed.pageSize),
    });
    if (parsed.revisionId)
    {
        params.set("revisionId", parsed.revisionId);
    }
    return httpPageFor(`/v1/requests/${id}/attachments?${params.toString()}`, z.array(attachmentSchema), { signal, generation });
}

export function uploadAttachment(options: IUploadAttachmentOptions): Promise<AttachmentDTO>
{
    const targetGeneration = options.generation ?? currentGeneration();
    if (options.signal?.aborted || targetGeneration !== currentGeneration())
    {
        return Promise.reject(abortFailure());
    }

    const sendOnce = (allowRefresh: boolean): Promise<AttachmentDTO> => new Promise((resolve, reject) =>
    {
        if (options.signal?.aborted || targetGeneration !== currentGeneration())
        {
            reject(abortFailure());
            return;
        }

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${apiBaseUrl()}/v1/requests/${options.requestId}/attachments`, true);
        xhr.withCredentials = false;

        const token = readAccessToken();
        const hasAuthHeader = token !== null && token.generation === targetGeneration;
        if (hasAuthHeader)
        {
            xhr.setRequestHeader("Authorization", `Bearer ${token.token}`);
        }

        let uploadEnded = false;
        let settled = false;

        const cleanup = () =>
        {
            options.signal?.removeEventListener("abort", onAbort);
        };

        const onAbort = () =>
        {
            if (!settled)
            {
                xhr.abort();
            }
        };

        options.signal?.addEventListener("abort", onAbort, { once: true });

        xhr.upload.onprogress = (event) =>
        {
            if (!settled && event.lengthComputable && event.total > 0)
            {
                const percent = Math.min(100, Math.max(0, Math.round((event.loaded / event.total) * 100)));
                options.onProgress?.(percent);
            }
        };

        xhr.upload.onloadend = () =>
        {
            if (!settled)
            {
                uploadEnded = true;
                options.onPhaseChange?.("Finalizing");
            }
        };

        xhr.onabort = () =>
        {
            if (settled) return;
            settled = true;
            cleanup();
            reject(abortFailure());
        };

        xhr.onerror = () =>
        {
            if (settled) return;
            settled = true;
            cleanup();
            if (options.signal?.aborted || targetGeneration !== currentGeneration())
            {
                reject(abortFailure());
                return;
            }
            reject(new ApiFailure({
                kind: "network",
                message: uploadEnded ? "Upload status is unknown after connection drop." : "Network request failed",
                ambiguousCommit: uploadEnded,
            }));
        };

        xhr.ontimeout = () =>
        {
            if (settled) return;
            settled = true;
            cleanup();
            if (options.signal?.aborted || targetGeneration !== currentGeneration())
            {
                reject(abortFailure());
                return;
            }
            reject(new ApiFailure({
                kind: "network",
                message: uploadEnded ? "Upload status is unknown after timeout." : "Network request timed out",
                ambiguousCommit: uploadEnded,
            }));
        };

        xhr.onload = () =>
        {
            if (settled) return;
            settled = true;
            cleanup();

            if (options.signal?.aborted || targetGeneration !== currentGeneration())
            {
                reject(abortFailure());
                return;
            }

            if (xhr.status === 0)
            {
                reject(new ApiFailure({
                    kind: "network",
                    message: uploadEnded ? "Upload status is unknown after connection drop." : "Network request failed",
                    ambiguousCommit: uploadEnded,
                }));
                return;
            }

            const body = parseJsonSafely(xhr.responseText);

            if (xhr.status >= 200 && xhr.status < 300)
            {
                const parsed = attachmentSchema.safeParse(body);
                if (parsed.success)
                {
                    resolve(parsed.data);
                }
                else
                {
                    reject(new ApiFailure({
                        kind: "malformed",
                        status: xhr.status,
                        message: "Invalid attachment response.",
                    }));
                }
                return;
            }

            const envelope = parseErrorEnvelopeFromValues(xhr.status, xhr.statusText, xhr.getResponseHeader("x-request-id"), body);
            const failure = new ApiFailure({
                kind: "http",
                status: xhr.status,
                code: envelope.code,
                message: envelope.message,
                requestId: envelope.requestId,
                details: envelope.details,
            });

            if (xhr.status === 401 && allowRefresh && hasAuthHeader)
            {
                void refreshAccessToken(targetGeneration).then((refreshed) =>
                {
                    if (refreshed && targetGeneration === currentGeneration() && !options.signal?.aborted)
                    {
                        sendOnce(false).then(resolve, reject);
                        return;
                    }
                    reject(failure);
                });
                return;
            }

            if (xhr.status === 401 && !allowRefresh && hasAuthHeader)
            {
                endSession(targetGeneration);
            }

            reject(failure);
        };

        const formData = new FormData();
        formData.append("file", options.file);
        if (options.workingRevisionId)
        {
            formData.append("workingRevisionId", options.workingRevisionId);
        }

        options.onPhaseChange?.("Uploading");
        options.onProgress?.(0);
        xhr.send(formData);
    });

    return sendOnce(true);
}

export async function deleteAttachment(requestId: string, attachmentId: string, signal?: AbortSignal, generation?: number): Promise<void>
{
    await http(`/v1/requests/${requestId}/attachments/${attachmentId}`, { method: "DELETE", signal, generation });
}

export async function downloadAttachment(attachmentId: string, fallbackFileName: string, signal?: AbortSignal, generation?: number): Promise<void>
{
    const targetGeneration = generation ?? currentGeneration();
    if (signal?.aborted || targetGeneration !== currentGeneration())
    {
        throw abortFailure();
    }

    const fetchDownload = async (allowRefresh: boolean): Promise<Response> =>
    {
        if (signal?.aborted || targetGeneration !== currentGeneration())
        {
            throw abortFailure();
        }
        const headers = new Headers();
        const token = readAccessToken();
        const hasAuthHeader = token !== null && token.generation === targetGeneration;
        if (hasAuthHeader)
        {
            headers.set("Authorization", `Bearer ${token.token}`);
        }

        let response: Response;
        try
        {
            response = await fetch(`${apiBaseUrl()}/v1/attachments/${attachmentId}/download`, {
                method: "GET",
                headers,
                credentials: "include",
                signal,
            });
        }
        catch (cause)
        {
            if (signal?.aborted || targetGeneration !== currentGeneration())
            {
                throw abortFailure();
            }
            throw new ApiFailure({ kind: "network", message: "Network request failed", cause });
        }

        if (signal?.aborted || targetGeneration !== currentGeneration())
        {
            throw abortFailure();
        }

        if (response.ok)
        {
            return response;
        }

        const text = await response.text().catch(() => "");
        const body = parseJsonSafely(text);
        if (response.status === 401 && allowRefresh && hasAuthHeader)
        {
            if (await refreshAccessToken(targetGeneration))
            {
                return fetchDownload(false);
            }
        }
        else if (response.status === 401 && !allowRefresh && hasAuthHeader)
        {
            endSession(targetGeneration);
        }

        const envelope = parseErrorEnvelope(response, body);
        throw new ApiFailure({
            kind: "http",
            status: response.status,
            code: envelope.code,
            message: envelope.message,
            requestId: envelope.requestId,
            details: envelope.details,
        });
    };

    const response = await fetchDownload(true);
    const fileName = parseContentDispositionFileName(response.headers.get("Content-Disposition"), fallbackFileName);
    const blob = await response.blob();
    if (signal?.aborted || targetGeneration !== currentGeneration())
    {
        throw abortFailure();
    }

    const objectUrl = URL.createObjectURL(blob);
    try
    {
        const anchor = document.createElement("a");
        anchor.href = objectUrl;
        anchor.download = fileName;
        anchor.style.display = "none";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
    }
    finally
    {
        URL.revokeObjectURL(objectUrl);
    }
}

export const requestApi = {
    search: (body: RequestSearchQuery, signal?: AbortSignal, generation?: number) => httpPageFor("/v1/requests/search", z.array(requestSummarySchema), { method: "POST", body, signal, generation }),
    types: (pageNumber = 1, signal?: AbortSignal) => httpPageFor("/v1/request-types/search", z.array(publishedRequestTypeSchema), { method: "POST", body: { pageNumber, pageSize: 100 }, signal }),
    searchTypes: (body: RequestTypeSearch, signal: AbortSignal, generation: number) => httpPageFor("/v1/request-types/search", z.array(publishedRequestTypeSchema), { method: "POST", body, signal, generation }),
    type: (id: string, signal?: AbortSignal, generation?: number) => httpFor(`/v1/request-types/${id}`, publishedRequestTypeSchema, { signal, generation }),
    version: (id: string, versionId: string, requestId: string, signal?: AbortSignal, generation?: number) => httpFor(`/v1/request-types/${id}/versions/${versionId}?requestId=${requestId}`, publishedRequestTypeSchema, { signal, generation }),
    revisions: (id: string, pageNumber: number, signal?: AbortSignal, generation?: number) => httpPageFor(`/v1/requests/${id}/revisions?pageNumber=${pageNumber}&pageSize=20`, z.array(revisionMetadataSchema), { signal, generation }),
    revision: (id: string, revisionId: string, signal?: AbortSignal, generation?: number) => httpFor(`/v1/requests/${id}/revisions/${revisionId}`, requestRevisionSchema, { signal, generation }),
    approvers: (id: string, signal?: AbortSignal, generation?: number) => httpFor(`/v1/requests/${id}/approvers`, z.array(approverSummarySchema), { signal, generation }),
    read: (id: string, signal?: AbortSignal, generation?: number) => httpFor(`/v1/requests/${id}`, requestDetailSchema, { signal, generation }),
    create: (body: CreateRequest, key: string) => httpFor("/v1/requests", requestDetailSchema, { method: "POST", body, headers: { "Idempotency-Key": key } }),
    patch: (id: string, body: PatchDraft, key: string) => httpFor(`/v1/requests/${id}/draft`, requestDetailSchema, { method: "PATCH", body, headers: { "Idempotency-Key": key } }),
    withdraw: (id: string, body: WithdrawRequest, key: string, generation?: number) => httpFor(`/v1/requests/${id}/withdraw`, requestDetailSchema, { method: "POST", body, headers: { "Idempotency-Key": key }, generation }),
    resubmit: (id: string, expectedVersion: number, key: string) => httpFor(`/v1/requests/${id}/resubmit`, requestDetailSchema, { method: "POST", body: { expectedVersion }, headers: { "Idempotency-Key": key } }),
    submit: (id: string, expectedVersion: number, key: string) => httpFor(`/v1/requests/${id}/submit`, requestDetailSchema, { method: "POST", body: { expectedVersion }, headers: { "Idempotency-Key": key } }),
    listComments,
    createComment,
    listAttachments,
    uploadAttachment,
    deleteAttachment,
    downloadAttachment,
};
