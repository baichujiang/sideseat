import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const prisma = new PrismaClient();

const E2E_USER = process.env.E2E_USER ?? "test_001";
const E2E_PEER = process.env.E2E_PEER ?? "test_002";
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? "Password123";

const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

let connectionId = "";

async function loginWithPassword(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /log in/i })).toBeVisible();
  await page.getByLabel(/username/i).fill(E2E_USER);
  await page.getByLabel(/password/i).fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/(home|onboarding)/, { timeout: 30_000 });
  if (page.url().includes("/onboarding")) {
    throw new Error(`User "${E2E_USER}" landed on onboarding. Run npm run seed:test-accounts first.`);
  }
}

async function openSeededDirectThread(page: Page) {
  await page.goto(`/connections/${connectionId}`);
  await expect(page).toHaveURL(/\/connections\/[^/]+$/);
  await expect(page.getByRole("textbox", { name: /message/i })).toBeVisible();
}

async function ensureAttachmentMenuOpen(page: Page) {
  const menu = page.getByRole("region", { name: /attachments/i });
  if (await menu.isVisible()) return;
  await page.getByRole("button", { name: /open attachment menu/i }).click();
  await expect(menu).toBeVisible();
}

test.beforeAll(async () => {
  const users = await prisma.user.findMany({
    where: { username: { in: [E2E_USER, E2E_PEER] } },
    select: { id: true, username: true },
  });
  const byUsername = new Map(users.map((user) => [user.username, user.id]));
  const userId = byUsername.get(E2E_USER);
  const peerId = byUsername.get(E2E_PEER);
  if (!userId || !peerId) {
    throw new Error(`Missing seeded users "${E2E_USER}" and "${E2E_PEER}". Run npm run seed:test-accounts.`);
  }

  const connection = await prisma.connection.findFirst({
    where: {
      status: "ACTIVE",
      OR: [
        { userAId: userId, userBId: peerId },
        { userAId: peerId, userBId: userId },
      ],
    },
    select: { id: true },
  });
  if (!connection) {
    throw new Error(`Missing active DM between "${E2E_USER}" and "${E2E_PEER}". Run npm run seed:test-accounts.`);
  }
  connectionId = connection.id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe.serial("Chat regression flow", () => {
  test("keeps the direct chat composer production-ready across text, keyboard, photo, and plan flows", async ({
    page,
  }, testInfo) => {
    await loginWithPassword(page);
    await openSeededDirectThread(page);

    const input = page.getByRole("textbox", { name: /message/i });
    const footer = page.getByTestId("chat-composer-footer");
    const shell = page.locator("[data-app-shell]");
    await expect(footer).toBeVisible();
    await expect(shell).toBeVisible();

    const shellHeightBefore = await shell.evaluate((el) => el.getBoundingClientRect().height);
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--app-viewport-height", "640px");
    });
    await expect
      .poll(() => shell.evaluate((el) => Math.round(el.getBoundingClientRect().height)))
      .toBe(640);
    await page.evaluate(() => {
      document.documentElement.style.removeProperty("--app-viewport-height");
    });
    await expect
      .poll(() => shell.evaluate((el) => Math.round(el.getBoundingClientRect().height)))
      .toBe(Math.round(shellHeightBefore));

    await input.click();
    await expect(input).toBeFocused();

    const paddingBefore = await footer.evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--keyboard-inset-bottom", "220px");
    });
    await expect
      .poll(() => footer.evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom)))
      .toBe(paddingBefore);
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--keyboard-inset-bottom", "0px");
    });

    const firstMessage = `e2e first ${Date.now()}`;
    await input.fill(firstMessage);
    await input.press("Enter");
    await expect(input).toHaveValue("");
    await expect(page.getByText(firstMessage)).toBeVisible();
    await expect(input).toBeFocused();

    const secondMessage = `e2e second ${Date.now()}`;
    await input.fill(secondMessage);
    await expect(input).toHaveValue(secondMessage);
    await expect(page.getByRole("button", { name: /send/i })).toBeEnabled();
    await page.getByRole("button", { name: /send/i }).click();
    await expect(input).toHaveValue("");
    await expect(page.getByText(secondMessage)).toBeVisible();
    await expect(input).toBeFocused();

    await ensureAttachmentMenuOpen(page);
    await expect(page.getByRole("menuitem", { name: /send photo/i })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /schedule/i })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /plan together/i })).toBeVisible();

    await page.getByRole("menuitem", { name: /plan together/i }).click();
    const planDialog = page.getByRole("dialog", { name: /plan/i });
    await expect(planDialog).toBeVisible();
    await expect(planDialog.getByLabel(/title/i)).toBeVisible();
    await expect(planDialog.getByText(/^Type$/)).toHaveCount(0);
    await planDialog.getByRole("button", { name: /cancel/i }).click();
    await expect(planDialog).toBeHidden();

    await ensureAttachmentMenuOpen(page);
    const imageButtons = page.getByRole("button", { name: /view image full size/i });
    const imageCountBefore = await imageButtons.count();
    const uploadDir = path.join(testInfo.outputDir, "uploads");
    await mkdir(uploadDir, { recursive: true });
    const uploadPath = path.join(uploadDir, "chat-upload.png");
    await writeFile(uploadPath, Buffer.from(PNG_1X1_BASE64, "base64"));
    await page.locator('input[type="file"][accept*="image"]').setInputFiles(uploadPath);

    await expect.poll(() => imageButtons.count(), { timeout: 30_000 }).toBeGreaterThan(imageCountBefore);
    await expect(imageButtons.last()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("dialog", { name: /image viewer/i })).toHaveCount(0);

    await page.waitForTimeout(800);
    await imageButtons.last().click();
    const imageViewer = page.getByRole("dialog", { name: /image viewer/i });
    await expect(imageViewer).toBeVisible();
    await imageViewer.getByRole("button", { name: /zoom in/i }).click();
    await expect(imageViewer.getByText("175%")).toBeVisible();
    await imageViewer.getByRole("button", { name: /^close$/i }).click();
    await expect(imageViewer).toBeHidden();
    await expect(input).toBeVisible();
  });
});
