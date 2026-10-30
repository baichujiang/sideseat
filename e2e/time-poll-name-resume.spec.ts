import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chromium, webkit, expect, test, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const tokens: string[] = [];
let headers: { Authorization: string };
test.beforeAll(async ({ request }) => {
  const login = await request.post("/api/v1/auth/login", { data: { identifier: "test_001", password: "Password123", device: { id: randomUUID(), name: "Private guest identity QA", appVersion: "1.0.0", platformVersion: "26.0" } } });
  expect(login.status()).toBe(200);
  headers = { Authorization: `Bearer ${(await login.json()).data.tokens.accessToken}` };
});
test.afterAll(async () => { await prisma.timePoll.deleteMany({ where: { token: { in: tokens } } }); await prisma.$disconnect(); });
async function create(request: APIRequestContext) {
  const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const response = await request.post("/api/v1/time-polls", { headers: { ...headers, "Idempotency-Key": randomUUID() }, data: { title: "Private guest identity QA", timeZone: "Europe/Berlin", dates: [date], startMinute: 540, endMinute: 720, durationMinutes: 60, expectedCount: 3 } });
  expect(response.status()).toBe(201);
  const poll = (await response.json()).data; tokens.push(poll.token); return poll;
}
async function enter(page: Page, name: string) {
  await page.getByLabel("你的名字", { exact: true }).fill(name);
  await page.getByRole("button", { name: "选择空闲时间", exact: true }).click();
  await expect(page.getByRole("button", { name: "编辑昵称", exact: true })).toBeVisible();
}
async function save(page: Page, ids: number[]) {
  for (const id of ids) await page.getByTestId(`time-poll-cell-${id}`).click();
  await page.getByTestId("availability-submit").click();
  await expect(page.getByText("已提交空闲", { exact: true })).toBeVisible();
}
async function personalLink(page: Page) {
  const panel = page.getByTestId("guest-recovery-panel");
  if (!await panel.getAttribute("open").then(value => value !== null)) await panel.locator("summary").click();
  const response = page.waitForResponse(r => r.url().includes("/participant/recovery?") && r.request().method() === "GET");
  await page.getByTestId("guest-recovery-copy").click();
  const result = await response; expect(result.status()).toBe(200);
  return (await result.json()).data.recoveryUrl as string;
}
const snapshot = async (context: BrowserContext, path: string) => (await (await context.request.get(path)).json()).data;
const recoveryCredential = (url: string) => new URLSearchParams(new URL(url).hash.slice(1)).get("recover")!;

for (const [engineName, engine] of [["chromium", chromium], ["webkit", webkit]] as const) {
  test(`${engineName}: first fill, return, private recovery after clearing data, same names and invitation stay independent`, async ({ request, baseURL }) => {
    test.setTimeout(240000);
    const poll = await create(request), path = `/api/public/time-polls/${poll.token}`, native = `/api/v1/time-polls/${poll.token}`;
    expect((await request.put(`${native}/response`, { headers, data: { displayName: "Host", slotIds: [0, 1] } })).status()).toBe(200);
    const browser = await engine.launch();
    const contexts = await Promise.all([0, 1].map(() => browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })));
    try {
      let a = await contexts[0].newPage(); const b = await contexts[1].newPage();
      await a.goto(`/time-polls/${poll.token}`); await enter(a, "小林");
      await expect(a.getByTestId("guest-recovery-panel").locator("summary")).toBeVisible();
      const privateLink = await personalLink(a);
      expect(new URL(privateLink).pathname).toBe(`/time-poll-recovery/${poll.token}`); expect(new URL(privateLink).search).toBe(""); expect(recoveryCredential(privateLink).length > 60).toBe(true);
      await save(a, [0]);
      const first = await snapshot(contexts[0], path), responseId = first.participants.find((p: { isMe: boolean }) => p.isMe).id;
      expect(first.mySlotIds).toEqual([0, 1]);
      const cookie = (await contexts[0].cookies()).find(c => c.name === "sideseat_poll_access_v2");
      expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path });
      const own = await prisma.timePollGuest.findUniqueOrThrow({ where: { id: first.viewerId } });
      expect(own.credentialHash.startsWith("v2:")).toBe(true);
      expect(own.credentialHash.includes(recoveryCredential(privateLink).split(".")[1])).toBe(false);
      await a.close(); a = await contexts[0].newPage(); await a.goto(`/time-polls/${poll.token}`);
      await expect(a.getByTestId("time-poll-cell-0")).toHaveAttribute("aria-pressed", "true");
      expect((await snapshot(contexts[0], path)).viewerId).toBe(first.viewerId);
      await save(a, [2]);
      await b.goto(`/time-polls/${poll.token}`); await enter(b, "小林"); await save(b, [4]);
      const second = await snapshot(contexts[1], path); expect(second.viewerId === first.viewerId).toBe(false);
      expect(second.mySlotIds).toEqual([4, 5]); expect(second.participants).toHaveLength(3);
      for (const [method, suffix, data] of [["PUT", "/response", { participantId: first.viewerId, displayName: "小林", slotIds: [] }], ["PATCH", "/participant", { participantId: first.viewerId, displayName: "Hijack" }]] as const) {
        expect((await contexts[1].request.fetch(path + suffix, { method, data })).status()).toBe(401);
      }
      expect((await contexts[1].request.get(`${path}/participant/recovery?participantId=${first.viewerId}`)).status()).toBe(401);
      await contexts[0].clearCookies(); await a.evaluate(() => localStorage.clear()); await a.reload();
      await expect(a.getByLabel("你的名字", { exact: true })).toBeVisible();
      expect((await snapshot(contexts[0], path)).viewerId).toBeNull();
      const exposedUrls: string[] = []; a.on("request", r => exposedUrls.push(r.url()));
      await a.goto(new URL(privateLink).pathname + new URL(privateLink).hash);
      await expect(a.getByText("已恢复你的填写，可以继续修改。", { exact: true })).toBeVisible();
      expect(new URL(a.url()).hash).toBe("");
      expect(exposedUrls.some(url => url.includes(recoveryCredential(privateLink)))).toBe(false);
      const recovered = await snapshot(contexts[0], path);
      expect(recovered.viewerId).toBe(first.viewerId); expect(recovered.mySlotIds).toEqual([0, 1, 2, 3]);
      expect(recovered.participants.find((p: { isMe: boolean }) => p.isMe).id).toBe(responseId);
      await save(a, [2]); expect((await snapshot(contexts[1], path)).mySlotIds).toEqual([4, 5]);
      await contexts[0].clearCookies(); await a.close(); a = await contexts[0].newPage();
      await a.goto(new URL(privateLink).pathname + new URL(privateLink).hash);
      await expect(a.getByText("已恢复你的填写，可以继续修改。", { exact: true })).toBeVisible();
      expect((await snapshot(contexts[0], path)).viewerId).toBe(first.viewerId);
      const nativeData = (await (await request.get(native, { headers })).json()).data;
      expect(nativeData.participants.filter((p: { isGuest: boolean }) => p.isGuest)).toHaveLength(2);
      const response = await request.post(`${native}/invitations`, { headers, data: { version: 0, start: poll.slots[0].start, attendeeIds: nativeData.participants.map((p: { id: string }) => p.id) } });
      expect(response.status()).toBe(200);
      expect((await contexts[1].request.put(`${path}/invitation-response`, { data: { participantId: first.viewerId, status: "ACCEPTED", version: 1 } })).status()).toBe(401);
      for (const page of [a, b]) {
        await page.reload();
        const accepted = page.waitForResponse(r => r.url().endsWith("/invitation-response") && r.request().method() === "PUT");
        await page.getByRole("button", { name: "确认参加", exact: true }).click();
        expect((await accepted).status()).toBe(200);
      }
      expect(await prisma.timePollInvitation.count({ where: { poll: { token: poll.token }, status: "ACCEPTED", guestId: { not: null } } })).toBe(2);
      expect((await request.post(`${native}/publish`, { headers, data: { version: 1 } })).status()).toBe(200);
      expect(await prisma.calendarEntry.count({ where: { timePoll: { token: poll.token } } })).toBe(1);
      await a.reload(); await expect(a.getByRole("heading", { name: "计划已确定", exact: true })).toBeVisible();
      await a.getByTestId("plan-invitation").screenshot({ path: `/tmp/sideseat-guest-identity-${engineName}-confirmed.png` });
      console.log(`${engineName}: first fill → return → same-name isolation → clear data → private recovery → individual invitation replies → organizer Calendar passed`);
    } finally { await Promise.all(contexts.map(c => c.close())); await browser.close(); }
  });
}

test("legacy random credentials upgrade; unsigned cookies cannot claim records; organizer recovery preserves old data", async ({ browser, request, baseURL }) => {
  const poll = await create(request), other = await create(request), path = `/api/public/time-polls/${poll.token}`;
  const dbPoll = await prisma.timePoll.findUniqueOrThrow({ where: { token: poll.token } });
  const oldSecret = randomBytes(32).toString("base64url");
  const verified = await prisma.timePollGuest.create({ data: { pollId: dbPoll.id, displayName: "旧游客", credentialHash: createHash("sha256").update(oldSecret).digest("hex") } });
  const unverified = await prisma.timePollGuest.create({ data: { pollId: dbPoll.id, displayName: "旧游客", credentialHash: createHash("sha256").update(randomBytes(32)).digest("hex") } });
  const rows = await Promise.all([verified, unverified].map((guest, index) => prisma.timePollResponse.create({ data: { pollId: dbPoll.id, guestId: guest.id, displayName: guest.displayName, slotIds: [index * 2, index * 2 + 1] } })));
  expect((await request.put(`/api/v1/time-polls/${poll.token}/response`, { headers, data: { displayName: "Host", slotIds: [0, 1] } })).status()).toBe(200);
  const roster = (await (await request.get(`/api/v1/time-polls/${poll.token}`, { headers })).json()).data;
  expect((await request.post(`/api/v1/time-polls/${poll.token}/invitations`, { headers, data: { version: 0, start: poll.slots[0].start, attendeeIds: roster.participants.map((p: { id: string }) => p.id) } })).status()).toBe(200);
  const oldInvitation = await prisma.timePollInvitation.update({ where: { pollId_guestId: { pollId: dbPoll.id, guestId: unverified.id } }, data: { status: "ACCEPTED" } });
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ baseURL })));
  try {
    const host = new URL(baseURL!).hostname;
    await contexts[0].addCookies([{ name: "sideseat_poll_guest", value: oldSecret, domain: host, path: "/api/public/time-polls", httpOnly: true }, { name: "sideseat_poll_participant", value: unverified.id, domain: host, path, httpOnly: true }]);
    const upgraded = await snapshot(contexts[0], path); expect(upgraded.viewerId).toBe(verified.id); expect(upgraded.mySlotIds).toEqual([0, 1]);
    expect((await contexts[0].cookies()).some(c => c.name === "sideseat_poll_access_v2")).toBe(true);
    expect((await prisma.timePollGuest.findUniqueOrThrow({ where: { id: verified.id } })).credentialHash.startsWith("v2:")).toBe(true);
    await contexts[1].addCookies([{ name: "sideseat_poll_participant", value: unverified.id, domain: host, path, httpOnly: true }]);
    expect((await snapshot(contexts[1], path))).toMatchObject({ viewerId: null, legacyGuestNeedsRecovery: true });
    expect((await contexts[1].request.put(`${path}/response`, { data: { participantId: unverified.id, displayName: "旧游客", slotIds: [] } })).status()).toBe(401);
    const page = await contexts[1].newPage(); await page.goto(`/time-polls/${poll.token}`); await expect(page.getByTestId("legacy-guest-recovery")).toBeVisible();
    expect((await request.post(`/api/v1/time-polls/${poll.token}/guest-recovery`, { data: { participantId: rows[1].id } })).status()).toBe(401);
    const outsiderName = "guestoutsider_" + randomBytes(5).toString("hex"), outsiderPassword = randomBytes(20).toString("base64url");
    expect((await request.post("/api/auth/signup", { data: { username: outsiderName, password: outsiderPassword, displayName: "Other organizer", school: "TUM", studentStatus: "CURRENT_STUDENT", degreeLevel: "BACHELOR", semester: 3 } })).status()).toBe(201);
    const outsider = (await (await request.post("/api/v1/auth/login", { data: { identifier: outsiderName, password: outsiderPassword, device: { id: randomUUID(), name: "Guest isolation QA", appVersion: "1.0.0", platformVersion: "26.0" } } })).json()).data.tokens.accessToken;
    try {
      expect((await request.post(`/api/v1/time-polls/${poll.token}/guest-recovery`, { headers: { Authorization: `Bearer ${outsider}` }, data: { participantId: rows[1].id } })).status()).toBe(404);
    } finally { expect((await request.delete("/api/v1/me", { headers: { Authorization: `Bearer ${outsider}`, "Idempotency-Key": randomUUID() }, data: { confirmUsername: outsiderName } })).status()).toBe(200); }
    const issue = async () => {
      const r = await request.post(`/api/v1/time-polls/${poll.token}/guest-recovery`, { headers, data: { participantId: rows[1].id } }); expect(r.status()).toBe(200); return (await r.json()).data.recoveryUrl as string;
    };
    const replaced = await issue(), link = await issue();
    expect((await contexts[2].request.post(`${path}/participant/recovery`, { data: { credential: recoveryCredential(replaced) } })).status()).toBe(401);
    expect((await contexts[2].request.post(`/api/public/time-polls/${other.token}/participant/recovery`, { data: { credential: recoveryCredential(link) } })).status()).toBe(401);
    await page.goto(new URL(link).pathname + new URL(link).hash);
    await expect(page.getByText("已恢复你的填写，可以继续修改。", { exact: true })).toBeVisible();
    const restored = await snapshot(contexts[1], path); expect(restored.viewerId).toBe(unverified.id); expect(restored.mySlotIds).toEqual([2, 3]);
    expect(restored.participants.find((p: { isMe: boolean }) => p.isMe).id).toBe(rows[1].id);
    expect(restored.invitations.find((p: { isMe: boolean }) => p.isMe)).toMatchObject({ id: oldInvitation.id, status: "ACCEPTED" });
    expect(await prisma.calendarEntry.count({ where: { timePollId: dbPoll.id } })).toBe(0);
    expect((await request.post(`/api/v1/time-polls/${poll.token}/guest-recovery`, { headers, data: { participantId: rows[1].id } })).status()).toBe(409);
    expect(await prisma.timePollGuest.count({ where: { pollId: dbPoll.id } })).toBe(2);
    await contexts[2].addCookies([{ name: "sideseat_poll_access_v2", value: `${unverified.id}.${"x".repeat(43)}`, domain: host, path, httpOnly: true }]);
    expect((await snapshot(contexts[2], path)).viewerId).toBeNull();
    expect((await prisma.timePollResponse.findUniqueOrThrow({ where: { id: rows[1].id } })).slotIds).toEqual([2, 3]);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});

test("concurrent identical display names create different credentials and rows", async ({ browser, request, baseURL }) => {
  const poll = await create(request), path = `/api/public/time-polls/${poll.token}`;
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ baseURL })));
  try {
    const data = await Promise.all(contexts.map(async c => {
      const r = await c.request.post(`${path}/participant`, { data: { displayName: "Alice" } }); expect(r.status()).toBe(200); return (await r.json()).data;
    }));
    expect(data[0].viewerId === data[1].viewerId).toBe(false);
    expect(await prisma.timePollGuest.count({ where: { poll: { token: poll.token } } })).toBe(2);
    expect((await contexts[0].request.patch(`${path}/participant`, { data: { participantId: data[0].viewerId, displayName: "Alice" } })).status()).toBe(200);
    expect((await contexts[1].request.put(`${path}/response`, { data: { participantId: data[0].viewerId, displayName: "Alice", slotIds: [] } })).status()).toBe(401);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});
