import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page, email: string)
{
    await page.goto("/auth/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Test-password-42!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
}

test("REQ-E2E-01 and REQ-E2E-02: requester list and persisted detail", async ({ page, request }) =>
{
    const title = `Browserlistdetail${Date.now()}unbrokentitleverificationpayloadwithoutanyspacecharactersanywhereinthisunbrokenrequesttitlestring`;
    expect(title.length).toBeGreaterThanOrEqual(120);
    expect(title.length).toBeLessThanOrEqual(200);
    expect(title).not.toContain(" ");
    const searchTerm = title.slice(0, 90);
    const futureCalls: string[] = [];
    page.on("request", (outgoing) =>
    {
        const pathname = new URL(outgoing.url()).pathname;
        if (/^\/api\/v1\/requests\/[^/]+\/(timeline|revisions|comments|attachments|history|discussion|files)(\/|$)/.test(pathname) || /^\/api\/v1\/attachments\/[^/]+\/download$/.test(pathname)) futureCalls.push(outgoing.url());
    });
    await signIn(page, "requester-a@example.test");
    await page.getByRole("link", { name: "New request" }).click();
    await page.getByLabel("Request type (required)", { exact: true }).selectOption({ label: "General request" });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Title", { exact: false }).fill(title);
    await page.getByLabel("Justification", { exact: false }).fill("Browser list and detail verification");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Category", { exact: false }).selectOption("OPERATIONS");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Submit request", exact: true }).click();
    await page.getByRole("button", { name: "Confirm submission" }).click();
    const result = page.getByRole("region", { name: "Request result" });
    await expect(result).toContainText("Pending approval");
    const number = (await result.innerText()).match(/REQ-\d{8,}/)?.[0];
    expect(number).toBeDefined();

    await page.getByRole("link", { name: "My Requests" }).click();
    await page.getByLabel("Search", { exact: true }).fill(searchTerm);
    const row = page.getByRole("row").filter({ hasText: title });
    await expect(row).toContainText(number!);
    await expect(row).toContainText("Pending approval");
    await expect(page.getByText(/1 results/)).toBeVisible();
    await row.getByRole("link", { name: title }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    const detailUrl = page.url();
    expect(new URL(detailUrl).pathname).toMatch(/^\/requests\/[0-9a-f-]{36}$/);
    await expect(page.getByText(number!, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/Requester: Requester A/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect(page.getByRole("region", { name: "Request result" })).toContainText(number!);
    await expect(page.getByRole("region", { name: "Request result" })).toContainText("Pending approval");
    expect(futureCalls).toEqual([]);

    const overview = page.getByRole("tab", { name: "Overview" });
    await overview.focus();
    for (const name of ["Approval", "History", "Discussion / Files"])
    {
        await page.keyboard.press("ArrowRight");
        const tab = page.getByRole("tab", { name, exact: true });
        await expect(tab).toBeFocused();
        await expect(tab).toHaveAttribute("aria-selected", "true");
        await expect(page.getByRole("tabpanel")).toBeVisible();
    }
    await page.keyboard.press("Home");
    await expect(overview).toBeFocused();
    expect(futureCalls).toEqual([]);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

    for (const path of ["/requests", new URL(detailUrl).pathname])
    {
        const response = await request.get(path);
        expect(response.ok()).toBe(true);
        const html = await response.text();
        expect(html).not.toContain(title);
        expect(html).not.toContain(number!);
        expect(html).not.toContain("requester-a@example.test");
    }

    await page.goto("/requests");
    await page.getByLabel("Search", { exact: true }).fill(searchTerm);
    await page.setViewportSize({ width: 390, height: 844 });
    const card = page.getByRole("listitem").filter({ hasText: title });
    await expect(card).toContainText(number!);
    await expect(card).toContainText("Pending approval");
    await expect(card.getByRole("link", { name: title })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await card.getByRole("link", { name: title }).click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(futureCalls).toEqual([]);

    await page.setViewportSize({ width: 1280, height: 720 });
    await page.getByRole("button", { name: "Requester A" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await signIn(page, "requester-b@example.test");
    await page.goto("/requests");
    await page.getByLabel("Search", { exact: true }).fill(searchTerm);
    await expect(page.getByText("No requests match your filters.")).toBeVisible();
    await expect(page.getByText(title)).toHaveCount(0);
    await page.goto(detailUrl);
    await expect(page.getByRole("alert")).toContainText("This request is unavailable.");
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
    await expect(page.getByText(title)).toHaveCount(0);
    expect(futureCalls).toEqual([]);
});
