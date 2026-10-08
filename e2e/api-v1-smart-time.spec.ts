import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { assertLocalTestDatabase } from "./helpers/local-test-database";

assertLocalTestDatabase();
const prisma = new PrismaClient();
test.afterAll(async () => { await prisma.$disconnect(); });

test("private availability → common time → proposal → acceptance → both calendars", async ({ request }) => {
  const users = await prisma.user.findMany({ where: { username: { in: ["test_001", "test_002"] } } });
  const owner = users.find(user => user.username === "test_001")!;
  const peer = users.find(user => user.username === "test_002")!;
  const connection = await prisma.connection.findFirstOrThrow({ where: {
    OR: [{ userAId: owner.id, userBId: peer.id }, { userAId: peer.id, userBId: owner.id }],
  } });
  const tokens: Record<string, string> = {};
  for (const user of [owner, peer]) {
    const login = await request.post("/api/v1/auth/login", { data: {
      identifier: user.username, password: "Password123",
      device: { id: `smart-time-${user.username}`, name: "Local smart time QA", appVersion: "1.0.0", platformVersion: "26.5" },
    } });
    expect(login.status()).toBe(200);
    tokens[user.id] = (await login.json()).data.tokens.accessToken;
  }
  const headers = (userId: string) => ({ Authorization: `Bearer ${tokens[userId]}` });
  const dateKeys = Array.from({ length: 7 }, (_, index) =>
    formatInTimeZone(new Date(Date.now() + (index + 1) * 86400_000), "Europe/Berlin", "yyyy-MM-dd"));
  const rangeStart = fromZonedTime(`${dateKeys[0]}T00:00:00`, "Europe/Berlin").toISOString();
  const rangeEnd = fromZonedTime(`${dateKeys[6]}T23:59:59`, "Europe/Berlin").toISOString();
  const create = await request.post(`/api/v1/connections/${connection.id}/schedule-shares`, {
    headers: { ...headers(owner.id), "Idempotency-Key": `smart-time-share-${Date.now()}` },
    data: { rangeStart, rangeEnd, expiresAt: rangeEnd, usageLimit: "SINGLE_USE", allowGuestProposals: true,
      revealConfig: { hideAllDetails: true, categoryIds: [], presetKeys: [], includedDates: dateKeys,
        availabilityStartMinutes: 9 * 60, availabilityEndMinutes: 21 * 60 } },
  });
  expect(create.status()).toBe(201);
  const share = (await create.json()).data;
  const recipient = await request.get(`/api/v1/schedule-shares/recipient/${share.token}`, { headers: headers(peer.id) });
  expect(recipient.status()).toBe(200);
  const snapshot = (await recipient.json()).data.snapshot;
  expect(snapshot.blocks.every((block: { title?: string; location?: string }) => !block.title && !block.location)).toBe(true);
  const own = await request.get("/api/v1/schedule-shares/owner-preview", { headers: headers(peer.id) });
  expect(own.status()).toBe(200);
  type Slot = { start: string; end: string };
  const ownSlots: Slot[] = (await own.json()).data.snapshot.freeSlots;
  let selected: { start: number; end: number } | undefined;
  for (const theirs of snapshot.freeSlots as Slot[]) {
    for (const mine of ownSlots) {
      const start = Math.ceil(Math.max(Date.parse(theirs.start), Date.parse(mine.start), Date.now() + 3600_000) / 1800_000) * 1800_000;
      const end = Math.min(Date.parse(theirs.end), Date.parse(mine.end));
      if (end - start >= 3600_000) { selected = { start, end: start + 3600_000 }; break; }
    }
    if (selected) break;
  }
  expect(selected).toBeTruthy();
  const title = `[smart-time-qa] Coffee ${Date.now()}`;
  const propose = await request.post(`/api/v1/schedule-shares/recipient/${share.token}/proposals`, {
    headers: { ...headers(peer.id), "Idempotency-Key": `smart-time-plan-${Date.now()}` },
    data: { title, startTime: new Date(selected!.start).toISOString(), endTime: new Date(selected!.end).toISOString() },
  });
  expect([200, 201]).toContain(propose.status());
  const proposal = (await propose.json()).data.proposal;
  expect(proposal.status).toBe("PENDING");
  expect(await prisma.calendarEntry.count({ where: { planRequestId: proposal.id } })).toBe(0);
  const message = await prisma.message.findFirst({ where: { connectionId: connection.id, planRequestId: proposal.id } });
  expect(message).toBeTruthy();
  const accept = await request.post(`/api/v1/plans/${proposal.id}/accept`, {
    headers: { ...headers(owner.id), "Idempotency-Key": `smart-time-accept-${Date.now()}` }, data: {},
  });
  expect(accept.status(), await accept.text()).toBe(200);
  const entries = await prisma.calendarEntry.findMany({ where: { planRequestId: proposal.id } });
  expect(entries).toHaveLength(2);
  expect(new Set(entries.map(entry => entry.userId))).toEqual(new Set([owner.id, peer.id]));
  for (const user of [owner, peer]) {
    const calendar = await request.get(`/api/v1/home/schedule?windowStart=${rangeStart}&windowEnd=${rangeEnd}`, { headers: headers(user.id) });
    expect(calendar.status()).toBe(200);
    expect((await calendar.json()).data.studyEntries.some((entry: { title: string }) => entry.title === title)).toBe(true);
  }
  // Retain this uniquely labelled accepted Plan in the isolated local test database as QA evidence.
});
