import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES } from "@workflow/contracts";
import {
    BuildContentDisposition,
    SanitizeAttachmentFileName,
    ValidateAttachmentUpload,
} from "../../src/Domains/Requests/AttachmentRules";
import { RequestError } from "../../src/Domains/Requests/RequestRules";

const REQUEST_ID = "10000000-0000-4000-8000-000000000001";
const REVISION_ID = "20000000-0000-4000-8000-000000000002";
const ATTACHMENT_ID = "30000000-0000-4000-8000-000000000003";

function pdfBytes(extra = "1.7\n%quote"): Uint8Array
{
    return new TextEncoder().encode(`%PDF-${extra}`);
}

function pngBytes(): Uint8Array
{
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
}

function jpegBytes(): Uint8Array
{
    return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
}

function webpBytes(): Uint8Array
{
    return new Uint8Array([
        0x52, 0x49, 0x46, 0x46,
        0x24, 0x00, 0x00, 0x00,
        0x57, 0x45, 0x42, 0x50,
        0x56, 0x50, 0x38, 0x20,
    ]);
}

describe("AttachmentRules", () =>
{
    it("ATT-UT-01 accepts all 5 allowlisted formats with matching magic bytes and computes accurate SHA-256 and storageKey", () =>
    {
        const cases = [
            { fileName: "quote.pdf", declaredMediaType: "application/pdf", bytes: pdfBytes() },
            { fileName: "diagram.png", declaredMediaType: "image/png", bytes: pngBytes() },
            { fileName: "receipt.jpg", declaredMediaType: "image/jpeg", bytes: jpegBytes() },
            { fileName: "scan.webp", declaredMediaType: "image/webp", bytes: webpBytes() },
            {
                fileName: "notes.txt",
                declaredMediaType: "text/plain; charset=utf-8",
                bytes: new TextEncoder().encode("Line 1\tColumn\nรายละเอียดภาษาไทย\r\n"),
            },
        ] as const;

        for (const item of cases)
        {
            const result = ValidateAttachmentUpload({
                requestId: REQUEST_ID,
                revisionId: REVISION_ID,
                attachmentId: ATTACHMENT_ID,
                fileName: item.fileName,
                declaredMediaType: item.declaredMediaType,
                bytes: item.bytes,
                existingRevisionAttachmentCount: 0,
            });

            expect(result.fileName).toBe(item.fileName);
            expect(result.sizeBytes).toBe(item.bytes.byteLength);
            expect(result.sha256).toBe(createHash("sha256").update(item.bytes).digest("hex"));
            expect(result.storageKey).toBe(`attachments/${REQUEST_ID}/${REVISION_ID}/${ATTACHMENT_ID}`);
        }
    });

    it("ATT-UT-02 sanitizes filenames and produces safe RFC 5987 + ASCII fallback Content-Disposition headers", () =>
    {
        expect(SanitizeAttachmentFileName("../../secret.pdf")).toBe("secret.pdf");
        expect(SanitizeAttachmentFileName("C:\\fakepath\\..hidden\"file\x00\x07.pdf")).toBe("hiddenfile.pdf");

        const longName = `${"a".repeat(270)}.pdf`;
        const clamped = SanitizeAttachmentFileName(longName);
        expect(clamped.length).toBe(255);
        expect(clamped.endsWith(".pdf")).toBe(true);

        const header = BuildContentDisposition("รายงาน \"Q4\" (2026)!.pdf");
        expect(header).toMatch(/^attachment; filename="[^"]+"; filename\*=UTF-8''/);
        expect(header).not.toContain("\n");
        expect(header).not.toContain("\r");
        expect(header).toContain("filename*=UTF-8''");
        expect(header).toContain("%21");
    });

    it("ATT-UT-03 allows exact 10 MiB limit and rejects 10 MiB + 1 byte with FILE_TOO_LARGE", () =>
    {
        const exact = new Uint8Array(MAX_ATTACHMENT_BYTES);
        exact.set([0x25, 0x50, 0x44, 0x46, 0x2d], 0);
        const accepted = ValidateAttachmentUpload({
            fileName: "max.pdf",
            declaredMediaType: "application/pdf",
            bytes: exact,
            existingRevisionAttachmentCount: 0,
        });
        expect(accepted.sizeBytes).toBe(MAX_ATTACHMENT_BYTES);

        const oversized = new Uint8Array(MAX_ATTACHMENT_BYTES + 1);
        oversized.set([0x25, 0x50, 0x44, 0x46, 0x2d], 0);
        expect(() =>
            ValidateAttachmentUpload({
                fileName: "too-big.pdf",
                declaredMediaType: "application/pdf",
                bytes: oversized,
                existingRevisionAttachmentCount: 0,
            }),
        ).toThrowError(expect.objectContaining<Partial<RequestError>>({ code: "FILE_TOO_LARGE" }));
    });

    it("ATT-UT-04 rejects 0-byte buffers and blank sanitized filenames with VALIDATION_ERROR", () =>
    {
        expect(() =>
            ValidateAttachmentUpload({
                fileName: "empty.pdf",
                declaredMediaType: "application/pdf",
                bytes: new Uint8Array(0),
                existingRevisionAttachmentCount: 0,
            }),
        ).toThrowError(expect.objectContaining<Partial<RequestError>>({ code: "VALIDATION_ERROR" }));

        for (const badName of ["...", "   ", "../../", "\"\"\x01"])
        {
            expect(() =>
                ValidateAttachmentUpload({
                    fileName: badName,
                    declaredMediaType: "application/pdf",
                    bytes: pdfBytes(),
                    existingRevisionAttachmentCount: 0,
                }),
            ).toThrowError(expect.objectContaining<Partial<RequestError>>({ code: "VALIDATION_ERROR" }));
        }
    });

    it("ATT-UT-05 rejects disallowed MIME types and dangerous file extensions with UNSUPPORTED_MEDIA_TYPE", () =>
    {
        for (const declaredMediaType of [
            "image/svg+xml",
            "text/html",
            "application/zip",
            "application/x-msdownload",
            "application/javascript",
        ])
        {
            expect(() =>
                ValidateAttachmentUpload({
                    fileName: "payload",
                    declaredMediaType,
                    bytes: new TextEncoder().encode("<svg></svg>"),
                    existingRevisionAttachmentCount: 0,
                }),
            ).toThrowError(expect.objectContaining<Partial<RequestError>>({ code: "UNSUPPORTED_MEDIA_TYPE" }));
        }

        for (const dangerousName of ["x.svg", "x.html", "x.htm", "x.exe", "x.dll", "x.bat", "x.sh", "x.js", "x.zip"])
        {
            expect(() =>
                ValidateAttachmentUpload({
                    fileName: dangerousName,
                    declaredMediaType: "text/plain",
                    bytes: new TextEncoder().encode("hello"),
                    existingRevisionAttachmentCount: 0,
                }),
            ).toThrowError(expect.objectContaining<Partial<RequestError>>({ code: "UNSUPPORTED_MEDIA_TYPE" }));
        }
    });

    it("ATT-UT-06 rejects spoofed magic bytes, mismatched extensions, and binary text/plain payloads with UNSUPPORTED_MEDIA_TYPE", () =>
    {
        const htmlBytes = new TextEncoder().encode("<html><script>alert(1)</script></html>");
        const peExeBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]);
        const nulTextBytes = new Uint8Array([0x48, 0x69, 0x00, 0x21]);
        const controlTextBytes = new Uint8Array([0x48, 0x69, 0x07, 0x21]);
        const invalidUtf8Bytes = new Uint8Array([0xff, 0xfe, 0xfd]);

        const spoofedCases = [
            { fileName: "fake.pdf", declaredMediaType: "application/pdf", bytes: htmlBytes },
            { fileName: "fake.pdf", declaredMediaType: "application/pdf", bytes: peExeBytes },
            { fileName: "fake.png", declaredMediaType: "image/png", bytes: jpegBytes() },
            { fileName: "fake.webp", declaredMediaType: "image/webp", bytes: new TextEncoder().encode("RIFF1234NOTW") },
            { fileName: "nul.txt", declaredMediaType: "text/plain", bytes: nulTextBytes },
            { fileName: "ctrl.txt", declaredMediaType: "text/plain", bytes: controlTextBytes },
            { fileName: "badutf8.txt", declaredMediaType: "text/plain", bytes: invalidUtf8Bytes },
            { fileName: "mismatch.png", declaredMediaType: "application/pdf", bytes: pdfBytes() },
        ];

        for (const item of spoofedCases)
        {
            expect(() =>
                ValidateAttachmentUpload({
                    fileName: item.fileName,
                    declaredMediaType: item.declaredMediaType,
                    bytes: item.bytes,
                    existingRevisionAttachmentCount: 0,
                }),
            ).toThrowError(expect.objectContaining<Partial<RequestError>>({ code: "UNSUPPORTED_MEDIA_TYPE" }));
        }
    });

    it("ATT-UT-07 enforces per-revision attachment cap of 10", () =>
    {
        const ok = ValidateAttachmentUpload({
            fileName: "tenth.pdf",
            declaredMediaType: "application/pdf",
            bytes: pdfBytes(),
            existingRevisionAttachmentCount: 9,
        });
        expect(ok.fileName).toBe("tenth.pdf");

        expect(() =>
            ValidateAttachmentUpload({
                fileName: "eleventh.pdf",
                declaredMediaType: "application/pdf",
                bytes: pdfBytes(),
                existingRevisionAttachmentCount: 10,
            }),
        ).toThrowError(expect.objectContaining<Partial<RequestError>>({ code: "VALIDATION_ERROR" }));
    });
});
