import { randomUUID } from "node:crypto";
import { test, expect, chromium, webkit, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const tokens: string[] = [];
let headers: { Authorization: string };
test.beforeAll(async ({ request }) => {
  const login = await request.post("/api/v1/auth/login", { data: { identifier: "test_001", password: "Password123", device: { id: randomUUID(), name: "Web grid QA", appVersion: "1.0.0", platformVersion: "26.0" } } });
  expect(login.status()).toBe(200);
  headers = { Authorization: `Bearer ${(await login.json()).data.tokens.accessToken}` };
});
test.afterAll(async () => { await prisma.timePoll.deleteMany({ where: { token: { in: tokens } } }); await prisma.$disconnect(); });
async function create(request: APIRequestContext, days: number, endMinute: number) {
  const dates = Array.from({ length: days }, (_, n) => new Date(Date.now() + (n + 3) * 86400000).toISOString().slice(0, 10));
  const response = await request.post("/api/v1/time-polls", { headers: { ...headers, "Idempotency-Key": randomUUID() }, data: { title: "Unified availability grid QA", timeZone: "Europe/Berlin", dates, startMinute: 540, endMinute, durationMinutes: 60, expectedCount: 2 } });
  expect(response.status()).toBe(201);
  const poll = (await response.json()).data; tokens.push(poll.token); return poll;
}
async function join(page: Page, token: string) {
  await page.goto(`/time-polls/${token}`);
  await page.getByLabel("本次计划中的昵称").fill("时间格游客");
  await page.getByRole("button", { name: "开始 / 继续填写", exact: true }).click();
  await expect(page.getByTestId("time-poll-cell-0")).toBeVisible();
}

test("day selection, partial color, undo, keyboard, persistence and read-only heatmap match the app in Chromium and WebKit", async ({ request, baseURL }) => {
  test.setTimeout(120000);
  for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]] as const) {
    const poll = await create(request, 2, 600);
    const browser = await engine.launch();
    const context = await browser.newContext({ baseURL, viewport: { width: 430, height: 932 }, locale: "en-US", hasTouch: true, isMobile: true });
    const page = await context.newPage();
    try {
      await join(page, poll.token);
      const cell = (id: number) => page.getByTestId(`time-poll-cell-${id}`);
      const day = page.getByTestId(`time-poll-day-${poll.dates[0]}`);
      const first = (await cell(0).boundingBox())!, last = (await cell(6).boundingBox())!;
      await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2); await page.mouse.down();
      await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2, { steps: 8 }); await page.mouse.up();
      for (const id of [0, 2, 4, 6]) await expect(cell(id)).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("time-poll-undo").tap(); await expect(cell(0)).toHaveAttribute("aria-pressed", "false");
      await cell(4).tap(); await cell(0).tap();
      await expect(day).toHaveAttribute("aria-label", /已选中部分时段/);
      await expect(day).toHaveCSS("background-color", "rgb(255, 240, 199)");
      await day.tap(); await expect(day).toHaveAttribute("aria-pressed", "true");
      for (const id of [0, 2, 4]) await expect(cell(id)).toHaveAttribute("aria-pressed", "true");
      await expect(cell(0)).toHaveCSS("background-color", "rgb(20, 117, 92)");
      await day.tap(); await expect(cell(0)).toHaveAttribute("aria-pressed", "false"); await expect(cell(4)).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("time-poll-undo").tap(); await expect(day).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("status")).toHaveText("已保存");
      await page.screenshot({ path: `/tmp/sideseat-unified-share-qa/${name}-day-selected.png`, fullPage: true });
      await page.reload(); await expect(cell(0)).toHaveAttribute("aria-pressed", "true"); await expect(cell(4)).toHaveAttribute("aria-pressed", "true");
      await cell(0).focus(); await page.keyboard.press("Space");
      await expect(cell(0)).toHaveAttribute("aria-pressed", "false");
      await page.getByRole("button", { name: "大家的结果", exact: true }).tap();
      await expect(page.getByTestId("time-poll-result-2")).toHaveText("1");
      await expect(page.getByTestId("time-poll-cell-2")).toHaveCount(0);
      await expect(day).toHaveCount(0);
      await page.getByRole("button", { name: "我的时间", exact: true }).tap();
      await page.getByTestId("time-poll-undo").tap(); await expect(cell(0)).toHaveAttribute("aria-pressed", "true");
      await page.emulateMedia({ colorScheme: "dark" });
      await expect(cell(0)).toHaveCSS("background-color", "rgb(59, 158, 128)");
      await page.screenshot({ path: `/tmp/sideseat-unified-share-qa/${name}-dark.png`, fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally { await context.close(); await browser.close(); }
  }
});

test("legacy half selections stay partial and heatmap requires the same person throughout 30 minutes", async ({ browser, request, baseURL }) => {
  const poll = await create(request, 1, 600);
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await join(page, poll.token);
    const path = `/api/public/time-polls/${poll.token}`;
    const guest = (await (await context.request.get(path)).json()).data;
    expect((await context.request.put(`${path}/response`, { data: { participantId: guest.viewerId, displayName: guest.myDisplayName, slotIds: [0] } })).status()).toBe(200);
    expect((await request.put(`/api/v1/time-polls/${poll.token}/response`, { headers, data: { displayName: "Host", slotIds: [1] } })).status()).toBe(200);
    await page.reload();
    const first = page.getByTestId("time-poll-cell-0");
    await expect(first).toHaveAttribute("aria-pressed", "mixed");
    await expect(first).toHaveAttribute("aria-label", /09:00–09:30/);
    await expect(first).toHaveCSS("background-color", "rgb(255, 240, 199)");
    await expect(page.getByTestId("time-poll-cell-1")).toHaveCount(0);
    const saved = async () => (await (await context.request.get(path)).json()).data.mySlotIds;
    expect(await saved()).toEqual([0]);
    await page.getByRole("button", { name: "大家的结果", exact: true }).tap();
    await expect(page.getByTestId("time-poll-result-0")).toHaveText("0");
    await page.getByRole("button", { name: "我的时间", exact: true }).tap();
    await first.tap(); await expect.poll(saved).toEqual([0, 1]);
    await page.getByTestId("time-poll-undo").tap(); await expect.poll(saved).toEqual([0]);
    const a = (await first.boundingBox())!, b = (await page.getByTestId("time-poll-cell-2").boundingBox())!;
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.up();
    await expect.poll(saved).toEqual([0, 1, 2, 3]);
    await page.getByTestId("time-poll-undo").tap(); await expect.poll(saved).toEqual([0]);
    await page.reload(); await expect(first).toHaveAttribute("aria-pressed", "mixed");
  } finally { await context.close(); }
});

test("real touch swipes scroll without edits; hold paints, erases and cancels without a premature save", async ({ browser, request, baseURL }) => {
  test.setTimeout(120000);
  const poll = await create(request, 7, 1320);
  const context = await browser.newContext({ baseURL, viewport: { width: 430, height: 932 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  try {
    await join(page, poll.token);
    const grid = page.getByTestId("time-poll-grid");
    await grid.scrollIntoViewIfNeeded();
    const cdp = await context.newCDPSession(page);
    const touch = async (type: "touchStart" | "touchMove" | "touchEnd" | "touchCancel", x = 0, y = 0) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" || type === "touchCancel" ? [] : [{ x, y }] });
    const box = (await grid.boundingBox())!;
    await touch("touchStart", box.x + 130, box.y + 390);
    for (let n = 1; n <= 12; n++) await touch("touchMove", box.x + 130, box.y + 390 - n * 20);
    await touch("touchEnd");
    await expect.poll(() => grid.evaluate((el) => el.scrollTop)).toBeGreaterThan(50);
    await touch("touchStart", box.x + 330, box.y + 220);
    for (let n = 1; n <= 10; n++) await touch("touchMove", box.x + 330 - n * 20, box.y + 220);
    await touch("touchEnd");
    await expect.poll(() => grid.evaluate((el) => el.scrollLeft)).toBeGreaterThan(30);
    const saved = async () => (await (await context.request.get(`/api/public/time-polls/${poll.token}`)).json()).data.mySlotIds;
    expect(await saved()).toEqual([]);
    await grid.evaluate((el) => { el.scrollTop = 0; el.scrollLeft = 0; });
    const first = (await page.getByTestId("time-poll-cell-0").boundingBox())!;
    const last = (await page.getByTestId("time-poll-cell-2").boundingBox())!;
    const x = first.x + first.width / 2;
    const hold = async () => {
      await grid.evaluate((el) => { el.scrollTop = 0; el.scrollLeft = 0; });
      const box = (await page.getByTestId("time-poll-cell-0").boundingBox())!;
      await touch("touchStart", box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(450);
    };
    await hold(); await touch("touchMove", x, last.y + last.height / 2);
    await expect(page.getByTestId("time-poll-cell-2")).toHaveAttribute("aria-pressed", "true");
    expect(await saved()).toEqual([]);
    await touch("touchCancel"); await expect(page.getByTestId("time-poll-cell-0")).toHaveAttribute("aria-pressed", "false");
    expect(await saved()).toEqual([]);
    await hold(); await touch("touchMove", x, last.y + last.height / 2); await touch("touchEnd");
    await expect.poll(saved).toEqual([0, 1, 2, 3]);
    await hold();
    const eraseEnd = (await page.getByTestId("time-poll-cell-2").boundingBox())!;
    await touch("touchMove", eraseEnd.x + eraseEnd.width / 2, eraseEnd.y + eraseEnd.height / 2); await touch("touchEnd");
    await expect.poll(saved).toEqual([]);
    await page.getByTestId("time-poll-undo").tap(); await expect.poll(saved).toEqual([0, 1, 2, 3]);
    await page.reload(); await expect(page.getByTestId("time-poll-cell-2")).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
