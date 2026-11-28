import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
    root: fileURLToPath(new URL(".", import.meta.url)),
    test: {
        name: "gcs",
        environment: "node",
        include: ["tests/gcs/**/*.test.ts"],
        fileParallelism: false,
        testTimeout: 30000,
        hookTimeout: 30000,
    },
});
