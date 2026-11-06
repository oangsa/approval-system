import { expect, test, type Page } from "@playwright/test";
import { apiUrl } from "./helpers/environment";

const requester = { email: "requester-a@example.test", password: "Test-password-42!" };
const administrator = { email: "admin@example.test", password: "Test-password-42!" };

async function signIn(page: Page, credentials: { email: string; password: string }): Promise<void>
{
    await page.goto("/auth/login");
    await page.getByLabel("Email", { exact: true }).fill(credentials.email);
    await page.getByLabel("Password", { exact: true }).fill(credentials.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
}

test("IA-E2E-01: a real login reaches the protected shell with the current identity", async ({ page }) =>
{
    await signIn(page, requester);
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible();
    await page.getByRole("button", { name: "Requester A" }).click();
    await expect(page.getByRole("menu")).toContainText("requester-a@example.test");
    await expect(page.getByRole("menu")).toContainText("REQUESTER");
});

test("IA-E2E-01: wrong credentials show a generic error and never reach the shell", async ({ page }) =>
{
    await page.goto("/auth/login");
    await page.getByLabel("Email", { exact: true }).fill("requester-a@example.test");
    await page.getByLabel("Password", { exact: true }).fill("definitely-wrong");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toHaveText("Email or password is incorrect.");
    await expect(page).toHaveURL(/\/auth\/login/);
});

test("IA-E2E-02: a returning browser bootstraps its session from the refresh cookie", async ({ page, context }) =>
{
    await signIn(page, requester);
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();

    // A fresh page load in the same browser context must restore identity without re-entering credentials.
    await page.reload();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
    await expect(page.getByText("requester-a@example.test")).toBeVisible();
    const cookies = await context.cookies();
    expect(cookies.some((cookie) => cookie.name === "refreshToken" && cookie.httpOnly)).toBe(true);
});

test("IA-E2E-03: logout ends the session and protected routes require signing in again", async ({ page }) =>
{
    await signIn(page, requester);
    await page.getByRole("button", { name: "Requester A" }).click();
    await page.getByRole("menuitem", { name: /Sign out/ }).click();
    await expect(page).toHaveURL(/\/auth\/login/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\/login\?from=%2Fdashboard/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
});

test("IA-E2E-03: switching accounts never renders the previous identity", async ({ page }) =>
{
    await signIn(page, requester);
    await page.getByRole("button", { name: "Requester A" }).click();
    await page.getByRole("menuitem", { name: /Sign out/ }).click();
    await expect(page).toHaveURL(/\/auth\/login/);

    await signIn(page, administrator);
    await page.getByRole("button", { name: "Administrator" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toContainText("admin@example.test");
    await expect(menu).not.toContainText("requester-a@example.test");
    await expect(menu).toContainText("ADMINISTRATOR");
});

test("IA-E2E-04: the mobile drawer is keyboard operable and manages focus", async ({ page }) =>
{
    await signIn(page, requester);
    await page.setViewportSize({ width: 390, height: 844 });

    const trigger = page.getByRole("button", { name: "Open navigation menu" });
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Navigation menu" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
        await expect(dialog.getByRole("link", { name: /Dashboard/ })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();

    await trigger.click();
    await dialog.getByRole("link", { name: /Settings/ }).click();
    await expect(page).toHaveURL(/\/settings$/);
});

test("IA-E2E-05: public server-rendered HTML never contains private identity data", async ({ request }) =>
{
    const response = await request.get("/");
    const html = await response.text();
    expect(response.status()).toBe(200);
    expect(html).not.toContain("requester-a@example.test");
    expect(html).not.toContain("Requester A");
    expect(html).not.toContain("eyJ"); // no serialized JWT payload
});

test("the API rejects protected calls without credentials through the real listener", async ({ request }) =>
{
    const response = await request.get(`${apiUrl.origin}/api/v1/auth/me`);
    expect(response.status()).toBe(401);
    expect(response.headers()["cache-control"]).toBe("no-store");
});