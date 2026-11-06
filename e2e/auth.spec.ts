import { expect, test, type Page } from "@playwright/test";
import { apiUrl, webUrl } from "./helpers/environment";

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
    await expect(page.getByRole("region", { name: "Account details" })).toContainText("requester-a@example.test");
    await expect(page.getByRole("region", { name: "Account details" })).toContainText("REQUESTER");
});

test("IA-E2E-04: wrong credentials show a generic error and never reach the shell", async ({ page }) =>
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
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\/login\?from=%2Fdashboard/);
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
});

test("IA-E2E-03: switching accounts never renders the previous identity", async ({ page }) =>
{
    await signIn(page, requester);
    await page.getByRole("button", { name: "Requester A" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/auth\/login/);

    await signIn(page, administrator);
    await page.getByRole("button", { name: "Administrator" }).click();
    const menu = page.getByRole("region", { name: "Account details" });
    await expect(menu).toContainText("admin@example.test");
    await expect(menu).not.toContainText("requester-a@example.test");
    await expect(menu).toContainText("ADMINISTRATOR");
});

test("IA-WEB-05: the mobile drawer is keyboard operable and manages focus", async ({ page }) =>
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

test("IA-E2E-03: delayed bootstrap identity cannot replace a later account", async ({ page }) =>
{
    await signIn(page, requester);
    let release!: () => void;
    let captured!: () => void;
    const held = new Promise<void>((resolve) =>
    {
        release = resolve;
    });
    const received = new Promise<void>((resolve) =>
    {
        captured = resolve;
    });
    await page.route("**/api/v1/auth/me", async (route) =>
    {
        const response = await route.fetch();
        captured();
        await held;
        await route.fulfill({ response });
    }, { times: 1 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await received;
    await page.evaluate(() =>
    {
        history.pushState({}, "", "/auth/login");
        window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await page.getByLabel("Email", { exact: true }).fill(administrator.email);
    await page.getByLabel("Password", { exact: true }).fill(administrator.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("button", { name: "Administrator" })).toBeVisible();
    release();
    await page.getByRole("button", { name: "Administrator" }).click();
    const details = page.getByRole("region", { name: "Account details" });
    await expect(details).toContainText("admin@example.test");
    await expect(details).not.toContainText("requester-a@example.test");
    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
});

test("IA-E2E-04: equivalent denials, injected throttle, and network recovery", async ({ page }) =>
{
    await page.goto("/auth/login");
    for (const email of [requester.email, "unknown@example.test", "disabled@example.test"])
    {
        await page.getByLabel("Email", { exact: true }).fill(email);
        await page.getByLabel("Password", { exact: true }).fill("definitely-wrong");
        await page.getByRole("button", { name: "Sign in" }).click();
        await expect(page.getByRole("alert")).toHaveText("Email or password is incorrect.");
    }
    await page.route("**/api/v1/auth/login", async (route) =>
    {
        await route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ message: "Too many requests" }) });
    }, { times: 1 });
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toContainText(/too many/i);
    await page.route("**/api/v1/auth/login", async (route) =>
    {
        await route.abort("failed");
    }, { times: 1 });
    await page.getByLabel("Email", { exact: true }).fill(administrator.email);
    await page.getByLabel("Password", { exact: true }).fill(administrator.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toHaveText("We could not reach the server. Check your connection and try again.");
    await expect(page.getByRole("navigation", { name: "Primary" })).not.toBeVisible();
    let logins = 0;
    let refreshes = 0;
    page.on("request", (request) =>
    {
        if (request.url().endsWith("/auth/login")) logins++;
        if (request.url().endsWith("/auth/refresh")) refreshes++;
    });
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("button", { name: "Administrator" })).toBeVisible();
    expect(logins).toBe(1);
    expect(refreshes).toBe(0);
    expect(await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)))).toEqual([]);
});

test("IA-E2E-03: failed logout clears private UI and retry revokes credentials", async ({ page, context, request }) =>
{
    let bearer = "";
    page.on("request", (outgoing) =>
    {
        if (outgoing.url().endsWith("/auth/me")) bearer = outgoing.headers().authorization ?? "";
    });
    await signIn(page, requester);
    await page.reload();
    await expect(page.getByRole("button", { name: "Requester A" })).toBeVisible();
    const cookie = (await context.cookies()).find((item) => item.name === "refreshToken");
    expect(cookie).toBeDefined();
    let release!: () => void;
    let captured!: () => void;
    const held = new Promise<void>((resolve) =>
    {
        release = resolve;
    });
    const received = new Promise<void>((resolve) =>
    {
        captured = resolve;
    });
    await page.route("**/api/v1/auth/logout", async (route) =>
    {
        captured();
        await held;
        await route.abort("failed");
    }, { times: 1 });
    await page.getByRole("button", { name: "Requester A" }).click();
    await page.getByRole("button", { name: "Sign out" }).click();
    await received;
    await expect(page.getByRole("button", { name: "Requester A" })).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    release();
    await expect(page.getByRole("alert")).toContainText("Server sign-out could not be confirmed");
    await page.getByRole("button", { name: "Retry sign out" }).click();
    await expect(page.getByRole("alert")).not.toBeVisible();
    expect((await request.get(`${apiUrl.origin}/api/v1/auth/me`, { headers: { authorization: bearer } })).status()).toBe(401);
    expect((await request.post(`${apiUrl.origin}/api/v1/auth/refresh`, { headers: { origin: webUrl.origin, cookie: `refreshToken=${cookie!.value}` } })).status()).toBe(401);
});

test("IA-WEB-05: desktop rail and native mobile modal preserve keyboard access", async ({ page }) =>
{
    await signIn(page, requester);
    const navigation = page.getByRole("navigation", { name: "Primary" });
    const collapse = page.getByRole("button", { name: "Collapse navigation" });
    await collapse.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Expand navigation" })).toHaveAttribute("aria-expanded", "false");
    await expect(navigation.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(collapse).toHaveAttribute("aria-expanded", "true");
    await expect(navigation.getByRole("link", { name: "Settings" })).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await navigation.evaluate((element) => getComputedStyle(element).transitionProperty)).toBe("none");
    await page.setViewportSize({ width: 390, height: 844 });
    const trigger = page.getByRole("button", { name: "Open navigation menu" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Navigation menu" });
    expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
    for (let i = 0; i < 8; i++)
    {
        await page.keyboard.press("Tab");
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
        await page.keyboard.press("Shift+Tab");
        expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    }
    await page.mouse.click(375, 30);
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(page.getByRole("region", { name: "Account details" })).not.toBeVisible();
    await trigger.click();
    await page.setViewportSize({ width: 1000, height: 844 });
    await expect(dialog).not.toBeVisible();
});
