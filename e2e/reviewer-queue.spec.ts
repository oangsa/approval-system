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
    const title = `Reviewer queue ${Date.now()}`;
    await login(page, "requester-a@example.test");
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
