import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import type { Storage } from "@google-cloud/storage";
import { PrivateObjectStorageError } from "../../src/Domains/Requests/AttachmentPorts";
import {
    CreatePrivateObjectStorage,
    GcsPrivateObjectStorage,
    InMemoryPrivateObjectStorage,
} from "../../src/Infrastructures/Storage";

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

    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks)
    {
        result.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return result;
}

describe("PrivateObjectStorage adapters", () =>
{
    it("InMemoryPrivateObjectStorage supports put/head/stream/delete and fault injection hooks", async () =>
    {
        const storage = new InMemoryPrivateObjectStorage();
        const key = "attachments/req-1/rev-1/att-1";
        const payload = new TextEncoder().encode("hello storage");

        await storage.PutObject({ storageKey: key, contentType: "text/plain", bytes: payload });
        expect(await storage.HeadObject(key)).toEqual({
            exists: true,
            sizeBytes: payload.byteLength,
            contentType: "text/plain",
        });

        const read = await storage.ReadObjectStream(key);
        expect(read.contentLength).toBe(payload.byteLength);
        expect(await readAllBytes(read.stream)).toEqual(payload);

        await storage.DeleteObject(key);
        await storage.DeleteObject(key);
        expect(await storage.HeadObject(key)).toEqual({ exists: false });
        await expect(storage.ReadObjectStream(key)).rejects.toThrowError(
            expect.objectContaining<Partial<PrivateObjectStorageError>>({ code: "OBJECT_NOT_FOUND" }),
        );

        storage.SetFaultHooks({
            onPutObject: () =>
            {
                throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE", "Injected outage");
            },
        });
        await expect(
            storage.PutObject({ storageKey: key, contentType: "text/plain", bytes: payload }),
        ).rejects.toThrowError(expect.objectContaining<Partial<PrivateObjectStorageError>>({ code: "STORAGE_UNAVAILABLE" }));
    });

    it("GcsPrivateObjectStorage uses ADC config and maps 404 vs bucket/provider errors safely", async () =>
    {
        const missingObjectError = Object.assign(new Error("No such object: secret-bucket/secret-key"), { code: 404 });
        const missingBucketError = Object.assign(new Error("The specified bucket does not exist: secret-bucket"), {
            code: 404,
        });

        const fakeFileMissingObject = {
            save: async () =>
            {
                throw new Error("internal gs://secret-bucket/secret-key credential error");
            },
            getMetadata: async () =>
            {
                throw missingObjectError;
            },
            createReadStream: () => new PassThrough(),
            delete: async () =>
            {
                throw missingObjectError;
            },
        };

        const fakeBucket = {
            file: () => fakeFileMissingObject,
        };
        const fakeClient = {
            bucket: () => fakeBucket,
        } as unknown as Storage;

        const gcs = new GcsPrivateObjectStorage({
            bucketName: "secret-bucket",
            projectId: "cpe334-514311",
            storageClient: fakeClient,
        });

        expect(gcs.GetAdcConfigSummary()).toEqual({
            driver: "gcs",
            projectId: "cpe334-514311",
            usesApplicationDefaultCredentials: true,
        });

        await expect(
            gcs.PutObject({ storageKey: "k", contentType: "application/pdf", bytes: new Uint8Array([1]) }),
        ).rejects.toSatisfy((error: unknown) =>
            error instanceof PrivateObjectStorageError
            && error.code === "STORAGE_UNAVAILABLE"
            && !error.message.includes("secret-bucket")
            && !error.message.includes("secret-key"),
        );

        await expect(gcs.ReadObjectStream("k")).rejects.toThrowError(
            expect.objectContaining<Partial<PrivateObjectStorageError>>({ code: "OBJECT_NOT_FOUND" }),
        );
        expect(await gcs.HeadObject("k")).toEqual({ exists: false });
        await expect(gcs.DeleteObject("k")).resolves.toBeUndefined();

        fakeFileMissingObject.getMetadata = async () =>
        {
            throw missingBucketError;
        };
        await expect(gcs.ReadObjectStream("k")).rejects.toThrowError(
            expect.objectContaining<Partial<PrivateObjectStorageError>>({ code: "STORAGE_UNAVAILABLE" }),
        );
    });

    it("CreatePrivateObjectStorage creates memory and gcs drivers", () =>
    {
        const mem = CreatePrivateObjectStorage({ ATTACHMENT_STORAGE_DRIVER: "memory" });
        expect(mem).toBeInstanceOf(InMemoryPrivateObjectStorage);

        const gcs = CreatePrivateObjectStorage({
            ATTACHMENT_STORAGE_DRIVER: "gcs",
            GCS_PROJECT_ID: "cpe334-514311",
            GCS_BUCKET_NAME: "test-bucket",
        });
        expect(gcs).toBeInstanceOf(GcsPrivateObjectStorage);

        expect(() =>
            CreatePrivateObjectStorage({ ATTACHMENT_STORAGE_DRIVER: "gcs" }),
        ).toThrow();
    });
});
