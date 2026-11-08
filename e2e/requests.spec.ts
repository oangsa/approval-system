import { expect, test } from "@playwright/test";

async function openWizard(page: import("@playwright/test").Page)
{
    await page.goto("/auth/login");
    await page.getByLabel("Email", { exact: true }).fill("requester-a@example.test");
    await page.getByLabel("Password", { exact: true }).fill("Test-password-42!");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.getByRole("link", { name: "New request" }).click();
    await expect(page.getByRole("heading", { name: "New request" })).toBeVisible();
}
test("E2E-01 wizard incomplete save, Back/Next preservation, conditional validation and authoritative submit", async ({ page }) =>
{
    await openWizard(page);
    await expect(page.getByRole("button", { name: "Save Draft" })).toBeDisabled();
    await page.getByLabel("Request type (required)", { exact: true }).selectOption({ label: "General request" });
    await page.getByRole("button", { name: "Save Draft" }).click();
    await expect(page.getByRole("status")).toContainText("Draft saved");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: false })).toBeFocused();
    await page.getByLabel("Title", { exact: false }).fill("Browser submission");
    await page.getByLabel("Justification", { exact: false }).fill("Created by the complete request wizard");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByLabel("Category", { exact: false }).selectOption("OTHER");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByLabel("Additional details", { exact: false })).toBeFocused();
    await page.getByLabel("Additional details", { exact: false }).fill("Safe temporary detail");
    await page.getByLabel("Category", { exact: false }).selectOption("OPERATIONS");
    await expect(page.getByLabel("Additional details", { exact: false })).toHaveCount(0);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: false })).toHaveValue("Browser submission");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Review & Submit" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Items & Attachments" })).toHaveCount(0);
    await page.getByRole("button", { name: "Submit request", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Submit this request?" })).toBeVisible();
    const actionKeys: string[] = [];
    await page.route("**/api/v1/requests/*/submit", async (route) =>
    {
        actionKeys.push(route.request().headers()["idempotency-key"]!);
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        if (actionKeys.length === 1) await route.abort("failed");
        else await route.fulfill({ response });
    });
    await page.getByRole("button", { name: "Confirm submission" }).click();
    await expect(page.getByRole("alert")).toContainText("Network request failed");
    await expect(page.getByRole("region", { name: "Review & Submit" })).toContainText("Browser submission");
    await page.getByRole("button", { name: "Submit request", exact: true }).click();
    await page.getByRole("button", { name: "Confirm submission" }).click();
    await expect(page.getByRole("heading", { name: "Request submitted", exact: true })).toBeVisible();
    expect(actionKeys).toHaveLength(2);
    expect(actionKeys[0]).toBe(actionKeys[1]);
    await expect(page.getByRole("region", { name: "Request result" })).toContainText("Pending approval");
    await expect(page.getByRole("region", { name: "Request result" })).toContainText(/REQ-\d{8,}/);
    await expect(page.getByRole("region", { name: "Request result" })).not.toContainText("Safe temporary detail");
    await expect(page.getByRole("textbox")).toHaveCount(0);
    await page.getByRole("link", { name: "Open saved request" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Browser submission" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Request result" })).toContainText("Browser submission");
    await expect(page.getByRole("region", { name: "Request result" })).toContainText("Operations");
    await expect(page.getByRole("region", { name: "Request result" })).not.toContainText("OPERATIONS");
    await page.screenshot({ path: "artifacts/playwright/request-submitted.png", fullPage: true });
    await page.reload();
    await expect(page.getByRole("region", { name: "Request result" })).toContainText("Pending approval");
});
test("UI-20 authenticated wizard data is absent from public SSR", async ({ request }) =>
{
    const response = await request.get("/requests/new");
    expect(response.ok()).toBe(true);
    const html = await response.text();
    expect(html).not.toContain("requester-a@example.test");
    expect(html).not.toContain("Browser submission");
});
