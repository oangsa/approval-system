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
        if (/^\/api\/v1\/requests\/[^/]+\/(revisions|comments|attachments|history|discussion|files)(\/|$)/.test(pathname) || /^\/api\/v1\/attachments\/[^/]+\/download$/.test(pathname)) futureCalls.push(outgoing.url());
    });
    await signIn(page, "requester-a@example.test");
    await page.goto("/requests");
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
    const filters = page.getByRole("button", { name: /^Filters/ });
    await filters.click();
    const filterDialog = page.getByRole("dialog", { name: "Advanced filters" });
    await page.screenshot({ path: "artifacts/playwright/request-filters-desktop.png", fullPage: true, animations: "disabled" });
    await filterDialog.getByLabel("Priority", { exact: true }).selectOption("URGENT");
    await filterDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(row).toBeVisible();
    await filters.click();
    await expect(filterDialog.getByLabel("Priority", { exact: true })).toHaveValue("");
    await filterDialog.getByLabel("Created from", { exact: true }).fill("2026-11-10");
    await filterDialog.getByLabel("Created through", { exact: true }).fill("2026-11-01");
    await filterDialog.getByRole("button", { name: "Apply filters" }).click();
    await expect(filterDialog.getByRole("alert")).toContainText("Created date range");
    await expect(filterDialog.getByLabel("Created from", { exact: true })).toBeFocused();
    await expect(filterDialog.getByLabel("Created from", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(filterDialog.getByLabel("Created through", { exact: true })).toHaveAccessibleDescription("Created date range: start must be on or before its end.");
    await filterDialog.getByLabel("Status", { exact: true }).selectOption("PENDING");
    await filterDialog.getByLabel("Created from", { exact: true }).fill("2000-01-01");
    await filterDialog.getByLabel("Created through", { exact: true }).fill("2099-12-31");
    await filterDialog.getByRole("button", { name: "Request type All request types" }).click();
    await filterDialog.getByRole("button", { name: "General request (GENERAL)" }).click();
    const searchResponse = page.waitForResponse((response) => response.url().endsWith("/v1/requests/search") && response.request().method() === "POST");
    await filterDialog.getByRole("button", { name: "Apply filters" }).click();
    const filteredResponse = await searchResponse;
    expect(filteredResponse.status()).toBe(200);
    expect(filteredResponse.request().postDataJSON().search).toEqual([
        { name: "status", condition: "EQUAL", value: "PENDING" },
        { name: "typeId", condition: "EQUAL", value: expect.any(String) },
        { name: "createdAt", condition: "GREATEROREQUAL", value: "1999-12-31T17:00:00.000Z" },
        { name: "createdAt", condition: "LESSER", value: "2099-12-31T17:00:00.000Z" },
    ]);
    await expect(row).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Request type: General request (GENERAL)" })).toBeVisible();
    await filters.click();
    await expect(filterDialog.getByRole("button", { name: "Request type General request (GENERAL)" })).toBeVisible();
    await filterDialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.reload();
    await expect(row).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Request type: General request (GENERAL)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove Status is Pending approval" })).toBeVisible();
    await filters.click();
    await filterDialog.getByRole("button", { name: "Reset filters" }).click();
    await page.keyboard.press("Escape");
    await expect(filterDialog).not.toBeVisible();
    await expect(filters).toBeFocused();
    await expect(page.getByRole("button", { name: "Remove Status is Pending approval" })).toBeVisible();
    await page.getByLabel("Rows per page").selectOption("10");
    await expect(page).toHaveURL(/pageSize=10/);
    await expect(row).toBeVisible();
    await page.goBack();
    await expect(page.getByLabel("Rows per page")).toHaveValue("20");
    await expect(row).toBeVisible();
    await page.getByRole("button", { name: "Remove Status is Pending approval" }).click();
    await expect(page.getByRole("button", { name: /^Remove Created:/ })).toBeVisible();
    await expect(row).toBeVisible();
    const titleSort = page.getByRole("columnheader", { name: "Request", exact: true }).getByRole("button");
    await titleSort.focus();
    await page.keyboard.press("Enter");
    await expect(row).toBeVisible();
    await expect(titleSort).toBeFocused();
    await expect(page.getByRole("columnheader", { name: "Request", exact: true })).toHaveAttribute("aria-sort", "ascending");
    await page.screenshot({ path: "artifacts/playwright/request-list-desktop.png", fullPage: true, animations: "disabled" });
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
        if (name === "History") await expect(page.getByRole("tabpanel")).toContainText("REQUEST SUBMITTED");
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
    await page.screenshot({ path: "artifacts/playwright/request-list-mobile.png", fullPage: true, animations: "disabled" });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: /^Filters/ }).click();
    const mobileFilters = page.getByRole("dialog", { name: "Advanced filters" });
    await expect(mobileFilters).toBeVisible();
    expect(await mobileFilters.evaluate((element) => element.matches(":modal"))).toBe(true);
    for (let index = 0; index < 6; index++)
    {
        await page.keyboard.press("Shift+Tab");
        expect(await mobileFilters.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.setViewportSize({ width: 320, height: 844 });
    expect(await mobileFilters.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    await mobileFilters.getByLabel("Created from", { exact: true }).fill("2026-11-10");
    await mobileFilters.getByLabel("Created through", { exact: true }).fill("2026-11-01");
    await mobileFilters.getByRole("button", { name: "Apply filters" }).click();
    await expect(mobileFilters.getByLabel("Created from", { exact: true })).toBeFocused();
    const invalidBounds = await mobileFilters.getByLabel("Created from", { exact: true }).boundingBox();
    const applyBounds = await mobileFilters.getByRole("button", { name: "Apply filters" }).boundingBox();
    expect(invalidBounds!.y + invalidBounds!.height).toBeLessThan(applyBounds!.y);
    await page.screenshot({ path: "artifacts/playwright/request-filters-320-validation.png", fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "artifacts/playwright/request-filters-mobile.png", fullPage: true, animations: "disabled" });
    await page.keyboard.press("Escape");
    await expect(mobileFilters).not.toBeVisible();
    await expect(page.getByRole("button", { name: /^Filters/ })).toBeFocused();
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
