import { randomUUID } from "node:crypto";
import { expect, request as apiRequest, test } from "@playwright/test";

test("open invitations can exceed 20, while explicit limits still prevent overbooking", async ({ request, baseURL }) => {
  test.setTimeout(180_000);
  const host = new URL(baseURL!).hostname;
  expect(["127.0.0.1", "localhost", "::1"]).toContain(host);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
  const username = `auditqa_unlimited_${suffix}`;
  const signup = await request.post("/api/auth/signup", { data: {
    username, password: `QA-${randomUUID()}!`, displayName: `人数验收${suffix}`,
    school: "TUM", studentStatus: "CURRENT_STUDENT", degreeLevel: "MASTER", semester: 3,
  } });
  expect(signup.status()).toBe(201);
  const tokens: string[] = [];
  try {
    const date = new Date(Date.now() + 4 * 86400_000).toISOString().slice(0, 10);
    async function create(limit: number | null) {
      const created = await request.post("/api/v1/time-polls", { headers: { "Idempotency-Key": randomUUID() }, data: {
        title: "人数上限验收", timeZone: "Europe/Berlin", dates: [date],
        startMinute: 540, endMinute: 600, planningMode: "COLLECT",
      } });
      expect(created.status()).toBe(201);
      const poll = (await created.json()).data;
      tokens.push(poll.token);
      const sent = await request.post(`/api/v1/time-polls/${poll.token}/invitations`, { headers: { "Idempotency-Key": randomUUID() }, data: {
        start: poll.slots[0].start, end: poll.slots.at(-1).end,
        version: 0, attendeeIds: [], linkParticipantCount: limit,
      } });
      expect(sent.status()).toBe(200);
      expect((await sent.json()).data).toMatchObject({ planningMode: "FIXED", expectedCount: limit });
      return poll.token as string;
    }
    async function join(token: string, index: number, expectedStatus: number) {
      const guest = await apiRequest.newContext({ baseURL });
      try {
        const path = `/api/public/time-polls/${token}`;
        const start = await guest.post(`${path}/participant`, { data: { displayName: `测试访客 ${index}` } });
        expect(start.status()).toBe(200);
        const participantId = (await start.json()).data.viewerId;
        const reply = await guest.put(`${path}/invitation-response`, { data: { participantId, version: 1, status: "ACCEPTED" } });
        expect(reply.status()).toBe(expectedStatus);
      } finally { await guest.dispose(); }
    }
    const unlimited = await create(null);
    for (let i = 1; i <= 22; i++) await join(unlimited, i, 200);
    const result = (await (await request.get(`/api/v1/time-polls/${unlimited}`)).json()).data;
    expect(result.expectedCount).toBeNull();
    expect(result.invitations.filter((person: { selected: boolean; status: string }) => person.selected && person.status === "ACCEPTED")).toHaveLength(23);
    const capped = await create(2);
    await join(capped, 1, 200);
    await join(capped, 2, 409);
    await create(35);
  } finally {
    const deleted = await request.delete("/api/v1/me", { headers: { "Idempotency-Key": randomUUID() }, data: { confirmUsername: username } });
    expect(deleted.status()).toBe(200);
    for (const token of tokens) expect((await request.get(`/api/public/time-polls/${token}`)).status()).toBe(404);
  }
});
