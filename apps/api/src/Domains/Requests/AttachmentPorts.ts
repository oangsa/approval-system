export type PrivateObjectStorageErrorCode = "OBJECT_NOT_FOUND" | "STORAGE_UNAVAILABLE";

export class PrivateObjectStorageError extends Error
{
    constructor(public readonly code: PrivateObjectStorageErrorCode, message?: string)
    {
        super(message ?? code);
        this.name = "PrivateObjectStorageError";
    }
}

export interface IPutObjectInput
{
    storageKey: string;
    contentType: string;
    bytes: Uint8Array;
}

export interface IReadObjectStreamResult
{
    stream: ReadableStream<Uint8Array>;
    contentLength?: number;
}

export interface IHeadObjectResult
{
    exists: boolean;
    sizeBytes?: number;
    contentType?: string;
}

export interface IPrivateObjectStorage
{
    PutObject(input: IPutObjectInput): Promise<void>;
    ReadObjectStream(storageKey: string): Promise<IReadObjectStreamResult>;
    DeleteObject(storageKey: string): Promise<void>;
    HeadObject(storageKey: string): Promise<IHeadObjectResult>;
}
