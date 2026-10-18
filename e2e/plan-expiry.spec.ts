import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const db = new PrismaClient();
const polls: string[] = [];
test.afterAll(async () => { await db.timePoll.deleteMany({ where: { token: { in: polls } } }); await db.$disconnect(); });

test("expired invitations and collections close in API and guest UI without calendar writes", async ({ request, browser, baseURL }) => {
  const login = await request.post("/api/v1/auth/login", { data: { identifier: "test_001", password: "Password123", device: { id: randomUUID(), name: "Expiry QA", appVersion: "1.0.0", platformVersion: "26.0" } } });
  expect(login.status()).toBe(200);
  const headers = { Authorization: `Bearer ${(await login.json()).data.tokens.accessToken}` };
  const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  for (const mode of ["FIXED", "COLLECT"]) {
    const result = await request.post("/api/v1/time-polls", { headers: { ...headers, "Idempotency-Key": randomUUID() }, data: {
      title: `Expiry QA ${mode}`, timeZone: "Europe/Berlin", dates: [future], startMinute: 540, endMinute: 600, planningMode: mode, expectedCount: 2,
      ...(mode === "FIXED" ? { fixedStart: `${future}T12:00:00Z`, durationMinutes: 60 } : {}),
    } });
    expect(result.status()).toBe(201); const poll = (await result.json()).data; polls.push(poll.token);
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    const path = `/api/public/time-polls/${poll.token}`;
    const joined = await context.request.post(`${path}/participant`, { data: { displayName: "Expiry guest" } });
    expect(joined.status()).toBe(200); const participantId = (await joined.json()).data.viewerId;
    // Simulate crossing the deadline only in this disposable local database.
    await db.timePoll.update({ where: { token: poll.token }, data: mode === "FIXED"
      ? { chosenStart: new Date(Date.now() - 1000) }
      : { dates: [new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10)] } });
    const detail = await request.get(`/api/v1/time-polls/${poll.token}`, { headers });
    expect((await detail.json()).data.phase).toBe("EXPIRED");
    const list = (await (await request.get("/api/v1/time-polls", { headers })).json()).data.polls;
    expect(list.find((p: { token: string }) => p.token === poll.token).phase).toBe("EXPIRED");
    expect((await context.request.put(`${path}/${mode === "FIXED" ? "invitation-response" : "response"}`, { data: mode === "FIXED"
      ? { participantId, version: 1, status: "ACCEPTED" } : { participantId, displayName: "Expiry guest", slotIds: [0, 1] } })).status()).toBe(409);
    expect((await request.patch(`/api/v1/time-polls/${poll.token}/display-name`, { headers, data: { displayName: "Changed" } })).status()).toBe(409);
    expect((await context.request.post(`${path}/participant`, { data: { displayName: "Too late" } })).status()).toBe(409);
    await page.goto(`/time-polls/${poll.token}`);
    await expect(page.getByRole("heading", { name: "计划已过期", exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toContainText("未添加到任何日历");
    await expect(page.getByRole("button", { name: "确认参加", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("time-poll-cell-0")).toHaveCount(0);
    expect(await db.calendarEntry.count({ where: { timePoll: { token: poll.token } } })).toBe(0);
    expect((await request.delete(`/api/v1/time-polls/${poll.token}`, { headers })).status()).toBe(200);
    await context.close();
  }
});

test("elapsed chat invitations are expired in list/detail, absent from attention count, and cannot be accepted", async ({ request }) => {
  const users = await db.user.findMany({ where: { username: { in: ["test_003", "test_004"] } }, orderBy: { username: "asc" } });
  const connection = await db.connection.create({ data: { userAId: users[0].id, userBId: users[1].id, status: "ACTIVE" } });
  try {
    const plan = await db.planRequest.create({ data: { connectionId: connection.id, proposerUserId: users[0].id, receiverUserId: users[1].id, planType: "CUSTOM", title: "Elapsed chat invite", startTime: new Date(Date.now() - 3600000), endTime: new Date(Date.now() - 1800000), status: "PENDING" } });
    const login = await request.post("/api/v1/auth/login", { data: { identifier: "test_004", password: "Password123", device: { id: randomUUID(), name: "Chat expiry QA", appVersion: "1.0.0", platformVersion: "26.0" } } });
    const headers = { Authorization: `Bearer ${(await login.json()).data.tokens.accessToken}` };
    const list = (await (await request.get("/api/v1/plans", { headers })).json()).data.plans;
    expect(list.find((p: { id: string }) => p.id === plan.id).status).toBe("EXPIRED");
    expect((await (await request.get(`/api/v1/plans/${plan.id}`, { headers })).json()).data.plan.status).toBe("EXPIRED");
    expect((await (await request.get("/api/v1/inbox", { headers })).json()).data.plansNeedingYourAction).toBe(0);
    expect((await request.post(`/api/v1/plans/${plan.id}/accept`, { headers: { ...headers, "Idempotency-Key": randomUUID() }, data: {} })).status()).toBe(409);
    expect(await db.calendarEntry.count({ where: { planRequestId: plan.id } })).toBe(0);
  } finally { await db.connection.delete({ where: { id: connection.id } }); }
});
