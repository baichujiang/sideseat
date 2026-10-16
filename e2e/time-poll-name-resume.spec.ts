import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chromium, webkit, expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const tokens: string[] = [];
let headers: { Authorization: string };
test.beforeAll(async ({ request }) => {
  const login = await request.post("/api/v1/auth/login", { data: { identifier: "test_001", password: "Password123", device: { id: randomUUID(), name: "Name resume QA", appVersion: "1.0.0", platformVersion: "26.0" } } });
  expect(login.status()).toBe(200);
  headers = { Authorization: `Bearer ${(await login.json()).data.tokens.accessToken}` };
});
test.afterAll(async () => { await prisma.timePoll.deleteMany({ where: { token: { in: tokens } } }); await prisma.$disconnect(); });
async function create(request: APIRequestContext) {
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const response = await request.post("/api/v1/time-polls", { headers: { ...headers, "Idempotency-Key": randomUUID() }, data: { title: "Same-name return QA", timeZone: "Europe/Berlin", dates: [date], startMinute: 540, endMinute: 660, durationMinutes: 60, expectedCount: 3 } });
  expect(response.status()).toBe(201);
  const poll = (await response.json()).data; tokens.push(poll.token); return poll;
}
async function enter(page: Page, name: string) {
  await page.getByLabel("本次计划中的昵称").fill(name);
  await page.getByRole("button", { name: "开始 / 继续填写", exact: true }).click();
  await expect(page.getByRole("button", { name: "编辑昵称", exact: true })).toBeVisible();
}

for (const [engineName, engine] of [["chromium", chromium], ["webkit", webkit]] as const) {
  test(`${engineName}: same name resumes across browsers, clears cookies, renames and confirms without another vote`, async ({ request, baseURL }) => {
    test.setTimeout(180000);
    const poll = await create(request), publicPath = `/api/public/time-polls/${poll.token}`, nativePath = `/api/v1/time-polls/${poll.token}`;
    expect((await request.put(`${nativePath}/response`, { headers, data: { displayName: "Host", slotIds: [0, 1, 2, 3] } })).status()).toBe(200);
    const browser = await engine.launch();
    const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })));
    try {
      const [a, b, c] = await Promise.all(contexts.map((context) => context.newPage()));
      await a.goto(`/time-polls/${poll.token}`); await enter(a, "小林");
      for (const id of [0, 2]) await a.getByTestId(`time-poll-cell-${id}`).click();
      await expect(a.getByRole("status")).toHaveText("已自动保存");
      const first = (await (await contexts[0].request.get(publicPath)).json()).data;
      const responseId = first.participants.find((p: { isMe: boolean }) => p.isMe).id;
      await b.goto(`/time-polls/${poll.token}`); await enter(b, "  小林  ");
      await expect(b.getByText("已找到这个名字的参与记录，可以继续操作。", { exact: true })).toBeVisible();
      for (const id of [0, 2]) await expect(b.getByTestId(`time-poll-cell-${id}`)).toHaveAttribute("aria-pressed", "true");
      const resumed = (await (await contexts[1].request.get(publicPath)).json()).data;
      expect(resumed.viewerId).toBe(first.viewerId); expect(resumed.participants).toHaveLength(2);
      expect(resumed.participants.find((p: { isMe: boolean }) => p.isMe).id).toBe(responseId);
      await b.getByTestId("time-poll-cell-2").click(); await expect(b.getByRole("status")).toHaveText("已自动保存");
      await a.reload(); await expect(a.getByTestId("time-poll-cell-2")).toHaveAttribute("aria-pressed", "false");
      expect((await (await contexts[0].request.get(publicPath)).json()).data.mySlotIds).toEqual([0, 1]);
      await b.getByRole("button", { name: "编辑昵称", exact: true }).click();
      await b.getByLabel("本次计划中的昵称").fill("小林（同班）"); await b.getByRole("button", { name: "保存昵称", exact: true }).click();
      await expect(b.getByRole("button", { name: "编辑昵称", exact: true })).toBeVisible();
      // An older browser's availability save cannot undo the explicit rename.
      expect((await contexts[0].request.put(`${publicPath}/response`, { data: { participantId: first.viewerId, displayName: "小林", slotIds: [0, 1] } })).status()).toBe(200);
      expect((await (await contexts[0].request.get(publicPath)).json()).data.myDisplayName).toBe("小林（同班）");
      await b.getByRole("button", { name: "切换填写人", exact: true }).click(); await enter(b, "小周");
      for (const id of [0, 2]) await b.getByTestId(`time-poll-cell-${id}`).click();
      await expect(b.getByRole("status")).toHaveText("已自动保存");
      await b.getByRole("button", { name: "切换填写人", exact: true }).click(); await enter(b, "小林（同班）");
      await b.getByTestId("time-poll-cell-2").click(); await expect(b.getByRole("status")).toHaveText("已自动保存");
      await contexts[1].clearCookies(); await b.reload(); await enter(b, "小林（同班）");
      for (const id of [0, 2]) await expect(b.getByTestId(`time-poll-cell-${id}`)).toHaveAttribute("aria-pressed", "true");
      await b.getByRole("button", { name: "编辑昵称", exact: true }).click();
      await b.getByLabel("本次计划中的昵称").fill("小周"); await b.getByRole("button", { name: "保存昵称", exact: true }).click();
      await expect(b.getByRole("alert").filter({ hasText: "这个名字已有填写" })).toBeVisible();
      await b.getByRole("button", { name: "取消", exact: true }).click();
      const native = (await (await request.get(nativePath, { headers })).json()).data;
      expect(native.participants).toHaveLength(3); expect(native.participants.filter((p: { isGuest: boolean }) => p.isGuest)).toHaveLength(2);
      expect(native.participants.find((p: { displayName: string }) => p.displayName === "小林（同班）").id).toBe(responseId);
      await b.screenshot({ path: `/tmp/sideseat-name-resume-qa/${engineName}-resumed.png`, fullPage: true });
      expect((await request.post(`${nativePath}/invitations`, { headers, data: { version: 0, start: poll.slots[0].start, attendeeIds: native.participants.map((p: { id: string }) => p.id) } })).status()).toBe(200);
      await b.reload(); await b.getByRole("button", { name: "确认参加", exact: true }).click();
      await expect(b.getByRole("button", { name: "你已确认参加", exact: true })).toBeDisabled();
      await c.goto(`/time-polls/${poll.token}`); await enter(c, "小周");
      await c.getByRole("button", { name: "确认参加", exact: true }).click();
      await expect(c.getByRole("heading", { name: "计划已确定", exact: true })).toBeVisible();
      const calendar = await prisma.calendarEntry.findMany({ where: { timePoll: { token: poll.token } }, include: { companions: true } });
      expect(calendar).toHaveLength(1); expect(calendar[0].companions.map((p) => p.displayName).sort()).toEqual(["小周", "小林（同班）"].sort());
      expect((await request.post(`${nativePath}/cancel`, { headers, data: { version: 1 } })).status()).toBe(200);
    } finally { await Promise.all(contexts.map((context) => context.close())); await browser.close(); }
  });
}

test("concurrent names reuse one guest; legacy credentials and poll isolation remain usable", async ({ browser, request, baseURL }) => {
  const poll = await create(request), other = await create(request);
  const path = `/api/public/time-polls/${poll.token}`;
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ baseURL })));
  try {
    const replies = await Promise.all(contexts.map((c, n) => c.request.post(`${path}/participant`, { data: { displayName: n ? "alice" : "Alice" } })));
    for (const response of replies) expect(response.status()).toBe(200);
    const data = await Promise.all(replies.map(async (response) => (await response.json()).data));
    expect(data[0].viewerId).toBe(data[1].viewerId);
    expect(await prisma.timePollGuest.count({ where: { poll: { token: poll.token } } })).toBe(1);
    expect((await (await contexts[0].request.get(`/api/public/time-polls/${other.token}`)).json()).data.viewerId).toBeNull();
    const secret = randomBytes(32).toString("base64url");
    const otherPoll = await prisma.timePoll.findUniqueOrThrow({ where: { token: other.token } });
    const legacy = await prisma.timePollGuest.create({ data: { pollId: otherPoll.id, displayName: "Legacy", credentialHash: createHash("sha256").update(secret).digest("hex") } });
    await contexts[0].addCookies([{ name: "sideseat_poll_guest", value: secret, domain: new URL(baseURL!).hostname, path: "/api/public/time-polls", httpOnly: true, sameSite: "Lax" }]);
    expect((await (await contexts[0].request.get(`/api/public/time-polls/${other.token}`)).json()).data.viewerId).toBe(legacy.id);
    const resumed = await contexts[1].request.post(`/api/public/time-polls/${other.token}/participant`, { data: { displayName: "Legacy" } });
    expect((await resumed.json()).data.viewerId).toBe(legacy.id);
    expect((await (await contexts[0].request.get(`/api/public/time-polls/${other.token}`)).json()).data.viewerId).toBe(legacy.id);
  } finally { await Promise.all(contexts.map((context) => context.close())); }
});
