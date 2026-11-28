import {
    PrivateObjectStorageError,
    type IHeadObjectResult,
    type IPrivateObjectStorage,
    type IPutObjectInput,
    type IReadObjectStreamResult,
} from "../../Domains/Requests/AttachmentPorts";

export interface IStoredMemoryObject
{
    contentType: string;
    bytes: Uint8Array;
}

export interface IInMemoryStorageFaultHooks
{
    onPutObject?: (input: IPutObjectInput) => Promise<void> | void;
    onReadObjectStream?: (storageKey: string) => Promise<void> | void;
    onDeleteObject?: (storageKey: string) => Promise<void> | void;
    onHeadObject?: (storageKey: string) => Promise<void> | void;
}

/**
 * Deterministic in-memory IPrivateObjectStorage implementation with optional fault-injection
 * hooks for unit, HTTP API, concurrency, and cleanup-recovery tests.
 */
export class InMemoryPrivateObjectStorage implements IPrivateObjectStorage
{
    public readonly driver = "memory" as const;
    private readonly objects = new Map<string, IStoredMemoryObject>();
    private hooks: IInMemoryStorageFaultHooks;

    constructor(hooks: IInMemoryStorageFaultHooks = {})
    {
        this.hooks = { ...hooks };
    }

    public SetFaultHooks(hooks: IInMemoryStorageFaultHooks): void
    {
        this.hooks = { ...hooks };
    }

    public ClearFaultHooks(): void
    {
        this.hooks = {};
    }

    public Clear(): void
    {
        this.objects.clear();
    }

    public Has(storageKey: string): boolean
    {
        return this.objects.has(storageKey);
    }

    public Size(): number
    {
        return this.objects.size;
    }

    public Keys(): string[]
    {
        return [...this.objects.keys()];
    }

    public GetBytes(storageKey: string): Uint8Array | undefined
    {
        const entry = this.objects.get(storageKey);
        return entry ? new Uint8Array(entry.bytes) : undefined;
    }

    public async PutObject(input: IPutObjectInput): Promise<void>
    {
        if (this.hooks.onPutObject)
        {
            await this.hooks.onPutObject(input);
        }

        this.objects.set(input.storageKey, {
            contentType: input.contentType,
            bytes: new Uint8Array(input.bytes),
        });
    }

    public async ReadObjectStream(storageKey: string): Promise<IReadObjectStreamResult>
    {
        if (this.hooks.onReadObjectStream)
        {
            await this.hooks.onReadObjectStream(storageKey);
        }

        const entry = this.objects.get(storageKey);
        if (!entry)
        {
            throw new PrivateObjectStorageError("OBJECT_NOT_FOUND", "Stored object was not found.");
        }

        const copy = new Uint8Array(entry.bytes);
        const stream = new ReadableStream<Uint8Array>({
            start(controller)
            {
                controller.enqueue(copy);
                controller.close();
            },
        });

        return {
            stream,
            contentLength: copy.byteLength,
        };
    }

    public async DeleteObject(storageKey: string): Promise<void>
    {
        if (this.hooks.onDeleteObject)
        {
            await this.hooks.onDeleteObject(storageKey);
        }

        this.objects.delete(storageKey);
    }

    public async HeadObject(storageKey: string): Promise<IHeadObjectResult>
    {
        if (this.hooks.onHeadObject)
        {
            await this.hooks.onHeadObject(storageKey);
        }

        const entry = this.objects.get(storageKey);
        if (!entry)
        {
            return { exists: false };
        }

        return {
            exists: true,
            sizeBytes: entry.bytes.byteLength,
            contentType: entry.contentType,
        };
    }
}
