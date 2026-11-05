import { afterEach, expect, test, vi } from "vitest";
import { healthResponseSchema } from "@workflow/contracts";
import { createApplication } from "../../src/Presentations/createApplication";

afterEach(() => vi.restoreAllMocks());

test("application initializes without binding a listener", () =>
{
    const app = createApplication();
    expect(app.server).toBeNull();
});

test("health endpoint returns the shared successful response", async () =>
{
    const app = createApplication();
    const response = await app.handle(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(healthResponseSchema.parse(await response.json())).toEqual({ status: "ok" });
});

test("unknown routes return the centralized error", async () =>
{
    const response = await createApplication().handle(new Request("http://localhost/missing"));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ message: "Not found" });
});

test("unexpected errors do not expose secrets or stack traces", async () =>
{
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Test-only throwing route exercises the real global handler; never registered in production.
    const app = createApplication().get("/test-error", () =>
    {
        throw new Error("sensitive-infrastructure-value");
    });
    const response = await app.handle(new Request("http://localhost/test-error"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ message: "Internal server error" });
    expect(log).toHaveBeenCalledOnce();
});
