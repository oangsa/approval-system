import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

export function loadTestEnvironment(): void
{
    const path = fileURLToPath(new URL("../../.env.test", import.meta.url));
    if (existsSync(path))
    {
        loadEnvFile(path);
    }
}
