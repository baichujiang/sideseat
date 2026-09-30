import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { test, expect, type APIRequestContext } from "@playwright/test";
import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const fixture = JSON.parse(readFileSync("/tmp/sideseat-invite-admin-fixture.json", "utf8")) as { users: Array<{ id: string; username: string }> };
const [admin, member, peer] = fixture.users;
async function login(request: APIRequestContext, username: string) {
  const response = await request.post("/api/auth/login", { data: { identifier: username, password: "Password123" } });
  expect(response.status()).toBe(200);
}
test.use({ viewport: { width: 1400, height: 1000 }, isMobile: false });

test("Cookie-only admin sessions survive direct entry, refresh, and the login return URL", async ({ page, context }) => {
  // API login sets the real HttpOnly cookie without populating the browser's in-memory JWT.
  await login(context.request, admin!.username);
  for (const path of ["/admin/invitations", "/admin", "/login?returnTo=%2Fadmin%2Finvitations"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/admin\/invitations$/);
    await expect(page.getByRole("heading", { name: "邀请码管理" })).toBeVisible();
    const loaded = page.waitForResponse(response => new URL(response.url()).pathname === "/api/admin/membership-invites" && response.request().method() === "GET");
    await page.getByRole("button", { name: "刷新记录" }).click();
    expect((await loaded).status()).toBe(200);
  }
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/admin\/invitations$/);
  await expect(page.getByRole("heading", { name: "邀请码管理" })).toBeVisible();
  const newTab = await context.newPage();
  await newTab.goto("/admin/invitations");
  await newTab.waitForLoadState("networkidle");
  await expect(newTab).toHaveURL(/\/admin\/invitations$/);
  await expect(newTab.getByRole("heading", { name: "邀请码管理" })).toBeVisible();
  for (const returnTo of ["https://example.com", "//example.com", "/\\example.com", "/\\[invalid", "/login", "/admin/../login"]) {
    const response = await context.request.get(`/login?returnTo=${encodeURIComponent(returnTo)}`, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe("/home");
  }
});

test("Only admins can read or mutate; cross-origin requests are refused", async ({ request, playwright, baseURL }) => {
  const root = "/api/admin/membership-invites";
  expect((await request.get(root)).status()).toBe(401);
  expect((await request.post(root, { data: {} })).status()).toBe(401);
  await login(request, member!.username);
  expect((await request.get(root)).status()).toBe(403);
  expect((await request.post(root, { data: {} })).status()).toBe(403);
  expect((await request.patch(`${root}/unknown`, { data: { action: "DISABLE" } })).status()).toBe(403);
  const elevated = await playwright.request.newContext({ baseURL });
  try {
    await login(elevated, admin!.username);
    expect((await elevated.post(root, { headers: { Origin: "https://untrusted.invalid" }, data: {} })).status()).toBe(403);
    const input = { requestKey: randomUUID(), label: "HTTP idempotency", mode: "SHARED", quantity: 2, durationDays: 7, expiresAt: new Date(Date.now() + 86_400_000).toISOString() };
    const first = await elevated.post(root, { data: input });
    expect(first.status()).toBe(201);
    const firstBody = (await first.json()).data;
    const retry = (await (await elevated.post(root, { data: input })).json()).data;
    expect(retry.batchId).toBe(firstBody.batchId); expect(retry.alreadyCreated).toBe(true); expect(retry.codes).toHaveLength(0);
    const details = await elevated.get(`${root}/${firstBody.batchId}`);
    const text = await details.text(); expect(text).not.toContain(firstBody.codes[0].code); expect(text).not.toContain("codeHash");
    expect((await elevated.patch(`${root}/${firstBody.batchId}`, { data: { action: "DISABLE" } })).status()).toBe(200);
  } finally { await elevated.dispose(); }
});

test("Browser creates shared and individual invitations, sees redemption history, and stops a batch", async ({ page, playwright, baseURL }) => {
  await page.goto("/admin/invitations");
  await page.locator("#login-identifier").fill(admin!.username);
  await page.locator("#login-password").fill("Password123");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "邀请码管理" })).toBeVisible();
  const label = `UI shared ${Date.now()}`;
  await page.getByLabel("批次名称").fill(label);
  await page.getByLabel("可兑换人数").fill("2");
  await page.getByRole("button", { name: "创建邀请码", exact: true }).click();
  const raw = page.getByLabel("邀请码原文");
  await expect(raw).toBeVisible();
  const code = await raw.inputValue(); expect(code).toMatch(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载 CSV" }).click();
  const download = await downloadEvent; expect(download.suggestedFilename()).toContain("sideseat-invites-");
  const contexts = await Promise.all([member!, peer!, admin!].map(async user => {
    const request = await playwright.request.newContext({ baseURL }); await login(request, user.username); return request;
  }));
  try {
    const results = await Promise.all(contexts.map(request => request.post("/api/v1/me/membership/redeem", { data: { code } })));
    expect(results.map(r => r.status()).sort()).toEqual([200, 200, 422]);
    await page.getByRole("button", { name: "刷新记录" }).click();
    const batch = page.getByRole("article").filter({ has: page.getByRole("heading", { name: label, exact: true }) });
    await expect(batch).toContainText("已兑换 2 / 2");
    await page.getByRole("button", { name: "兑换记录", exact: true }).click();
    const detail = page.getByRole("region", { name: "批次详情" });
    await expect(detail.getByText("兑换后有效期至", { exact: false })).toHaveCount(2);
    await page.getByRole("button", { name: "操作记录", exact: true }).click();
    await expect(detail).toContainText(`@${admin!.username}`);
    await page.screenshot({ path: "docs/visual-qa/invite-admin-desktop.png", fullPage: true });
    await batch.getByRole("button", { name: "停用整批" }).click();
    await page.getByRole("button", { name: "确认停用" }).click();
    await expect(batch).toContainText("已停用");
    await page.getByRole("button", { name: "已保存，关闭" }).click();
    const individual = `UI individual ${Date.now()}`;
    await page.getByLabel("批次名称").fill(individual);
    await page.getByLabel("发码方式").selectOption("INDIVIDUAL");
    await page.getByLabel("生成数量").fill("2");
    await page.getByRole("button", { name: "创建邀请码", exact: true }).click();
    await expect(raw).toBeVisible();
    expect((await raw.inputValue()).split("\n")).toHaveLength(2);
    await expect(page.getByRole("button", { name: "停用此码", exact: true })).toHaveCount(2);
    await page.getByRole("button", { name: "停用此码", exact: true }).first().click();
    await page.getByRole("button", { name: "确认停用" }).click();
    await expect(page.getByRole("region", { name: "批次详情" })).toContainText("已停用");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "docs/visual-qa/invite-admin-mobile.png", fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "邀请码管理" })).toBeVisible();
    await expect(page.getByLabel("邀请码原文")).toHaveCount(0);
  } finally { await Promise.all(contexts.map(request => request.dispose())); }
});
