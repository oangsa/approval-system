import { createHash, randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";
import { beforeAll, describe, expect, it } from "vitest";
import { PrivateObjectStorageError } from "../../src/Domains/Requests/AttachmentPorts";
import {
    CreatePrivateObjectStorage,
    GcsPrivateObjectStorage,
} from "../../src/Infrastructures/Storage";

const PRODUCTION_BUCKET = "approval-system-attachments";

function normalizeBucketName(rawBucket: string | undefined): string
{
    return (rawBucket ?? "").trim().replace(/^gs:\/\//, "").replace(/\/+$/, "");
}

function assertSafeGcsTestBucket(rawBucket: string | undefined): string
{
    const normalized = normalizeBucketName(rawBucket);
    if (normalized === PRODUCTION_BUCKET)
    {
        throw new Error(
            `Refusing to run live GCS tests against production bucket "${PRODUCTION_BUCKET}". Set GCS_TEST_BUCKET to an isolated test bucket.`,
        );
    }
    return normalized;
}

const testBucket = assertSafeGcsTestBucket(process.env.GCS_TEST_BUCKET);
const hasTestBucket = testBucket.length > 0;
const testProjectId = process.env.GCS_PROJECT_ID?.trim() || undefined;

if (!hasTestBucket)
{
    console.info("[test:storage] Skipping live GCS tests (GCS-IT-01..08): GCS_TEST_BUCKET is not configured.");
}

async function readAllBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array>
{
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true)
    {
        const { value, done } = await reader.read();
        if (done)
        {
            break;
        }
        chunks.push(value);
        total += value.byteLength;
    }

    const combined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks)
    {
        combined.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return combined;
}

describe("GCS test-bucket isolation guard", () =>
{
    it("refuses to target the production bucket", () =>
    {
        expect(() => assertSafeGcsTestBucket(PRODUCTION_BUCKET)).toThrow(/production bucket/i);
        expect(() => assertSafeGcsTestBucket(`gs://${PRODUCTION_BUCKET}/`)).toThrow(/production bucket/i);
        expect(assertSafeGcsTestBucket("gs://approval-system-attachments-test/")).toBe(
            "approval-system-attachments-test",
        );
    });
});

describe.runIf(hasTestBucket)("GcsPrivateObjectStorage live integration (GCS-IT-01..08)", () =>
{
    let storage: GcsPrivateObjectStorage;
    const runPrefix = `gcs-it/${randomUUID()}`;
    const testKey = `${runPrefix}/sample.pdf`;
    const payload = new TextEncoder().encode(`%PDF-1.7\nLive GCS integration payload ${runPrefix}\n`);
    const expectedSha256 = createHash("sha256").update(payload).digest("hex");

    beforeAll(async () =>
    {
        storage = new GcsPrivateObjectStorage({
            bucketName: testBucket,
            projectId: testProjectId,
        });

        try
        {
            await storage.HeadObject(`${runPrefix}/adc-probe`);
        }
        catch (error)
        {
            throw new Error(
                "GCP Application Default Credentials (ADC) or GCS test bucket access is not configured. Run `gcloud auth application-default login` or verify GCS_TEST_BUCKET permissions.",
                { cause: error },
            );
        }
    });

    it("GCS-IT-01 writes private object with PutObject and inspects metadata via HeadObject", async () =>
    {
        await storage.PutObject({
            storageKey: testKey,
            contentType: "application/pdf",
            bytes: payload,
        });

        const head = await storage.HeadObject(testKey);
        expect(head).toEqual({
            exists: true,
            sizeBytes: payload.byteLength,
            contentType: "application/pdf",
        });
    });

    it("GCS-IT-02 streams uploaded bytes via ReadObjectStream with exact SHA-256 match", async () =>
    {
        const result = await storage.ReadObjectStream(testKey);
        expect(result.contentLength).toBe(payload.byteLength);

        const downloaded = await readAllBytes(result.stream);
        const actualSha256 = createHash("sha256").update(downloaded).digest("hex");
        expect(actualSha256).toBe(expectedSha256);
    });

    it("GCS-IT-03 enforces private bucket posture (PAP + UBLA) and denies anonymous HTTPS access", async () =>
    {
        const client = new Storage(testProjectId ? { projectId: testProjectId } : undefined);
        const [metadata] = await client.bucket(testBucket).getMetadata();

        expect(metadata.iamConfiguration?.publicAccessPrevention).toBe("enforced");
        expect(metadata.iamConfiguration?.uniformBucketLevelAccess?.enabled).toBe(true);

        const publicUrl = `https://storage.googleapis.com/${encodeURIComponent(testBucket)}/${testKey}`;
        const response = await fetch(publicUrl);
        expect([401, 403, 404]).toContain(response.status);
    });

    it("GCS-IT-04 deletes live object and immediately reports not-found on HeadObject and ReadObjectStream", async () =>
    {
        await storage.DeleteObject(testKey);

        expect(await storage.HeadObject(testKey)).toEqual({ exists: false });
        await expect(storage.ReadObjectStream(testKey)).rejects.toThrowError(
            expect.objectContaining<Partial<PrivateObjectStorageError>>({ code: "OBJECT_NOT_FOUND" }),
        );
    });

    it("GCS-IT-05 DeleteObject is idempotent on already-deleted or missing keys", async () =>
    {
        await expect(storage.DeleteObject(testKey)).resolves.toBeUndefined();
        await expect(storage.DeleteObject(`${runPrefix}/never-existed.pdf`)).resolves.toBeUndefined();
    });

    it("GCS-IT-06 initializes with ADC only and avoids static key configuration", () =>
    {
        expect(storage.GetAdcConfigSummary()).toEqual({
            driver: "gcs",
            ...(testProjectId ? { projectId: testProjectId } : {}),
            usesApplicationDefaultCredentials: true,
        });
    });

    it("GCS-IT-07 CreatePrivateObjectStorage wires gcs driver end-to-end against isolated test bucket", async () =>
    {
        const factoryStorage = CreatePrivateObjectStorage({
            ATTACHMENT_STORAGE_DRIVER: "gcs",
            GCS_PROJECT_ID: testProjectId,
            GCS_BUCKET_NAME: testBucket,
        });
        const lifecycleKey = `${runPrefix}/factory-lifecycle.txt`;
        const textPayload = new TextEncoder().encode("Factory lifecycle check");

        await factoryStorage.PutObject({
            storageKey: lifecycleKey,
            contentType: "text/plain",
            bytes: textPayload,
        });
        const read = await factoryStorage.ReadObjectStream(lifecycleKey);
        expect(await readAllBytes(read.stream)).toEqual(textPayload);

        await factoryStorage.DeleteObject(lifecycleKey);
        expect(await factoryStorage.HeadObject(lifecycleKey)).toEqual({ exists: false });
    });

    it("GCS-IT-08 maps nonexistent bucket errors to sanitized STORAGE_UNAVAILABLE without leaking internals", async () =>
    {
        const brokenBucket = `approval-system-nonexistent-${randomUUID()}`;
        const brokenStorage = new GcsPrivateObjectStorage({
            bucketName: brokenBucket,
            projectId: testProjectId,
        });

        await expect(
            brokenStorage.PutObject({
                storageKey: `${runPrefix}/broken.pdf`,
                contentType: "application/pdf",
                bytes: payload,
            }),
        ).rejects.toSatisfy((error: unknown) =>
            error instanceof PrivateObjectStorageError
            && error.code === "STORAGE_UNAVAILABLE"
            && !error.message.includes(brokenBucket),
        );

        await expect(brokenStorage.ReadObjectStream(`${runPrefix}/broken.pdf`)).rejects.toSatisfy((error: unknown) =>
            error instanceof PrivateObjectStorageError
            && error.code === "STORAGE_UNAVAILABLE"
            && !error.message.includes(brokenBucket),
        );
    });
});
