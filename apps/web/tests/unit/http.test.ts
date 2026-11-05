import { http as mockHttp, HttpResponse } from "msw";
import { expect, test, vi } from "vitest";
import { healthResponseSchema } from "@workflow/contracts";
import { http } from "../../app/api/http";
import { server } from "../helpers/server";

const endpoint = "http://localhost/api/health";

test("transport resolves the configured base URL and sends cookies", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    server.use(mockHttp.get(endpoint, ({ request }) =>
    {
        expect(request.credentials).toBe("include");
        return HttpResponse.json({ status: "ok" });
    }));
    expect(healthResponseSchema.parse(await http("/health"))).toEqual({ status: "ok" });
});

test("transport rejects HTTP errors", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    server.use(mockHttp.get(endpoint, () => new HttpResponse(null, { status: 503 })));
    await expect(http("/health")).rejects.toThrow("Request failed (503)");
});

test("transport accepts an empty successful response", async () =>
{
    vi.stubEnv("VITE_API_BASE_URL", "http://localhost/api");
    server.use(mockHttp.get(endpoint, () => new HttpResponse(null, { status: 204 })));
    await expect(http("/health")).resolves.toBeUndefined();
});
