import { Storage, type Bucket } from "@google-cloud/storage";
import {
    PrivateObjectStorageError,
    type IHeadObjectResult,
    type IPrivateObjectStorage,
    type IPutObjectInput,
    type IReadObjectStreamResult,
} from "../../Domains/Requests/AttachmentPorts";

export interface IGcsPrivateObjectStorageOptions
{
    bucketName: string;
    projectId?: string;
    storageClient?: Storage;
}

interface IGcsErrorLike
{
    code?: unknown;
    status?: unknown;
    message?: unknown;
    response?: { status?: unknown };
    errors?: Array<{ reason?: unknown; message?: unknown }>;
}

function isObjectNotFoundError(error: unknown): boolean
{
    if (!error || typeof error !== "object")
    {
        return false;
    }

    const candidate = error as IGcsErrorLike;
    const status = candidate.code ?? candidate.status ?? candidate.response?.status;
    if (status !== 404 && status !== "404")
    {
        return false;
    }

    const messages: string[] = [];
    if (typeof candidate.message === "string")
    {
        messages.push(candidate.message.toLowerCase());
    }
    if (Array.isArray(candidate.errors))
    {
        for (const item of candidate.errors)
        {
            if (typeof item?.message === "string")
            {
                messages.push(item.message.toLowerCase());
            }
        }
    }

    const combined = messages.join(" ");
    if (
        combined.includes("the specified bucket does not exist")
        || combined.includes("no such bucket")
        || combined.includes("bucket does not exist")
        || combined.includes("bucket not found")
    )
    {
        return false;
    }
    return true;
}

/**
 * Google Cloud Storage adapter for private request attachments.
 * Uses Application Default Credentials (ADC) exclusively without static JSON keys.
 */
export class GcsPrivateObjectStorage implements IPrivateObjectStorage
{
    public readonly driver = "gcs" as const;
    public readonly usesApplicationDefaultCredentials = true;
    private readonly bucketName: string;
    private readonly projectId?: string;
    private readonly bucket: Bucket;

    constructor(options: IGcsPrivateObjectStorageOptions)
    {
        const trimmedBucket = options.bucketName.trim();
        if (!trimmedBucket)
        {
            throw new Error("GCS bucket name must not be empty.");
        }

        this.bucketName = trimmedBucket;
        this.projectId = options.projectId?.trim() || undefined;
        const storage = options.storageClient ?? new Storage(this.projectId ? { projectId: this.projectId } : undefined);
        this.bucket = storage.bucket(this.bucketName);
    }

    public GetAdcConfigSummary(): { driver: "gcs"; projectId?: string; usesApplicationDefaultCredentials: true }
    {
        return {
            driver: this.driver,
            ...(this.projectId ? { projectId: this.projectId } : {}),
            usesApplicationDefaultCredentials: this.usesApplicationDefaultCredentials,
        };
    }

    public async PutObject(input: IPutObjectInput): Promise<void>
    {
        try
        {
            const file = this.bucket.file(input.storageKey);
            await file.save(Buffer.from(input.bytes), {
                resumable: false,
                contentType: input.contentType,
                metadata: {
                    contentType: input.contentType,
                },
            });
        }
        catch
        {
            throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE", "Private object storage is unavailable.");
        }
    }

    public async ReadObjectStream(storageKey: string): Promise<IReadObjectStreamResult>
    {
        const file = this.bucket.file(storageKey);
        let contentLength: number | undefined;
        try
        {
            const [metadata] = await file.getMetadata();
            if (metadata.size !== undefined)
            {
                const parsedSize = Number(metadata.size);
                if (Number.isFinite(parsedSize) && parsedSize >= 0)
                {
                    contentLength = parsedSize;
                }
            }
        }
        catch (error)
        {
            if (isObjectNotFoundError(error))
            {
                throw new PrivateObjectStorageError("OBJECT_NOT_FOUND", "Stored object was not found.");
            }
            throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE", "Private object storage is unavailable.");
        }

        const nodeStream = file.createReadStream({ validation: "crc32c" });
        const stream = new ReadableStream<Uint8Array>({
            start(controller)
            {
                nodeStream.on("data", (chunk: Uint8Array) =>
                {
                    controller.enqueue(chunk instanceof Uint8Array ? new Uint8Array(chunk) : new Uint8Array(Buffer.from(chunk)));
                    if ((controller.desiredSize ?? 1) <= 0)
                    {
                        nodeStream.pause();
                    }
                });
                nodeStream.once("end", () =>
                {
                    controller.close();
                });
                nodeStream.once("error", (streamError) =>
                {
                    controller.error(
                        isObjectNotFoundError(streamError)
                            ? new PrivateObjectStorageError("OBJECT_NOT_FOUND", "Stored object was not found.")
                            : new PrivateObjectStorageError("STORAGE_UNAVAILABLE", "Private object storage is unavailable."),
                    );
                });
            },
            pull()
            {
                nodeStream.resume();
            },
            cancel()
            {
                nodeStream.destroy();
            },
        });

        return {
            stream,
            ...(contentLength !== undefined ? { contentLength } : {}),
        };
    }

    public async DeleteObject(storageKey: string): Promise<void>
    {
        try
        {
            await this.bucket.file(storageKey).delete({ ignoreNotFound: true });
        }
        catch (error)
        {
            if (isObjectNotFoundError(error))
            {
                return;
            }
            throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE", "Private object storage is unavailable.");
        }
    }

    public async HeadObject(storageKey: string): Promise<IHeadObjectResult>
    {
        try
        {
            const [metadata] = await this.bucket.file(storageKey).getMetadata();
            const parsedSize = metadata.size !== undefined ? Number(metadata.size) : undefined;
            return {
                exists: true,
                ...(parsedSize !== undefined && Number.isFinite(parsedSize) && parsedSize >= 0 ? { sizeBytes: parsedSize } : {}),
                ...(typeof metadata.contentType === "string" ? { contentType: metadata.contentType } : {}),
            };
        }
        catch (error)
        {
            if (isObjectNotFoundError(error))
            {
                return { exists: false };
            }
            throw new PrivateObjectStorageError("STORAGE_UNAVAILABLE", "Private object storage is unavailable.");
        }
    }
}
