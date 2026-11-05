import { expect, test } from "vitest";
import { readEnvironment } from "../../src/Infrastructures/Configuration/environment";

const valid = { DATABASE_URL: "postgresql://127.0.0.1/workflow_dev" };

test("environment applies safe local listener defaults", () =>
{
    expect(readEnvironment(valid)).toEqual({ ...valid, HOST: "127.0.0.1", PORT: 3001 });
});

test.each([
    {},
    { DATABASE_URL: "not-a-url" },
    { DATABASE_URL: "https://example.com/workflow_dev" },
    { ...valid, PORT: "0" },
    { ...valid, PORT: "65536" },
    { ...valid, PORT: "invalid" },
    { ...valid, HOST: "" },
])("environment rejects invalid configuration %j", (environment) =>
{
    expect(() => readEnvironment(environment)).toThrow();
});
