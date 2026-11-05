import { afterAll, beforeAll, expect, test } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase } from "../helpers/testDatabase";
import { assertTestDatabaseTarget } from "../../src/Infrastructures/Database/testDatabaseTargetGuard";

const database = createTestDatabase();
beforeAll(async () =>
{
    try
    {
        await database.connection.execute(sql`select 1`);
    }
    catch
    {
        throw new Error("Test PostgreSQL is unavailable. Configure apps/api/.env.test and run npm run db:test:up, or provide the guarded CI database.");
    }
});
afterAll(async () => database.Close());

test("Drizzle connects to workflow_test and executes SELECT 1", async () =>
{
    const rows = await database.connection.execute(sql`select 1 as value, current_database() as database_name`);
    expect(rows[0]).toEqual({ value: 1, database_name: "workflow_test" });
});

test("connection authentication errors reject and release resources", async () =>
{
    const target = new URL(assertTestDatabaseTarget());
    target.username = "missing_infrastructure_test_role";
    target.password = "invalid-test-only-password";
    const invalid = createTestDatabase({ ...process.env, TEST_DATABASE_URL: target.toString() });
    try
    {
        await expect(invalid.connection.execute(sql`select 1`)).rejects.toThrow();
    }
    finally
    {
        await invalid.Close();
    }
});

test("database helper refuses the development target before connecting", () =>
{
    expect(() => createTestDatabase({ NODE_ENV: "test", TEST_DATABASE_URL: "postgresql://127.0.0.1/workflow_dev" })).toThrow("workflow_test");
});
