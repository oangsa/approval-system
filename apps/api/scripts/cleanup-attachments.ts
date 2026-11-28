import { z } from "zod";
import { AttachmentCleanupWorker } from "../src/Applications/Requests/AttachmentCleanupWorker";
import { readDatabaseUrl } from "../src/Infrastructures/Configuration/environment";
import { Database } from "../src/Infrastructures/Database/Database";
import { AttachmentCleanupRepository } from "../src/Infrastructures/Database/Repositories/AttachmentCleanupRepository";
import { CreatePrivateObjectStorage } from "../src/Infrastructures/Storage";

const cleanupStorageEnvSchema = z.object({
    ATTACHMENT_STORAGE_DRIVER: z.enum(["memory", "gcs"]).default("memory"),
    GCS_PROJECT_ID: z.string().trim().min(1).optional(),
    GCS_BUCKET_NAME: z.string().trim().min(1).optional(),
})
    .refine(
        (value) => value.ATTACHMENT_STORAGE_DRIVER !== "gcs" || Boolean(value.GCS_BUCKET_NAME),
        { path: ["GCS_BUCKET_NAME"], message: "GCS_BUCKET_NAME is required when ATTACHMENT_STORAGE_DRIVER is gcs" },
    );

async function main(): Promise<void>
{
    const databaseUrl = readDatabaseUrl(process.env);
    const storageConfig = cleanupStorageEnvSchema.parse(process.env);
    const database = new Database(databaseUrl);

    try
    {
        const storage = CreatePrivateObjectStorage(storageConfig);
        const repository = new AttachmentCleanupRepository(database.connection);
        const worker = new AttachmentCleanupWorker(repository, storage);
        const summary = await worker.RunOnce();
        console.info(JSON.stringify({ code: "ATTACHMENT_CLEANUP_COMPLETED", ...summary }));
    }
    finally
    {
        await database.Close();
    }
}

main().catch(() =>
{
    console.error(JSON.stringify({ code: "ATTACHMENT_CLEANUP_FAILED" }));
    process.exitCode = 1;
});
