import { randomUUID } from "node:crypto";
import { chromium, webkit, expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const tokens: string[] = [];
let headers: { Authorization: string };
test.beforeAll(async ({ request }) => {
  const r = await request.post("/api/v1/auth/login", { data: { identifier: "test_001", password: "Password123", device: { id: randomUUID(), name: "Timetable QA", appVersion: "1.0.0", platformVersion: "26.0" } } });
  expect(r.status()).toBe(200); headers = { Authorization: `Bearer ${(await r.json()).data.tokens.accessToken}` };
});
test.afterAll(async () => { await prisma.timePoll.deleteMany({ where: { token: { in: tokens } } }); await prisma.$disconnect(); });

for (const [engineName, engine] of [["chromium", chromium], ["webkit", webkit]] as const) {
  test(`${engineName}: show the full timetable and manually invite for half a day or a full day`, async ({ request, baseURL }) => {
    test.setTimeout(120000);
    const dates = Array.from({ length: 7 }, (_, n) => new Date(Date.now() + (n + 3) * 86400000).toISOString().slice(0, 10));
    const created = await request.post("/api/v1/time-polls", { headers: { ...headers, "Idempotency-Key": randomUUID() }, data: { title: "Half-day or full-day outing", timeZone: "Europe/Berlin", dates, startMinute: 540, endMinute: 1260, planningMode: "COLLECT", expectedCount: 3 } });
    expect(created.status()).toBe(201);
    const poll = (await created.json()).data; tokens.push(poll.token); expect(poll.durationMinutes).toBeNull();
    const path = `/api/v1/time-polls/${poll.token}`, publicPath = `/api/public/time-polls/${poll.token}`;
    const fullDay = Array.from({ length: 48 }, (_, n) => n);
    expect((await request.put(`${path}/response`, { headers, data: { displayName: "Host", slotIds: fullDay } })).status()).toBe(200);
    const browser = await engine.launch();
    const context = await browser.newContext({ baseURL, viewport: { width: 1440, height: 1100 } });
    const guestB = await browser.newContext({ baseURL });
    try {
      const page = await context.newPage();
      await page.goto(`/time-polls/${poll.token}`);
      await page.getByLabel("本次计划中的昵称").fill("整天有空的朋友");
      await page.getByRole("button", { name: "开始 / 继续填写", exact: true }).click();
      await page.getByTestId(`time-poll-day-${dates[0]}`).click();
      await expect(page.getByRole("status")).toHaveText("已自动保存");
      const joined = await guestB.request.post(`${publicPath}/participant`, { data: { displayName: "上午有空的朋友" } });
      const idB = (await joined.json()).data.viewerId;
      expect((await guestB.request.put(`${publicPath}/response`, { data: { participantId: idB, displayName: "上午有空的朋友", slotIds: fullDay.slice(0, 16) } })).status()).toBe(200);
      await page.reload(); await page.getByRole("button", { name: "大家的结果", exact: true }).click();
      await expect(page.getByRole("heading", { name: "选择空闲时间", exact: true })).toBeVisible();
      await expect(page.getByText("人数最多的时间", { exact: true })).toHaveCount(0);
      await expect(page.getByText("所有人都方便的时间", { exact: true })).toHaveCount(0);
      await expect(page.getByText("还没有可推荐的完整时段。", { exact: true })).toHaveCount(0);
      await expect(page.getByTestId("time-poll-result-0")).toHaveText("3");
      await expect(page.getByTestId("time-poll-result-16")).toHaveText("2");
      expect(await page.getByTestId("time-poll-grid").evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
      await page.screenshot({ path: `/tmp/sideseat-timetable108-qa/${engineName}-desktop-results.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.getByTestId("time-poll-grid").evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `/tmp/sideseat-timetable108-qa/${engineName}-mobile-results.png`, fullPage: true });
      await page.getByRole("button", { name: "Switch to English", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Group timetable", exact: true })).toBeVisible();
      await expect(page.getByText("Best available times", { exact: true })).toHaveCount(0);
      const current = (await (await request.get(path, { headers })).json()).data;
      const body = { start: poll.slots[0].start, attendeeIds: current.participants.map((p: { id: string }) => p.id) };
      const invite = async (version: number, end?: string) => {
        const r = await request.post(`${path}/invitations`, { headers, data: { ...body, version, ...(end ? { end } : {}) } });
        expect(r.status()).toBe(200); return (await r.json()).data;
      };
      const legacy = await invite(0); expect(legacy.chosenEnd).toBe(poll.slots[3].end);
      const half = await invite(1, poll.slots[15].end); expect(half.chosenEnd).toBe(poll.slots[15].end);
      const full = await invite(2, poll.slots[47].end); expect(full.chosenEnd).toBe(poll.slots[47].end);
      expect(new Date(full.chosenEnd).getTime() - new Date(full.chosenStart).getTime()).toBe(12 * 3600000);
      expect((await request.post(`${path}/invitations`, { headers, data: { ...body, version: 3, end: body.start } })).status()).toBe(422);
      expect(await prisma.calendarEntry.count({ where: { timePoll: { token: poll.token } } })).toBe(0);
      await page.reload();
      await page.getByRole("button", { name: "Confirm participation", exact: true }).click();
      expect((await guestB.request.put(`${publicPath}/invitation-response`, { data: { participantId: idB, version: 3, status: "ACCEPTED" } })).status()).toBe(200);
      const entries = await prisma.calendarEntry.findMany({ where: { timePoll: { token: poll.token } } });
      expect(entries).toHaveLength(1);
      expect(entries[0].startAt.toISOString()).toBe(full.chosenStart); expect(entries[0].endAt.toISOString()).toBe(full.chosenEnd);
      expect((await request.post(`${path}/cancel`, { headers, data: { version: 3 } })).status()).toBe(200);
    } finally { await context.close(); await guestB.close(); await browser.close(); }
  });
}

test("a 24-hour manual range keeps both registered calendars' exact start and end", async ({ request, page }) => {
  const login = await request.post("/api/v1/auth/login", { data: { identifier: "test_002", password: "Password123", device: { id: randomUUID(), name: "Full day QA", appVersion: "1.0.0", platformVersion: "26.0" } } });
  const otherHeaders = { Authorization: `Bearer ${(await login.json()).data.tokens.accessToken}` };
  const date = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  const created = await request.post("/api/v1/time-polls", { headers: { ...headers, "Idempotency-Key": randomUUID() }, data: { title: "Full day range QA", timeZone: "Europe/Berlin", dates: [date], startMinute: 0, endMinute: 1440, planningMode: "COLLECT", expectedCount: 2 } });
  expect(created.status()).toBe(201); const poll = (await created.json()).data; tokens.push(poll.token);
  const path = `/api/v1/time-polls/${poll.token}`;
  for (const h of [headers, otherHeaders]) expect((await request.put(`${path}/response`, { headers: h, data: { displayName: h === headers ? "Host" : "Friend", slotIds: poll.slots.map((s: { id: number }) => s.id) } })).status()).toBe(200);
  const current = (await (await request.get(path, { headers })).json()).data;
  const invited = await request.post(`${path}/invitations`, { headers, data: { version: 0, start: poll.slots[0].start, end: poll.slots.at(-1).end, attendeeIds: current.participants.map((p: { id: string }) => p.id) } });
  expect(invited.status()).toBe(200); const chosen = (await invited.json()).data;
  expect(new Date(chosen.chosenEnd).getTime() - new Date(chosen.chosenStart).getTime()).toBe(24 * 3600000);
  expect((await request.put(`${path}/invitation-response`, { headers: otherHeaders, data: { version: 1, status: "ACCEPTED" } })).status()).toBe(200);
  const entries = await prisma.calendarEntry.findMany({ where: { timePoll: { token: poll.token } } });
  expect(entries).toHaveLength(2);
  for (const entry of entries) { expect(entry.startAt.toISOString()).toBe(chosen.chosenStart); expect(entry.endAt.toISOString()).toBe(chosen.chosenEnd); }
  try {
    await page.goto(`/time-polls/${poll.token}`);
    const dateFormatter = new Intl.DateTimeFormat("zh-CN", { timeZone: "Europe/Berlin", month: "short", day: "numeric", weekday: "short" });
    await expect(page.getByRole("main")).toContainText(dateFormatter.format(new Date(chosen.chosenStart)));
    await expect(page.getByRole("main")).toContainText(dateFormatter.format(new Date(chosen.chosenEnd)));
  } finally { await page.close(); }
  expect((await request.post(`${path}/cancel`, { headers, data: { version: 1 } })).status()).toBe(200);
});
