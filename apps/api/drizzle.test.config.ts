import { defineConfig } from "drizzle-kit";
import { loadTestEnvironment } from "./tests/helpers/testEnvironment";
import { assertTestDatabaseTarget } from "./src/Infrastructures/Database/testDatabaseTargetGuard";

loadTestEnvironment();

export default defineConfig({
    dialect: "postgresql",
    schema: "./src/Infrastructures/Database/schema.ts",
    out: "./src/Infrastructures/Database/migrations",
    dbCredentials: { url: assertTestDatabaseTarget() },
    strict: true,
});
