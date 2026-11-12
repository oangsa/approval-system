import { expect, test } from "vitest";
import { assertProductionInitializationTarget, initializationSchema } from "../../src/Infrastructures/Database/productionInitialization";

const environment = {
    NODE_ENV: "production", PRODUCTION_INIT_ACK: "initialize-minimum-sprint-1",
    PRODUCTION_DB_HOST: "fixture.pooler.supabase.com", PRODUCTION_DB_USER: "postgres.fixture",
    DATABASE_URL: "postgresql://postgres.fixture:fixture@fixture.pooler.supabase.com:5432/postgres?sslmode=verify-full",
};
test("production initializer requires explicit acknowledgment and exact TLS/session database identity", () =>
{
    expect(assertProductionInitializationTarget(environment)).toBe(environment.DATABASE_URL);
    for (const override of [
        { NODE_ENV: "development" }, { PRODUCTION_INIT_ACK: "" }, { PRODUCTION_DB_HOST: "other.pooler.supabase.com" },
        { PRODUCTION_DB_USER: "other" }, { DATABASE_URL: environment.DATABASE_URL.replace("verify-full", "require") },
        { DATABASE_URL: `${environment.DATABASE_URL}&sslmode=disable` },
        { DATABASE_URL: environment.DATABASE_URL.replace(":5432", ":6543") },
        { DATABASE_URL: "postgresql://fixture:private@localhost:5432/workflow_dev" },
    ])
    {
        expect(() => assertProductionInitializationTarget({ ...environment, ...override })).toThrow("target or acknowledgment is invalid");
    }
});
test("initializer rejects duplicate identities and short passwords", () =>
{
    const requester = { email: "requester@example.test", displayName: "Requester", password: "fixture-password-only" };
    expect(initializationSchema.safeParse({ requester, reviewer: requester }).success).toBe(false);
    expect(initializationSchema.safeParse({ requester, reviewer: { ...requester, email: "reviewer@example.test", password: "short" } }).success).toBe(false);
});
