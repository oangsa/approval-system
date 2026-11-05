import { expect, test } from "vitest";
import { assertTestDatabaseTarget } from "../../src/Infrastructures/Database/testDatabaseTargetGuard";

const testUrl = "postgresql://test_user:test_password@127.0.0.1:55432/workflow_test";
const valid = { NODE_ENV: "test", TEST_DATABASE_URL: testUrl, DATABASE_URL: "postgresql://127.0.0.1:5432/workflow_dev" };

test("guard accepts an explicit isolated loopback test target", () =>
{
    expect(assertTestDatabaseTarget(valid)).toBe(testUrl);
});

test.each(["postgres://localhost/workflow_test", "postgresql://[::1]/workflow_test"])("guard accepts canonical local target %s", (url) =>
{
    expect(assertTestDatabaseTarget({ NODE_ENV: "test", TEST_DATABASE_URL: url })).toBe(url);
});

test.each([
    { ...valid, NODE_ENV: undefined },
    { ...valid, NODE_ENV: "development" },
    { ...valid, NODE_ENV: "production" },
    { ...valid, TEST_DATABASE_URL: undefined },
    { ...valid, TEST_DATABASE_URL: "" },
    { ...valid, TEST_DATABASE_URL: "not-a-url" },
    { ...valid, TEST_DATABASE_URL: "https://127.0.0.1/workflow_test" },
    { ...valid, TEST_DATABASE_URL: "postgresql://127.0.0.1/" },
    { ...valid, TEST_DATABASE_URL: "postgresql://127.0.0.1/workflow_dev" },
    { ...valid, TEST_DATABASE_URL: "postgresql://127.0.0.1/workflow_prod" },
    { ...valid, TEST_DATABASE_URL: "postgresql://prod.example.com/workflow_test" },
    { ...valid, TEST_DATABASE_URL: "postgresql://unknown.example.com/workflow_test" },
    { ...valid, TEST_DATABASE_URL: "postgresql://127.0.0.2/workflow_test" },
    { ...valid, TEST_DATABASE_URL: "postgresql://127.0.0.1/workflow_test?host=prod.example.com" },
    { ...valid, TEST_DATABASE_URL: "postgresql://127.0.0.1/workflow_test#ambiguous" },
    { ...valid, TEST_DATABASE_URL: "postgresql://127.0.0.1/workflow_test/extra" },
    { ...valid, TEST_DATABASE_URL: "postgresql://127.0.0.1/workflow%ZZtest" },
    { ...valid, DATABASE_URL: testUrl },
    { ...valid, DATABASE_URL: "postgresql://different_user@localhost:55432/workflow_test" },
    { ...valid, TEST_DATABASE_URL: "postgres://127.0.0.1/workflow_test", DATABASE_URL: "postgresql://localhost:5432/workflow_test" },
    { ...valid, TEST_DATABASE_URL: "postgres://[::1]/workflow_test", DATABASE_URL: "postgresql://localhost/workflow%5Ftest" },
    { ...valid, DATABASE_URL: "ambiguous-baseline" },
    { ...valid, DATABASE_URL: "" },
])("guard rejects unsafe or ambiguous target %#", (environment) =>
{
    expect(() => assertTestDatabaseTarget(environment)).toThrow();
});

test("guard errors never reveal supplied credentials", () =>
{
    const credential = "do-not-echo-this-value";
    try
    {
        assertTestDatabaseTarget({ NODE_ENV: "test", TEST_DATABASE_URL: `postgresql://user:${credential}@production.example/workflow_test` });
        throw new Error("Guard should have rejected the target");
    }
    catch (error)
    {
        expect(error).toBeInstanceOf(Error);
        expect(String(error)).toContain("loopback");
        expect(String(error)).not.toContain(credential);
    }
});

test("guard rejects a driver port override that can invalidate target comparison", () =>
{
    expect(() => assertTestDatabaseTarget({
        NODE_ENV: "test",
        TEST_DATABASE_URL: "postgresql://127.0.0.1/workflow_test",
        DATABASE_URL: "postgresql://127.0.0.1:55432/workflow_test",
        PGPORT: "55432",
    })).toThrow("PGPORT");
});

test("guard rejects encoded test paths that postgres.js treats as a different literal database name", () =>
{
    expect(() => assertTestDatabaseTarget({
        NODE_ENV: "test",
        TEST_DATABASE_URL: "postgresql://127.0.0.1/workflow%5Ftest",
    })).toThrow("workflow_test");
});
