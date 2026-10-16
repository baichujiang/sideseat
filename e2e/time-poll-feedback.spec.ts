import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, webkit, expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const tokens: string[] = [];
const artifacts = process.env.SIDESEAT_QA_ARTIFACT_DIR ?? "/tmp/sideseat-feedback109-qa";
test.afterAll(async () => { await prisma.timePoll.deleteMany({ where: { token: { in: tokens } } }); await prisma.$disconnect(); });

for (const [engineName, engine] of [["chromium", chromium], ["webkit", webkit]] as const) {
  test(`${engineName}: clear plan header, acknowledged autosave and an explicit completion`, async ({ request, baseURL }) => {
    test.setTimeout(120000);
    await mkdir(artifacts, { recursive: true });
    const login = await request.post("/api/v1/auth/login", { data: { identifier: "test_001", password: "Password123", device: { id: randomUUID(), name: "Feedback QA", appVersion: "1.0.0", platformVersion: "26.0" } } });
    expect(login.status()).toBe(200);
    const headers = { Authorization: `Bearer ${(await login.json()).data.tokens.accessToken}` };
    const dates = Array.from({ length: 7 }, (_, n) => new Date(Date.now() + (n + 3) * 86400000).toISOString().slice(0, 10));
    const title = "周末一起去湖边玩一天，看看大家什么时候有空";
    const created = await request.post("/api/v1/time-polls", { headers: { ...headers, "Idempotency-Key": randomUUID() }, data: { title, location: "湖边公园门口集合", timeZone: "Europe/Berlin", dates, startMinute: 540, endMinute: 1260, planningMode: "COLLECT", expectedCount: 3 } });
    expect(created.status()).toBe(201); const poll = (await created.json()).data; tokens.push(poll.token);
    const browser = await engine.launch();
    const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, colorScheme: engineName === "webkit" ? "dark" : "light" });
    try {
      const page = await context.newPage();
      await page.goto(`/time-polls/${poll.token}`);
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
      await expect(page.getByRole("region", { name: "计划信息" })).toContainText("所有时间以 Europe/Berlin 为准");
      await page.getByLabel("本次计划中的昵称").fill("一起出去玩的朋友小林");
      await page.getByRole("button", { name: "开始 / 继续填写", exact: true }).click();
      const finish = page.getByRole("button", { name: "完成填写", exact: true });
      await expect(finish).toBeVisible(); await expect(finish).toBeDisabled();
      await expect(page.getByRole("status")).toHaveText("选择你有空的时间");
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const url = `**/api/public/time-polls/${poll.token}/response`;
      await page.route(url, async (route) => { const response = await route.fetch(); await gate; await route.fulfill({ response }); });
      await page.getByTestId("time-poll-cell-0").click();
      await expect(page.getByRole("status")).toHaveText("正在保存…"); await expect(finish).toBeDisabled();
      await page.screenshot({ path: `${artifacts}/${engineName}-saving-mobile.png`, fullPage: true });
      release(); await expect(page.getByRole("status")).toHaveText("已自动保存"); await expect(finish).toBeEnabled();
      await expect(page.getByText("已选 1 天 · 0.5 小时", { exact: true })).toBeVisible();
      await page.unroute(url);
      await page.route(url, (route) => route.fulfill({ status: 503, json: { error: { message: "QA temporary save failure" } } }), { times: 1 });
      await page.getByTestId("time-poll-cell-2").click();
      await expect(page.getByRole("status")).toHaveText("保存失败");
      await expect(page.getByTestId("time-poll-cell-2")).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "重试保存", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText("已自动保存");
      for (const width of [320, 390, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await expect(finish).toBeInViewport();
        if (width >= 1024) expect(await page.getByTestId("time-poll-grid").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      }
      await page.screenshot({ path: `${artifacts}/${engineName}-saved-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.screenshot({ path: `${artifacts}/${engineName}-saved-mobile.png`, fullPage: true });
      await finish.click();
      await expect(page.getByText("填写完成", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "大家的时间表", exact: true })).toBeVisible();
      await expect(finish).toHaveCount(0);
      await page.getByRole("button", { name: "我的时间", exact: true }).click();
      await expect(page.getByTestId("time-poll-cell-2")).toHaveAttribute("aria-pressed", "true");
      await page.reload(); await expect(page.getByRole("status")).toHaveText("已自动保存");
      await expect(page.getByTestId("time-poll-cell-2")).toHaveAttribute("aria-pressed", "true");
      const persisted = (await (await context.request.get(`/api/public/time-polls/${poll.token}`)).json()).data;
      expect(persisted.mySlotIds).toEqual([0, 1, 2, 3]);
      await page.getByRole("button", { name: "Switch to English", exact: true }).click();
      await expect(page.getByRole("button", { name: "Done selecting", exact: true })).toBeVisible();
      await expect(page.getByRole("status")).toHaveText("Saved automatically");
    } finally { await context.close(); await browser.close(); }
  });
}
