import type { IPrivateObjectStorage } from "../../Domains/Requests/AttachmentPorts";
import { GcsPrivateObjectStorage } from "./GcsPrivateObjectStorage";
import { InMemoryPrivateObjectStorage } from "./InMemoryPrivateObjectStorage";

export { GcsPrivateObjectStorage, type IGcsPrivateObjectStorageOptions } from "./GcsPrivateObjectStorage";
export {
    InMemoryPrivateObjectStorage,
    type IInMemoryStorageFaultHooks,
    type IStoredMemoryObject,
} from "./InMemoryPrivateObjectStorage";

export interface IPrivateObjectStorageFactoryConfig
{
    ATTACHMENT_STORAGE_DRIVER: "memory" | "gcs";
    GCS_PROJECT_ID?: string;
    GCS_BUCKET_NAME?: string;
}

export function CreatePrivateObjectStorage(config: IPrivateObjectStorageFactoryConfig): IPrivateObjectStorage
{
    if (config.ATTACHMENT_STORAGE_DRIVER === "gcs")
    {
        if (!config.GCS_BUCKET_NAME)
        {
            throw new Error("GCS_BUCKET_NAME is required when ATTACHMENT_STORAGE_DRIVER is gcs.");
        }
        return new GcsPrivateObjectStorage({
            bucketName: config.GCS_BUCKET_NAME,
            projectId: config.GCS_PROJECT_ID,
        });
    }

    return new InMemoryPrivateObjectStorage();
}
