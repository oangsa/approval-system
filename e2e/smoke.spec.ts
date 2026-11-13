import { expect, test } from "@playwright/test";
import { healthResponseSchema } from "@workflow/contracts";
import { apiUrl, webUrl } from "./helpers/environment";

test("landing content is present in public server-rendered HTML", async ({ request }) =>
{
    const response = await request.get("/");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
    const html = await response.text();
    expect(html).toMatch(/<h1[^>]*id="landing-title"[^>]*>Keep every request moving\.<\/h1>/);
    expect(html).toContain("Illustrative example");
    expect(html).toContain('href="/auth/login"');
    expect(html).not.toContain("Lab 5 release");
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }])
{
    test(`landing renders and hydrates without errors or overflow at ${viewport.width}px`, async ({ page }) =>
    {
        const errors: string[] = [];
        const apiRequests: string[] = [];
        page.on("request", (request) =>
        {
            if (request.url().startsWith(apiUrl.origin)) apiRequests.push(request.url());
        });
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
        await page.emulateMedia({ reducedMotion: "reduce" });
        const response = await page.goto("/");
        expect(response?.status()).toBe(200);
        await expect(page.getByRole("heading", { level: 1, name: "Keep every request moving." })).toBeVisible();
        await expect(page.getByRole("figure")).toContainText("Illustrative example");
        await expect(page).toHaveTitle("Workflow and Approval System");
        await page.waitForFunction(() => (window as typeof window & { foundationHydrated?: boolean }).foundationHydrated === true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        expect(errors).toEqual([]);
        expect(apiRequests).toEqual([]);
        await page.screenshot({ path: `artifacts/playwright/landing-${viewport.width}.png`, fullPage: true, animations: "disabled" });
        await page.keyboard.press("Tab");
        await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(page.getByRole("main")).toBeFocused();
        await page.getByRole("link", { name: "See how it works" }).click();
        await expect(page).toHaveURL(/#how-it-works$/);
        await expect(page.getByRole("heading", { name: "Less chasing. More clarity." })).toBeInViewport();
        await page.getByRole("navigation").getByRole("link", { name: "Sign in", exact: true }).click();
        await expect(page).toHaveURL(/\/auth\/login$/);
        await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
    });
}

test("public overview and sign-in remain usable without JavaScript", async ({ browser }) =>
{
    const context = await browser.newContext({ javaScriptEnabled: false });
    try
    {
        const page = await context.newPage();
        await page.goto(webUrl.origin);
        await expect(page.getByRole("heading", { level: 1, name: "Keep every request moving." })).toBeVisible();
        await page.getByRole("link", { name: "See how it works" }).click();
        await expect(page.getByRole("heading", { name: "Less chasing. More clarity." })).toBeInViewport();
        await page.getByRole("link", { name: "Sign in to workspace" }).click();
        await expect(page).toHaveURL(/\/auth\/login$/);
    }
    finally
    {
        await context.close();
    }
});

test("API health endpoint responds through the real Node listener", async ({ request }) =>
{
    const response = await request.get(`${apiUrl.origin}/health`);
    expect(response.status()).toBe(200);
    expect(healthResponseSchema.parse(await response.json())).toEqual({ status: "ok" });
});
