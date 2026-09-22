import { expect, type Page } from "@playwright/test";

type LoginOptions = {
  identifier: string;
  password: string;
  onboardingError: string;
};

function readLoginError(payload: unknown) {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return null;
  const error = payload.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return typeof error.message === "string" ? error.message : null;
  }
  return null;
}

export async function loginWithPassword(page: Page, options: LoginOptions) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /log in/i })).toBeVisible();
  await page.getByLabel(/username/i).fill(options.identifier);
  await page.getByLabel(/password/i).fill(options.password);

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/login") && response.request().method() === "POST",
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Log in" }).click();
  const response = await responsePromise;
  const payload = (await response.json().catch(() => null)) as unknown;
  const responseError = readLoginError(payload);

  expect(
    response.ok(),
    `Login request failed with HTTP ${response.status()}${responseError ? `: ${responseError}` : ""}`,
  ).toBe(true);

  await expect(page).toHaveURL(/\/(home|onboarding)(?:[/?#]|$)/, { timeout: 30_000 });
  if (page.url().includes("/onboarding")) {
    throw new Error(options.onboardingError);
  }
}
