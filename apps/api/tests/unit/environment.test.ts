import { expect, test } from "vitest";
import { readDatabaseUrl, readEnvironment } from "../../src/Infrastructures/Configuration/environment";

const valid = { DATABASE_URL: "postgresql://127.0.0.1/workflow_dev", NODE_ENV: "development", AUTH_JWT_SECRET: "x".repeat(32), AUTH_JWT_ISSUER: "workflow-approval-api", AUTH_JWT_AUDIENCE: "workflow-approval-web", AUTH_ALLOWED_ORIGINS: "http://localhost:3000, https://example.test", AUTH_COOKIE_SECURE: "false" };

test("environment applies safe defaults and normalizes origins", () =>
{
    expect(readEnvironment(valid)).toMatchObject({ HOST: "127.0.0.1", PORT: 3001, AUTH_ALLOWED_ORIGINS: ["http://localhost:3000", "https://example.test"], AUTH_COOKIE_SECURE: false });
    expect(readDatabaseUrl(valid)).toBe(valid.DATABASE_URL);
});

test.each([
    {}, { ...valid, DATABASE_URL: "https://example.test" }, { ...valid, PORT: "0" }, { ...valid, HOST: "" },
    { ...valid, AUTH_JWT_SECRET: "short" }, { ...valid, AUTH_JWT_ISSUER: "" }, { ...valid, AUTH_JWT_AUDIENCE: "" },
    { ...valid, AUTH_ALLOWED_ORIGINS: "*" }, { ...valid, AUTH_ALLOWED_ORIGINS: "https://example.test/path" },
    { ...valid, AUTH_ALLOWED_ORIGINS: "http://user@example.test" }, { ...valid, AUTH_ALLOWED_ORIGINS: "" },
    { ...valid, AUTH_COOKIE_SECURE: "yes" }, { ...valid, NODE_ENV: "production" }, { ...valid, NODE_ENV: "invalid" },
])("environment rejects invalid configuration %#", (environment) =>
{
    expect(() => readEnvironment(environment)).toThrow();
});

test("database tooling requires no authentication settings", () =>
{
    const databaseOnly = { DATABASE_URL: "postgresql://127.0.0.1/workflow_dev" };
    expect(readDatabaseUrl(databaseOnly)).toBe(databaseOnly.DATABASE_URL);
    expect(() => readEnvironment(databaseOnly)).toThrow();
});