import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
let pollToken = "";
test.afterAll(async () => {
  if (pollToken) await prisma.timePoll.deleteMany({ where: { token: pollToken } });
  await prisma.$disconnect();
});

test("five authenticated accounts create, paint, erase, reopen and find the best time", async ({ request }) => {
  const tokens: string[] = [];
  for (let index = 1; index <= 5; index++) {
    const login = await request.post("/api/v1/auth/login", { data: {
      identifier: `test_00${index}`, password: "Password123",
      device: { id: `time-poll-${index}-${randomUUID()}`, name: "Poll integration", appVersion: "1.0.0", platformVersion: "17.0" },
    } });
    expect(login.status()).toBe(200);
    tokens.push((await login.json()).data.tokens.accessToken);
  }
  const headers = (index: number) => ({ Authorization: `Bearer ${tokens[index]}` });
  const input = { title: "Five-person native poll QA", timeZone: "Europe/Berlin", dates: [new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)], startMinute: 540, endMinute: 1020 };
  const key = randomUUID();
  const created = await request.post("/api/v1/time-polls", { headers: { ...headers(0), "Idempotency-Key": key }, data: input });
  expect(created.status()).toBe(201);
  const poll = (await created.json()).data;
  pollToken = poll.token;
  expect(poll.slots).toHaveLength(32);
  expect(poll.summary.participantCount).toBe(0);
  expect(poll.shareUrl).toContain(`/time-polls/${pollToken}`);
  const handoff = await request.get(`/time-polls/${pollToken}`);
  expect(handoff.status()).toBe(200);
  expect(handoff.url()).toContain(`/time-polls/${pollToken}`);
  expect(await handoff.text()).toContain(`sideseat://time-polls/${pollToken}`);
  expect(await handoff.text()).not.toContain("Person 1");
  const replay = await request.post("/api/v1/time-polls", { headers: { ...headers(0), "Idempotency-Key": key }, data: input });
  expect((await replay.json()).data.token).toBe(pollToken);
  const selections = Array.from({ length: 5 }, (_, index) => [0, 1, 2, 3, ...Array.from({ length: 4 }, (_, quarter) => 4 + index * 4 + quarter)]);
  for (let index = 0; index < 5; index++) {
    const save = await request.put(`/api/v1/time-polls/${pollToken}/response`, { headers: headers(index), data: { displayName: `Person ${index + 1}`, slotIds: selections[index] } });
    expect(save.status()).toBe(200);
    const own = (await save.json()).data;
    expect(own.mySlotIds).toEqual(selections[index]);
    expect(own.participants.filter((person: { isMe: boolean }) => person.isMe)).toHaveLength(1);
  }
  const shared = (await (await request.get(`/api/v1/time-polls/${pollToken}`, { headers: headers(0) })).json()).data;
  expect(shared.summary).toMatchObject({ participantCount: 5, maximum: 5, common: true });
  expect(shared.summary.windows).toHaveLength(1);
  expect(shared.summary.windows[0]).toMatchObject({ start: poll.slots[0].start, end: poll.slots[3].end, count: 5 });
  selections[4] = selections[4].filter((id) => id >= 4);
  const erased = await request.put(`/api/v1/time-polls/${pollToken}/response`, { headers: headers(4), data: { displayName: "Person 5", slotIds: selections[4] } });
  expect(erased.status()).toBe(200);
  expect((await erased.json()).data.summary).toMatchObject({ participantCount: 5, maximum: 4, common: false });
  for (let index = 0; index < 5; index++) {
    const reopen = (await (await request.get(`/api/v1/time-polls/${pollToken}`, { headers: headers(index) })).json()).data;
    expect(reopen.mySlotIds).toEqual(selections[index]);
    expect(reopen.myDisplayName).toBe(`Person ${index + 1}`);
    expect(reopen.summary.maximum).toBe(4);
    const list = (await (await request.get("/api/v1/time-polls", { headers: headers(index) })).json()).data;
    expect(list.polls.some((item: { token: string }) => item.token === pollToken)).toBe(true);
  }
  expect((await request.put(`/api/v1/time-polls/${pollToken}/response`, { headers: headers(0), data: { displayName: "Person 1", slotIds: [999] } })).status()).toBe(422);
  expect((await request.get(`/api/v1/time-polls/${pollToken}`)).status()).toBe(401);
  expect((await request.delete(`/api/v1/time-polls/${pollToken}`, { headers: headers(1) })).status()).toBe(404);
  expect(await prisma.timePollResponse.count({ where: { poll: { token: pollToken } } })).toBe(5);
  expect((await request.delete(`/api/v1/time-polls/${pollToken}`, { headers: headers(0) })).status()).toBe(200);
  expect((await request.get(`/api/v1/time-polls/${pollToken}`, { headers: headers(0) })).status()).toBe(404);
});
