import { expect, test } from "@playwright/test";

/**
 * Standard regression path: login → each main tab → common drill-ins.
 *
 * Prereqs: DB migrated + seeded onboarded user (`npm run prisma:seed` — default `lin` / `Password123`).
 *
 * Env: E2E_USER, E2E_PASSWORD, PLAYWRIGHT_BASE_URL, E2E_COURSE_ID (optional course chat deep link),
 *      E2E_SIGNUP=1 to run the optional new-account smoke (creates a user in DB).
 */

const E2E_USER = process.env.E2E_USER ?? "lin";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";

function logStep(name: string) {
  // eslint-disable-next-line no-console
  console.log(`\n[e2e] ${name}`);
}

/** First-run tab tutorial (floating coach); dismiss so main-nav clicks are not blocked. */
async function dismissProductTutorialIfPresent(page: import("@playwright/test").Page) {
  const root = page.locator('[data-testid="product-tutorial"]');
  try {
    await root.getByRole("button", { name: "Close" }).click({ timeout: 4000 });
  } catch {
    /* not shown or already dismissed */
  }
}

async function loginWithPassword(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /log in/i })).toBeVisible();
  await page.getByPlaceholder(/janedoe or alex@example.com/i).fill(E2E_USER);
  await page.locator('input[type="password"]').first().fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 30_000 });
  if (page.url().includes("/onboarding")) {
    throw new Error(
      `User "${E2E_USER}" landed on /onboarding — use an account with onboarding already complete (e.g. prisma seed).`,
    );
  }
  await expect(page).toHaveURL(/\/home/);
  await dismissProductTutorialIfPresent(page);
}

async function goMainTab(page: import("@playwright/test").Page, label: string, urlRe: RegExp) {
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  // `name` is substring by default — "Me" matches "Home"; always use exact tab labels.
  await nav.getByRole("link", { name: label, exact: true }).click();
  await expect(page).toHaveURL(urlRe);
}

test.describe("Standard user flow (login + tabs + drill-ins)", () => {
  test("walks main surfaces after login", async ({ page }) => {
    logStep("Login");
    await loginWithPassword(page);

    logStep("Tab: Home");
    await goMainTab(page, "Home", /\/home$/);
    await expect(page.getByText(/Week \d+/)).toBeVisible();

    logStep("Tab: Courses");
    await goMainTab(page, "Courses", /\/courses$/);
    await expect(page.getByRole("heading", { name: "Courses" })).toBeVisible();

    logStep("Drill-in: Add course");
    await page.goto("/courses/add");
    await expect(page.getByRole("heading", { name: "Add course" })).toBeVisible();

    logStep("Tab: Discover");
    await goMainTab(page, "Discover", /\/discover$/);
    await expect(page.getByRole("heading", { name: "Discover" })).toBeVisible();

    logStep("Tab: Chats");
    await goMainTab(page, "Chats", /\/inbox$/);
    await expect(page.getByRole("heading", { name: "Chats" })).toBeVisible();

    const dmLinks = page.locator('a[href^="/connections/"]');
    if ((await dmLinks.count()) > 0) {
      logStep("Drill-in: first DM thread (if inbox has one)");
      const firstDm = dmLinks.first();
      await firstDm.click();
      await expect(page).toHaveURL(/\/connections\/[^/]+$/);
      await expect(page.getByRole("textbox", { name: /message/i })).toBeVisible({ timeout: 15_000 });
      await page.goBack();
      await expect(page).toHaveURL(/\/inbox/);
    } else {
      logStep("Skip DM thread — no /connections/ link in inbox");
    }

    const courseId = process.env.E2E_COURSE_ID?.trim();
    if (courseId) {
      logStep("Drill-in: course chat (E2E_COURSE_ID)");
      await page.goto(`/courses/${courseId}/chat`);
      await expect(page.getByRole("textbox", { name: /message/i })).toBeVisible({ timeout: 15_000 });
    } else {
      logStep("Skip course chat — set E2E_COURSE_ID to a course the user is enrolled in");
    }

    logStep("Tab: Me");
    await goMainTab(page, "Me", /\/profile$/);
    await expect(page.getByRole("heading", { name: "Me" })).toBeVisible();

    logStep("Profile: school verification block");
    await expect(page.locator("#me-verification-heading")).toBeVisible();

    logStep("Drill-in: Settings & account");
    await page.getByRole("link", { name: /settings & account/i }).click();
    await expect(page).toHaveURL(/\/profile\/account$/);
    await expect(page.getByRole("heading", { name: "Settings & account" })).toBeVisible();
    await page.getByRole("link", { name: "Back", exact: true }).click();
    await expect(page).toHaveURL(/\/profile$/);

    logStep("Done");
  });
});

test.describe("Optional signup smoke", () => {
  test("signup reaches home", async ({ page, context }) => {
    test.skip(process.env.E2E_SIGNUP !== "1", "Set E2E_SIGNUP=1 to run (creates a real user).");

    const username = `e2e_${Date.now()}`;
    const password = "Password123!";
    const displayName = `E2E ${username.slice(-6)}`;

    await context.clearCookies();
    await page.goto("/signup");
    await expect(page.getByRole("heading", { name: /create account/i })).toBeVisible();
    await page.getByPlaceholder(/how others see you/i).fill(displayName);
    const email = `${username}@example.com`;
    await page.getByPlaceholder(/you@school\.edu/i).fill(email);
    const sendCode = page.getByRole("button", { name: /send code|获取验证码/i });
    const otpResponse = page.waitForResponse(
      (res) => res.url().includes("/api/auth/email/send-otp") && res.request().method() === "POST",
    );
    await sendCode.click();
    const otpRes = await otpResponse;
    const otpJson = (await otpRes.json()) as { data?: { devCode?: string } };
    const code = otpJson.data?.devCode;
    if (!code) {
      throw new Error("Expected devCode from /api/auth/email/send-otp in non-production.");
    }
    await page.getByPlaceholder(/6.digit|6 位/i).fill(code);
    const pwInputs = page.locator('input[type="password"]');
    await pwInputs.nth(0).fill(password);
    await pwInputs.nth(1).fill(password);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/home/, { timeout: 30_000 });
  });
});
