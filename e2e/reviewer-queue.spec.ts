import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string)
{
    await page.goto("/auth/login");
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Test-password-42!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
}
test("assigned reviewer opens submitted request on desktop and mobile", async ({ page }) =>
{
    const title = `Reviewer queue ${Date.now()}${"x".repeat(80)}`;
    await login(page, "requester-a@example.test");
    await page.goto("/requests");
    await page.getByRole("link", { name: "New request" }).click();
    await page.getByLabel("Request type (required)").selectOption({ label: "General request" });
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Title", { exact: false }).fill(title);
    await page.getByLabel("Justification", { exact: false }).fill("Synthetic queue test");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Category", { exact: false }).selectOption("OPERATIONS");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Submit request", exact: true }).click();
    await page.getByRole("button", { name: "Confirm submission" }).click();
    await expect(page.getByRole("heading", { name: "Request submitted" })).toBeVisible();
    await page.getByRole("button", { name: "Requester A", exact: true }).click();
    await page.getByRole("region", { name: "Account details" }).getByRole("button", { name: "Sign out", exact: true }).click();
    await login(page, "reviewer@example.test");
    await page.getByRole("link", { name: "My Reviews" }).click();
    await page.getByLabel("Search requests").fill(title);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    const row = page.getByRole("row").filter({ hasText: title });
    await expect(row).toBeVisible();
    const taskHref = await row.getByRole("link").getAttribute("href");
    await row.getByRole("link").click();
    await expect(page.getByRole("heading", { name: "Review task" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Request result" })).toContainText(title);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/reviews");
    await page.getByLabel("Search requests").fill(title);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: title })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Reviewer", exact: true }).click();
    await page.getByRole("region", { name: "Account details" }).getByRole("button", { name: "Sign out", exact: true }).click();
    await login(page, "requester-b@example.test");
    await page.goto(taskHref!);
    await expect(page.getByRole("alert")).toContainText("unavailable");
    await expect(page.locator("body")).not.toContainText(title);
});
test("private review content is absent from SSR", async ({ request }) =>
{
    const response = await request.get("/reviews");
    expect(response.ok()).toBe(true);
    expect(await response.text()).not.toContain("Reviewer queue ");
});

test("review filters restore URL state, chips, page size and mobile layout", async ({ page }) =>
{
    await login(page, "reviewer@example.test");
    await page.goto("/reviews?stage=2&dueFrom=2026-11-01&dueTo=2026-11-02&pageSize=50&sort=dueAt%20desc");
    await expect(page.getByLabel("Due from (Bangkok)")).toHaveValue("2026-11-01");
    await expect(page.getByLabel("Rows per page")).toHaveValue("50");
    const response = page.waitForResponse((result) => result.url().endsWith("/approval-tasks/search") && result.request().postDataJSON().pageSize === 10);
    await page.getByLabel("Rows per page").selectOption("10");
    const result = await response;
    expect(result.status()).toBe(200);
    expect(result.request().postDataJSON()).toMatchObject({ pageNumber: 1, pageSize: 10, search: [
        { name: "stageNumber", condition: "EQUAL", value: 2 },
        { name: "dueAt", condition: "GREATEROREQUAL", value: "2026-10-31T17:00:00.000Z" },
        { name: "dueAt", condition: "LESSER", value: "2026-11-02T17:00:00.000Z" },
    ] });
    expect(Array.isArray(await result.json())).toBe(true);
    expect(JSON.parse(result.headers()["x-pagination"]!)).toMatchObject({ pageSize: 10 });
    await page.getByRole("button", { name: "Remove Due from: 2026-11-01" }).click();
    await expect(page).not.toHaveURL(/dueFrom=/);
    await page.goBack();
    await expect(page.getByLabel("Due from (Bangkok)")).toHaveValue("2026-11-01");
    await page.goForward();
    await expect(page.getByLabel("Due from (Bangkok)")).toHaveValue("");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel("Rows per page")).toHaveValue("10");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "/tmp/issue12-review-mobile.png", fullPage: true });
    await page.goto("/reviews?pageSize=999&sort=private.path");
    await expect(page.getByRole("alert")).toContainText("Choose 10, 20, 50 or 100");
    await page.getByRole("button", { name: "Reset filters" }).click();
    await expect(page.getByLabel("Rows per page")).toHaveValue("20");
});
