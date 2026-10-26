import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import type { UserPushPayload } from "../../lib/push/apns-payload";

// Execute the production service and after-response callback with in-memory I/O.
function loadModule<T>(path: string, imports: Record<string, unknown>): T {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", compiled)((name: string) => {
    assert.ok(name in imports, `Unexpected test dependency: ${name}`);
    return imports[name];
  }, loaded, loaded.exports);
  return loaded.exports as T;
}

type Invitation = { userId: string | null; guestId: string | null; selected: boolean; status: string; version: number; id: string; displayName: string };
const invitation = (userId: string | null, status = "INVITED", selected = true, version = 2): Invitation => ({
  userId, guestId: userId ? null : "guest", status, selected, version, id: userId ?? "guest", displayName: userId ?? "Guest",
});
const roster = () => [invitation("owner", "ACCEPTED"), invitation("pending"), invitation("accepted", "ACCEPTED"),
  invitation("declined", "DECLINED"), invitation("shared", "SHARED", false), invitation("unselected", "ACCEPTED", false),
  invitation("old-version", "INVITED", true, 1), invitation(null), invitation("blocked")];

function fixture(phase = "CONFIRMED") {
  const poll = {
    id: "poll-id", token: "poll-token", title: "Coffee %@ 100%", creatorId: "owner", phase, invitationVersion: 2,
    canceledAt: null as Date | null, updatedAt: new Date(), invitations: roster(), responses: [], activityIdeas: [],
    slots: [], chosenStart: null, chosenEnd: null, activityTopic: null,
  };
  const callbacks: (() => Promise<void>)[] = [];
  const deliveries: { userId: string; payload: UserPushPayload }[] = [];
  let updates = 0, calendarDeletes = 0, inTransaction = false;
  const prisma = {
    block: {
      findMany: async () => [],
      findFirst: async ({ where }: { where: { OR: { blockerId: string; blockedId: string }[] } }) =>
        where.OR.some(pair => pair.blockerId === "blocked" || pair.blockedId === "blocked") ? { id: "block" } : null,
    },
    timePoll: {
      findFirst: async () => poll,
      findUnique: async ({ select }: { select: { invitations: { where: { userId: { in: string[] }; selected: boolean; status: string | { in: string[] }; version?: number } } } }) => {
        const filter = select.invitations.where;
        return { ...poll, invitations: poll.invitations.filter(person => person.userId !== null && filter.userId.in.includes(person.userId)
          && person.selected === filter.selected && (typeof filter.status === "string" ? person.status === filter.status : filter.status.in.includes(person.status))
          && (filter.version === undefined || person.version === filter.version)) };
      },
      update: async ({ data }: { data: { phase: string; canceledAt: Date } }) => { updates++; Object.assign(poll, data); },
    },
    user: { findUniqueOrThrow: async () => ({ username: "Owner", nickname: null }) },
    timePollGuest: { findMany: async () => [] },
    calendarEntry: { deleteMany: async () => { calendarDeletes++; } },
    $transaction: async (work: (tx: unknown) => Promise<void>) => {
      inTransaction = true;
      try { await work(prisma); } finally { inTransaction = false; }
    },
  };
  type Notifications = {
    scheduleCancelledPollNotification: (token: string, version: number, recipients: string[]) => void;
    schedulePollInvitationNotification: (token: string, version: number, recipients: string[]) => void;
    schedulePublishedPollNotification: (token: string, recipients: string[]) => void;
  };
  const notifications = loadModule<Notifications>("lib/time-polls/notifications.ts", {
    "server-only": {}, "next/server": { after: (work: () => Promise<void>) => { assert.equal(inTransaction, false); callbacks.push(work); } },
    "@/lib/db/prisma": { prisma },
    "@/lib/push/notify-user": { notifyUserPush: async (userId: string, payload: typeof deliveries[number]["payload"]) => { deliveries.push({ userId, payload }); } },
  });
  const service = loadModule<{ cancelPollPlan: (token: string, userId: string, version: number, appOrigin: string) => Promise<unknown> }>("lib/api/v1/time-poll-service.ts", {
    "server-only": {}, "node:crypto": { randomBytes }, "@/lib/db/prisma": { prisma }, "@/lib/api/v1/http": {},
    "@/lib/time-polls/domain": { summarizePoll: () => ({}) },
    "@/lib/time-polls/planning": { lockPollPlan: async () => poll },
    "@/lib/time-polls/lifecycle": { timePollPhase: (value: typeof poll) => value.phase, timePollExpiresAt: () => null },
    "@/lib/time-polls/notifications": notifications,
  });
  return { poll, callbacks, deliveries, notifications,
    cancel: (userId = "owner", version = 2) => service.cancelPollPlan(poll.token, userId, version, "https://sideseat.de"),
    changes: () => ({ updates, calendarDeletes }) };
}

test("cancelling a formal plan notifies pending and accepted accounts after commit, with the shared-plan route", async () => {
  for (const phase of ["INVITING", "CONFIRMED"]) {
    const f = fixture(phase);
    await f.cancel();
    assert.equal(f.poll.phase, "CANCELLED");
    assert.ok(f.poll.canceledAt instanceof Date);
    assert.deepEqual(f.changes(), { updates: 1, calendarDeletes: 1 });
    assert.equal(f.deliveries.length, 0);
    assert.equal(f.callbacks.length, 1);
    await f.callbacks[0]();
    assert.deepEqual(f.deliveries.map(item => item.userId).sort(), ["accepted", "pending"]);
    for (const { payload } of f.deliveries) {
      assert.equal(payload.url, "/time-polls/poll-token");
      assert.deepEqual(payload.data, { kind: "plan_canceled", timePollToken: "poll-token" });
      assert.equal(payload.title, "A plan was cancelled");
      assert.equal(payload.body, "Coffee %@ 100%");
      assert.equal(payload.apnsTitleLocalizationKey, "Plan cancelled");
    }
  }
});

test("localized invitation keeps deferred delivery, current-version pending recipients, block checks and the original route", async () => {
  const f = fixture("INVITING");
  const recipients = f.poll.invitations.flatMap(person => person.userId ? [person.userId] : []);
  f.notifications.schedulePollInvitationNotification(f.poll.token, 2, recipients);
  assert.equal(f.deliveries.length, 0);
  assert.equal(f.callbacks.length, 1);
  await f.callbacks[0]();
  assert.deepEqual(f.deliveries.map(item => item.userId), ["pending"]);
  assert.deepEqual(f.deliveries[0].payload, {
    title: "A plan is waiting for you", body: "Coffee %@ 100%",
    apnsTitleLocalizationKey: "A plan is waiting for you",
    url: "/time-polls/poll-token", threadId: "time-poll:poll-token", category: "PLAN_UPDATE",
    data: { kind: "time_poll_invitation", timePollToken: "poll-token" },
  });
});

test("localized publication keeps only requested selected accepted accounts and the original confirmed callback", async () => {
  const f = fixture("CONFIRMED");
  f.poll.invitations.find(person => person.userId === "blocked")!.status = "ACCEPTED";
  f.notifications.schedulePublishedPollNotification(f.poll.token, ["accepted", "pending", "declined", "shared", "unselected", "blocked"]);
  assert.equal(f.deliveries.length, 0);
  assert.equal(f.callbacks.length, 1);
  await f.callbacks[0]();
  assert.deepEqual(f.deliveries.map(item => item.userId), ["accepted"]);
  assert.deepEqual(f.deliveries[0].payload, {
    title: "Your plan is confirmed", body: "Coffee %@ 100%",
    apnsTitleLocalizationKey: "Plan confirmed",
    url: "/time-polls/poll-token", threadId: "time-poll:poll-token", category: "PLAN_UPDATE",
    data: { kind: "time_poll_confirmed", timePollToken: "poll-token" },
  });
});

test("localized invitation and publication still recheck phase and invitation version before sending", async () => {
  const invite = fixture("INVITING");
  invite.notifications.schedulePollInvitationNotification(invite.poll.token, 2, ["pending"]);
  invite.poll.invitationVersion++;
  await invite.callbacks[0]();
  assert.equal(invite.deliveries.length, 0);
  const published = fixture("CONFIRMED");
  published.notifications.schedulePublishedPollNotification(published.poll.token, ["accepted"]);
  published.poll.phase = "CANCELLED";
  await published.callbacks[0]();
  assert.equal(published.deliveries.length, 0);
});

test("repeat cancellation preserves its original timestamp and does not repeat calendar deletion or notification", async () => {
  const f = fixture();
  await f.cancel();
  const canceledAt = f.poll.canceledAt;
  await f.cancel();
  assert.equal(f.poll.canceledAt, canceledAt);
  assert.deepEqual(f.changes(), { updates: 1, calendarDeletes: 1 });
  assert.equal(f.callbacks.length, 1);
});

test("shared-only collection never emits a formal cancellation notification", async () => {
  const f = fixture("COLLECTING");
  await f.cancel();
  assert.equal(f.poll.phase, "CANCELLED");
  assert.deepEqual(f.changes(), { updates: 1, calendarDeletes: 1 });
  assert.equal(f.callbacks.length, 0);
});

test("cancel retains organizer authorization and invitation version conflicts", async () => {
  const f = fixture();
  await assert.rejects(f.cancel("pending"), { status: 404 });
  await assert.rejects(f.cancel("owner", 1), { status: 409 });
  assert.deepEqual(f.changes(), { updates: 0, calendarDeletes: 0 });
  assert.equal(f.callbacks.length, 0);
});

test("cancel notification rechecks terminal phase and version before delivery", async () => {
  for (const change of ["phase", "version"]) {
    const f = fixture();
    await f.cancel();
    if (change === "phase") f.poll.phase = "CONFIRMED";
    else f.poll.invitationVersion++;
    await f.callbacks[0]();
    assert.equal(f.deliveries.length, 0);
  }
});

test("cancel notification snapshots recipient identities and rechecks invitation membership/status", async () => {
  const f = fixture();
  await f.cancel();
  f.poll.invitations.find(person => person.userId === "pending")!.status = "DECLINED";
  f.poll.invitations.find(person => person.userId === "accepted")!.selected = false;
  f.poll.invitations.push(invitation("new-person"));
  await f.callbacks[0]();
  assert.equal(f.deliveries.length, 0);
});
