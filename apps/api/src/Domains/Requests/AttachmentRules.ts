import { createHash } from "node:crypto";
import {
    ALLOWED_ATTACHMENT_MEDIA_TYPES,
    MAX_ATTACHMENTS_PER_REVISION,
    MAX_ATTACHMENT_BYTES,
    type AttachmentMediaType,
} from "@workflow/contracts";
import { RequestError } from "./RequestRules";

const MAX_FILE_NAME_LENGTH = 255;

const DANGEROUS_EXTENSIONS = new Set([
    ".svg",
    ".svgz",
    ".html",
    ".htm",
    ".xhtml",
    ".xml",
    ".exe",
    ".dll",
    ".bat",
    ".cmd",
    ".com",
    ".msi",
    ".sh",
    ".bash",
    ".ps1",
    ".js",
    ".mjs",
    ".cjs",
    ".ts",
    ".zip",
    ".rar",
    ".7z",
    ".tar",
    ".gz",
    ".jar",
    ".php",
    ".py",
    ".rb",
    ".pl",
    ".vbs",
]);

const ALLOWED_EXTENSIONS_BY_MEDIA_TYPE: Record<AttachmentMediaType, readonly string[]> = {
    "application/pdf": [".pdf"],
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/webp": [".webp"],
    "text/plain": [".txt", ".text", ".log"],
};

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d] as const;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50] as const;

export interface IValidateAttachmentUploadBaseInput
{
    fileName: string;
    declaredMediaType: string;
    bytes: Uint8Array;
    existingRevisionAttachmentCount: number;
}

export interface IValidateAttachmentUploadWithIdsInput extends IValidateAttachmentUploadBaseInput
{
    requestId: string;
    revisionId: string;
    attachmentId: string;
}

export interface IValidateAttachmentUploadOptionalIdsInput extends IValidateAttachmentUploadBaseInput
{
    requestId?: string;
    revisionId?: string;
    attachmentId?: string;
}

export interface IValidatedAttachmentUpload
{
    fileName: string;
    mediaType: AttachmentMediaType;
    sizeBytes: number;
    sha256: string;
    storageKey?: string;
}

function hasBytesAt(bytes: Uint8Array, offset: number, signature: readonly number[]): boolean
{
    if (bytes.byteLength < offset + signature.length)
    {
        return false;
    }
    for (let index = 0; index < signature.length; index++)
    {
        if (bytes[offset + index] !== signature[index])
        {
            return false;
        }
    }
    return true;
}

function isValidPlainText(bytes: Uint8Array): boolean
{
    for (let index = 0; index < bytes.byteLength; index++)
    {
        const byte = bytes[index]!;
        if (byte === 0x00)
        {
            return false;
        }
        if (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d)
        {
            return false;
        }
    }

    try
    {
        new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        return true;
    }
    catch
    {
        return false;
    }
}

function matchesMediaTypeSignature(mediaType: AttachmentMediaType, bytes: Uint8Array): boolean
{
    switch (mediaType)
    {
        case "application/pdf":
            return hasBytesAt(bytes, 0, PDF_SIGNATURE);
        case "image/png":
            return hasBytesAt(bytes, 0, PNG_SIGNATURE);
        case "image/jpeg":
            return hasBytesAt(bytes, 0, JPEG_SIGNATURE);
        case "image/webp":
            return hasBytesAt(bytes, 0, RIFF_SIGNATURE) && hasBytesAt(bytes, 8, WEBP_SIGNATURE);
        case "text/plain":
            return isValidPlainText(bytes);
    }
}

function extractExtension(fileName: string): string
{
    const lastDot = fileName.lastIndexOf(".");
    if (lastDot <= 0 || lastDot === fileName.length - 1)
    {
        return "";
    }
    return fileName.slice(lastDot).toLowerCase();
}

function clampFileName(fileName: string): string
{
    if (fileName.length <= MAX_FILE_NAME_LENGTH)
    {
        return fileName;
    }

    const extension = extractExtension(fileName);
    if (extension && extension.length < MAX_FILE_NAME_LENGTH)
    {
        const maxBaseLength = MAX_FILE_NAME_LENGTH - extension.length;
        const base = trimIncompleteSurrogate(fileName.slice(0, maxBaseLength)).trimEnd();
        return `${base}${extension}`;
    }

    return trimIncompleteSurrogate(fileName.slice(0, MAX_FILE_NAME_LENGTH)).trimEnd();
}

function trimIncompleteSurrogate(value: string): string
{
    if (!value)
    {
        return value;
    }
    const lastCodeUnit = value.charCodeAt(value.length - 1);
    if (lastCodeUnit >= 0xd800 && lastCodeUnit <= 0xdbff)
    {
        return value.slice(0, -1);
    }
    return value;
}

/**
 * Sanitizes a client-supplied filename by removing path segments, control characters,
 * quotes, and leading dots, trimming whitespace, and clamping to 255 characters.
 */
export function SanitizeAttachmentFileName(fileName: string): string
{
    if (typeof fileName !== "string")
    {
        throw new RequestError("VALIDATION_ERROR", [
            { field: "fileName", code: "VALIDATION_ERROR", message: "Attachment filename must be a string." },
        ]);
    }

    const segments = fileName.split(/[/\\]/);
    const baseSegment = segments[segments.length - 1] ?? "";
    let cleaned = "";
    for (const char of baseSegment)
    {
        const code = char.charCodeAt(0);
        if ((code >= 0x00 && code <= 0x1f) || code === 0x7f || char === "\"" || char === "'")
        {
            continue;
        }
        cleaned += char;
    }

    cleaned = cleaned.trim().replace(/^\.+/, "").trim();
    cleaned = clampFileName(cleaned).trim();
    if (!cleaned || cleaned === "." || cleaned === "..")
    {
        throw new RequestError("VALIDATION_ERROR", [
            { field: "fileName", code: "VALIDATION_ERROR", message: "Attachment filename is invalid." },
        ]);
    }

    return cleaned;
}

/**
 * Builds an opaque private object storage key scoped by request, revision, and attachment IDs.
 */
export function BuildAttachmentStorageKey(requestId: string, revisionId: string, attachmentId: string): string
{
    return `attachments/${requestId.toLowerCase()}/${revisionId.toLowerCase()}/${attachmentId.toLowerCase()}`;
}

/**
 * Builds an RFC 6266 / RFC 5987 attachment Content-Disposition header with ASCII fallback and UTF-8 filename*.
 */
export function BuildContentDisposition(fileName: string): string
{
    let safeName = "attachment";
    try
    {
        safeName = SanitizeAttachmentFileName(fileName);
    }
    catch
    {
        safeName = "attachment";
    }

    const asciiCandidate = safeName
        .replace(/[^\x20-\x7e]/g, "_")
        .replace(/["\\;]/g, "_")
        .trim();
    const asciiFallback = asciiCandidate.length > 0 ? asciiCandidate : "attachment";
    const rfc5987Encoded = encodeURIComponent(safeName).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );

    return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${rfc5987Encoded}`;
}

function normalizeDeclaredMediaType(declaredMediaType: string): AttachmentMediaType
{
    const baseType = declaredMediaType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (!(ALLOWED_ATTACHMENT_MEDIA_TYPES as readonly string[]).includes(baseType))
    {
        throw new RequestError("UNSUPPORTED_MEDIA_TYPE", [
            { field: "file", code: "UNSUPPORTED_MEDIA_TYPE", message: "File type is not supported." },
        ]);
    }
    return baseType as AttachmentMediaType;
}

export function ValidateAttachmentUpload(
    input: IValidateAttachmentUploadWithIdsInput,
): IValidatedAttachmentUpload & { storageKey: string };
export function ValidateAttachmentUpload(
    input: IValidateAttachmentUploadOptionalIdsInput,
): IValidatedAttachmentUpload;
/**
 * Validates per-revision attachment cap, filename safety, byte bounds, extension consistency,
 * declared MIME allowlist, and binary magic-byte signatures, then computes SHA-256.
 */
export function ValidateAttachmentUpload(
    input: IValidateAttachmentUploadOptionalIdsInput,
): IValidatedAttachmentUpload
{
    if (
        !Number.isInteger(input.existingRevisionAttachmentCount)
        || input.existingRevisionAttachmentCount < 0
        || input.existingRevisionAttachmentCount >= MAX_ATTACHMENTS_PER_REVISION
    )
    {
        throw new RequestError("VALIDATION_ERROR", [
            {
                field: "file",
                code: "VALIDATION_ERROR",
                message: `A revision can contain at most ${MAX_ATTACHMENTS_PER_REVISION} attachments.`,
            },
        ]);
    }

    const fileName = SanitizeAttachmentFileName(input.fileName);

    if (input.bytes.byteLength <= 0)
    {
        throw new RequestError("VALIDATION_ERROR", [
            { field: "file", code: "VALIDATION_ERROR", message: "Attachment file must not be empty." },
        ]);
    }

    if (input.bytes.byteLength > MAX_ATTACHMENT_BYTES)
    {
        throw new RequestError("FILE_TOO_LARGE", [
            {
                field: "file",
                code: "FILE_TOO_LARGE",
                message: `Attachment exceeds maximum permitted size of ${MAX_ATTACHMENT_BYTES} bytes.`,
            },
        ]);
    }

    const mediaType = normalizeDeclaredMediaType(input.declaredMediaType);
    const extension = extractExtension(fileName);
    if (extension)
    {
        if (DANGEROUS_EXTENSIONS.has(extension) || !ALLOWED_EXTENSIONS_BY_MEDIA_TYPE[mediaType].includes(extension))
        {
            throw new RequestError("UNSUPPORTED_MEDIA_TYPE", [
                { field: "file", code: "UNSUPPORTED_MEDIA_TYPE", message: "File extension does not match an allowed media type." },
            ]);
        }
    }

    if (!matchesMediaTypeSignature(mediaType, input.bytes))
    {
        throw new RequestError("UNSUPPORTED_MEDIA_TYPE", [
            { field: "file", code: "UNSUPPORTED_MEDIA_TYPE", message: "File contents do not match the declared media type." },
        ]);
    }

    const sha256 = createHash("sha256").update(input.bytes).digest("hex");
    const result: IValidatedAttachmentUpload = {
        fileName,
        mediaType,
        sizeBytes: input.bytes.byteLength,
        sha256,
    };

    if (input.requestId && input.revisionId && input.attachmentId)
    {
        result.storageKey = BuildAttachmentStorageKey(input.requestId, input.revisionId, input.attachmentId);
    }

    return result;
}
