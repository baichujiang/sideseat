import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
const pollTokens: string[] = [];
test.afterAll(async () => { await prisma.timePoll.deleteMany({ where: { token: { in: pollTokens } } }); await prisma.$disconnect(); });

test("five people coordinate, choose a result, confirm individually and sync one shared plan to every calendar", async ({ request }) => {
  const tokens: string[] = [];
  for (let n = 1; n <= 5; n++) {
    const login = await request.post("/api/v1/auth/login", { data: { identifier: `test_00${n}`, password: "Password123", device: { id: randomUUID(), name: "Unified plan QA", appVersion: "1.0.0", platformVersion: "26.0" } } });
    expect(login.status()).toBe(200); tokens.push((await login.json()).data.tokens.accessToken);
  }
  const headers = (n: number) => ({ Authorization: `Bearer ${tokens[n]}` });
  const future = new Date(); future.setUTCDate(future.getUTCDate() + 2);
  const date = future.toISOString().slice(0, 10);
  const created = await request.post("/api/v1/time-polls", { headers: { ...headers(0), "Idempotency-Key": randomUUID() }, data: { title: "Five-person unified plan", location: "Library", timeZone: "Europe/Berlin", dates: [date], startMinute: 540, endMinute: 720, durationMinutes: 60, expectedCount: 5, planningMode: "COLLECT" } });
  expect(created.status()).toBe(201);
  let poll = (await created.json()).data; const token = poll.token; pollTokens.push(token);
  const detail = async (n = 0) => (await (await request.get(`/api/v1/time-polls/${token}`, { headers: headers(n) })).json()).data;
  const save = async (n: number, slotIds = [0, 1, 2, 3]) => {
    const response = await request.put(`/api/v1/time-polls/${token}/response`, { headers: headers(n), data: { displayName: `Person ${n + 1}`, slotIds } });
    expect(response.status()).toBe(200); return (await response.json()).data;
  };
  for (let n = 0; n < 3; n++) poll = await save(n);
  expect(poll.summary).toMatchObject({ participantCount: 3, maximum: 3, common: false });
  expect(poll.expectedCount).toBe(5);
  await save(3); poll = await save(4);
  expect(poll.summary).toMatchObject({ maximum: 5, common: true });
  poll = await save(4, []);
  expect(poll.summary).toMatchObject({ maximum: 4, common: false });
  expect(poll.summary.windows[0].end).toBe(poll.slots[3].end);
  poll = await save(4);
  const send = async (version: number) => {
    const response = await request.post(`/api/v1/time-polls/${token}/invitations`, { headers: headers(0), data: { version, start: poll.slots[0].start, attendeeIds: poll.participants.map((p: { id: string }) => p.id) } });
    expect(response.status()).toBe(200); return (await response.json()).data;
  };
  poll = await send(0);
  expect(poll.phase).toBe("INVITING"); expect(poll.invitations).toHaveLength(5);
  expect(poll.invitations.filter((i: { status: string }) => i.status === "ACCEPTED")).toHaveLength(1);
  const where = { timePoll: { token } };
  expect(await prisma.calendarEntry.count({ where })).toBe(0);
  const decline = await request.put(`/api/v1/time-polls/${token}/invitation-response`, { headers: headers(4), data: { version: 1, status: "DECLINED" } });
  expect(decline.status()).toBe(200); expect((await decline.json()).data.phase).toBe("INVITING");
  poll = await send(1); expect(poll.invitationVersion).toBe(2);
  expect((await request.put(`/api/v1/time-polls/${token}/invitation-response`, { headers: headers(4), data: { version: 1, status: "ACCEPTED" } })).status()).toBe(409);
  for (let n = 1; n < 5; n++) {
    const accepted = await request.put(`/api/v1/time-polls/${token}/invitation-response`, { headers: headers(n), data: { version: 2, status: "ACCEPTED" } });
    expect(accepted.status()).toBe(200);
    expect((await accepted.json()).data.phase).toBe(n === 4 ? "CONFIRMED" : "INVITING");
    expect(await prisma.calendarEntry.count({ where })).toBe(n === 4 ? 5 : 0);
  }
  expect((await request.put(`/api/v1/time-polls/${token}/invitation-response`, { headers: headers(4), data: { version: 2, status: "ACCEPTED" } })).status()).toBe(200);
  expect(await prisma.calendarEntry.count({ where })).toBe(5);
  const windowStart = `${date}T00:00:00.000Z`, windowEnd = `${date}T23:59:59.000Z`;
  for (let n = 0; n < 5; n++) {
    const reopened = await detail(n); expect(reopened.phase).toBe("CONFIRMED");
    expect(reopened.invitations.find((i: { isMe: boolean }) => i.isMe).status).toBe("ACCEPTED");
    const list = (await (await request.get("/api/v1/time-polls", { headers: headers(n) })).json()).data.polls;
    expect(list.find((p: { token: string }) => p.token === token)).toMatchObject({ phase: "CONFIRMED", acceptedCount: 5, invitedCount: 5 });
    const schedule = await request.get("/api/v1/home/schedule", { headers: headers(n), params: { windowStart, windowEnd } });
    expect(schedule.status()).toBe(200);
    const entries = (await schedule.json()).data.studyEntries.filter((e: { timePollToken: string }) => e.timePollToken === token);
    expect(entries).toHaveLength(1); expect(entries[0].eventParticipants).toHaveLength(4);
    const search = await request.get("/api/v1/calendar/search", { headers: headers(n), params: { q: "Five-person unified plan" } });
    expect(search.status()).toBe(200);
    expect((await search.json()).data.results.find((entry: { id: string }) => entry.id === entries[0].id).timePollToken).toBe(token);
    const attemptedEdit = await request.delete(`/api/v1/calendar/events/${entries[0].id}`, { headers: { ...headers(n), "Idempotency-Key": randomUUID() } });
    expect(attemptedEdit.status()).toBe(404);
  }
  expect((await request.delete(`/api/v1/time-polls/${token}`, { headers: headers(0) })).status()).toBe(409);
  expect((await request.post(`/api/v1/time-polls/${token}/cancel`, { headers: headers(1), data: { version: 2 } })).status()).toBe(404);
  const cancelled = await request.post(`/api/v1/time-polls/${token}/cancel`, { headers: headers(0), data: { version: 2 } });
  expect(cancelled.status()).toBe(200); expect((await cancelled.json()).data.phase).toBe("CANCELLED");
  expect(await prisma.calendarEntry.count({ where })).toBe(0);

  const fixed = await request.post("/api/v1/time-polls", { headers: { ...headers(0), "Idempotency-Key": randomUUID() }, data: { title: "Direct-time five-person invitation", timeZone: "Europe/Berlin", dates: [date], startMinute: 540, endMinute: 1020, durationMinutes: 60, expectedCount: 5, planningMode: "FIXED", fixedStart: `${date}T12:00:00.000Z` } });
  expect(fixed.status()).toBe(201); const fixedToken = (await fixed.json()).data.token; pollTokens.push(fixedToken);
  for (let n = 1; n < 5; n++) {
    const response = await request.put(`/api/v1/time-polls/${fixedToken}/invitation-response`, { headers: headers(n), data: { version: 1, status: "ACCEPTED" } });
    expect(response.status()).toBe(200); expect((await response.json()).data.phase).toBe(n === 4 ? "CONFIRMED" : "INVITING");
  }
  expect(await prisma.calendarEntry.count({ where: { timePoll: { token: fixedToken } } })).toBe(5);
  await request.post(`/api/v1/time-polls/${fixedToken}/cancel`, { headers: headers(0), data: { version: 1 } });
});

test("a four-person recommendation invites only the chosen four and leaves the fifth calendar untouched", async ({ request }) => {
  const tokens: string[] = [];
  for (let n = 1; n <= 5; n++) {
    const result = await request.post("/api/v1/auth/login", { data: { identifier: `test_00${n}`, password: "Password123", device: { id: randomUUID(), name: "Four-person QA", appVersion: "1.0.0", platformVersion: "26.0" } } });
    expect(result.status()).toBe(200); tokens.push((await result.json()).data.tokens.accessToken);
  }
  const headers = (n: number) => ({ Authorization: `Bearer ${tokens[n]}` });
  const future = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);
  const created = await request.post("/api/v1/time-polls", { headers: { ...headers(0), "Idempotency-Key": randomUUID() }, data: { title: "Four of five", timeZone: "Europe/Berlin", dates: [future], startMinute: 540, endMinute: 660, durationMinutes: 60, expectedCount: 5 } });
  expect(created.status()).toBe(201); let poll = (await created.json()).data; const token = poll.token; pollTokens.push(token);
  for (let n = 0; n < 5; n++) {
    const saved = await request.put(`/api/v1/time-polls/${token}/response`, { headers: headers(n), data: { displayName: `Person ${n + 1}`, slotIds: n === 4 ? [] : [0, 1, 2, 3] } });
    expect(saved.status()).toBe(200); poll = (await saved.json()).data;
  }
  expect(poll.summary).toMatchObject({ common: false, maximum: 4, participantCount: 5 });
  const window = poll.summary.windows[0];
  const sent = await request.post(`/api/v1/time-polls/${token}/invitations`, { headers: headers(0), data: { version: 0, start: window.start, attendeeIds: window.attendeeIds } });
  expect(sent.status()).toBe(200); expect((await sent.json()).data.invitations).toHaveLength(4);
  const excluded = await request.put(`/api/v1/time-polls/${token}/invitation-response`, { headers: headers(4), data: { version: 1, status: "ACCEPTED" } });
  expect(excluded.status()).toBe(403);
  for (let n = 1; n < 4; n++) {
    const accepted = await request.put(`/api/v1/time-polls/${token}/invitation-response`, { headers: headers(n), data: { version: 1, status: "ACCEPTED" } });
    expect(accepted.status()).toBe(200);
  }
  expect(await prisma.calendarEntry.count({ where: { timePoll: { token } } })).toBe(4);
  const fifth = (await (await request.get("/api/v1/time-polls", { headers: headers(4) })).json()).data.polls.find((row: { token: string }) => row.token === token);
  expect(fifth).toMatchObject({ isIncluded: false, phase: "CONFIRMED", invitedCount: 4 });
  const fifthUser = (await (await request.get(`/api/v1/time-polls/${token}`, { headers: headers(4) })).json()).data;
  expect(fifthUser.invitations.some((row: { isMe: boolean }) => row.isMe)).toBe(false);
  await request.post(`/api/v1/time-polls/${token}/cancel`, { headers: headers(0), data: { version: 1 } });
  expect(await prisma.calendarEntry.count({ where: { timePoll: { token } } })).toBe(0);
});

test("Block and participant account deletion cancel shared plans and remove every calendar projection", async ({ request }) => {
  const seed = await prisma.user.findUniqueOrThrow({ where: { username: "test_001" }, select: { hashedPassword: true } });
  const users = await Promise.all([0, 1, 2].map((n) => prisma.user.create({ data: { username: `native_unified_${randomUUID().slice(0, 8)}_${n}`, nickname: `Safety ${n}`, hashedPassword: seed.hashedPassword, onboardingComplete: true, school: "TUM" } })));
  try {
    const tokens: string[] = [];
    for (const user of users) {
      const login = await request.post("/api/v1/auth/login", { data: { identifier: user.username, password: "Password123", device: { id: randomUUID(), name: "Unified safety QA", appVersion: "1.0.0", platformVersion: "26.0" } } });
      expect(login.status()).toBe(200); tokens.push((await login.json()).data.tokens.accessToken);
    }
    const headers = (n: number) => ({ Authorization: `Bearer ${tokens[n]}`, "Idempotency-Key": randomUUID() });
    const date = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
    const make = async (invitees: number[]) => {
      const response = await request.post("/api/v1/time-polls", { headers: headers(0), data: { title: "Safety shared plan", timeZone: "Europe/Berlin", dates: [date], startMinute: 540, endMinute: 1020, durationMinutes: 60, expectedCount: invitees.length + 1, planningMode: "FIXED", fixedStart: `${date}T12:00:00.000Z` } });
      expect(response.status()).toBe(201); const token = (await response.json()).data.token; pollTokens.push(token);
      for (const n of invitees) expect((await request.put(`/api/v1/time-polls/${token}/invitation-response`, { headers: headers(n), data: { version: 1, status: "ACCEPTED" } })).status()).toBe(200);
      expect(await prisma.calendarEntry.count({ where: { timePoll: { token } } })).toBe(invitees.length + 1);
      return token as string;
    };
    const token = await make([1, 2]);
    const connection = await prisma.connection.create({ data: { userAId: users[0].id, userBId: users[1].id, status: "ACTIVE" } });
    const block = await request.post(`/api/v1/connections/${connection.id}/block`, { headers: headers(1), data: {} });
    expect(block.status()).toBe(201);
    expect((await prisma.timePoll.findUniqueOrThrow({ where: { token } })).phase).toBe("CANCELLED");
    expect(await prisma.calendarEntry.count({ where: { timePoll: { token } } })).toBe(0);
    const second = await make([2]);
    const deleted = await request.delete("/api/v1/me", { headers: headers(2), data: { confirmUsername: users[2].username } });
    expect(deleted.status()).toBe(200);
    expect((await prisma.timePoll.findUniqueOrThrow({ where: { token: second } })).phase).toBe("CANCELLED");
    expect(await prisma.calendarEntry.count({ where: { timePoll: { token: second } } })).toBe(0);
  } finally {
    await prisma.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
  }
});
