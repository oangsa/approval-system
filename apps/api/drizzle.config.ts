import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "drizzle-kit";
import { assertTestDatabaseTarget } from "./src/Infrastructures/Database/testDatabaseTargetGuard";
import { readEnvironment } from "./src/Infrastructures/Configuration/environment";

if (existsSync(".env"))
{
    loadEnvFile(".env");
}

export default defineConfig({
    dialect: "postgresql",
    schema: "./src/Infrastructures/Database/schema.ts",
    out: "./src/Infrastructures/Database/migrations",
    dbCredentials: { url: process.env.NODE_ENV === "test" ? assertTestDatabaseTarget() : readEnvironment().DATABASE_URL },
    strict: true,
});
