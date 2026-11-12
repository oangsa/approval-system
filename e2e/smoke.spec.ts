import { expect, test } from "@playwright/test";
import { healthResponseSchema } from "@workflow/contracts";
import { apiUrl } from "./helpers/environment";

test("starter heading is present in the server-rendered HTML", async ({ request }) =>
{
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
    expect(await response.text()).toMatch(/<h1[^>]*>Workflow and Approval System<\/h1>/);
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }])
{
    test(`starter renders and hydrates without errors or overflow at ${viewport.width}px`, async ({ page }) =>
    {
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) =>
        {
            if (message.type() === "error")
            {
                errors.push(message.text());
            }
        });
        // Observe a real React commit through its DevTools hook, without adding test markers to application code.
        await page.addInitScript(() =>
        {
            const browser = window as typeof window & {
                foundationHydrated?: boolean;
                __REACT_DEVTOOLS_GLOBAL_HOOK__?: unknown;
            };
            browser.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
                supportsFiber: true,
                inject: () => 1,
                onCommitFiberRoot: () =>
                {
                    browser.foundationHydrated = true;
                },
            };
        });
        await page.setViewportSize(viewport);
        const response = await page.goto("/");
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1, name: "Workflow and Approval System" })).toBeVisible();
        await expect(page.getByRole("main")).toContainText("Lab 5 release · Sprint 1 approval workflow");
        await expect(page).toHaveTitle("Workflow and Approval System");
        await page.waitForFunction(() => (window as typeof window & { foundationHydrated?: boolean }).foundationHydrated === true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        expect(errors).toEqual([]);
    });
}

test("API health endpoint responds through the real Node listener", async ({ request }) =>
{
    const response = await request.get(`${apiUrl.origin}/health`);
    expect(response.status()).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({ status: "ok" });
});
