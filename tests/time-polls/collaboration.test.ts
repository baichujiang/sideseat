import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import test from "node:test";
import ts from "typescript";
import * as domain from "../../lib/time-polls/domain";
import * as collaboration from "../../lib/time-polls/collaboration";

type Person = { userId: string | null; guestId: string | null; displayName: string };
type Interest = Person & { id: string; ideaId: string };
type Idea = Person & { id: string; pollId: string; title: string; location: string | null; kind: string; interests: Interest[] };
type Invitation = Person & { id: string; selected: boolean; status: string; version: number };
type Response = Person & { id: string; slotIds: number[] };
const config = { version: 1 as const, activity: true, location: true, time: true, activityType: "", finalized: false };

function fixture() {
  const poll = {
    id: "poll", token: "token", creatorId: "owner", title: "周末见面", timeZone: "Europe/Berlin", dates: ["2099-11-01"],
    startMinute: 540, endMinute: 720, slots: domain.buildPollSlots({ dates: ["2099-11-01"], timeZone: "Europe/Berlin", startMinute: 540, endMinute: 720 }),
    createdAt: new Date(), updatedAt: new Date(), collaboration: { ...config }, expectedCount: 20, durationMinutes: null as number | null,
    planningMode: "COLLECT", phase: "COLLECTING", invitationVersion: 0, chosenStart: null as Date | null, chosenEnd: null as Date | null,
    activityTopic: "周末见面" as string | null, activitySelectedId: null, activityChosenAt: null as Date | null,
    location: null as string | null, invitations: [] as Invitation[], responses: [] as Response[], activityIdeas: [] as Idea[],
  };
  let responseWrites = 0, calendarWrites = 0, transaction = false, sequence = 0;
  const effects: string[] = [];
  const actorKey = (person: Partial<Person>) => person.userId ? `user:${person.userId}` : `guest:${person.guestId}`;
  function idea(id: string, kind: string, title: string): Idea {
    const value = { id, pollId: poll.id, kind, title, location: null, userId: "owner", guestId: null, displayName: "Owner", interests: [] };
    poll.activityIdeas.push(value); return value;
  }
  const a = idea("cm123456789012345678901234", "ACTIVITY", "喝咖啡");
  const b = idea("cm223456789012345678901234", "ACTIVITY", "逛展");
  const location = idea("cm323456789012345678901234", "LOCATION", "图书馆");
  const prisma = {
    block: { findMany: async () => [], findFirst: async () => null },
    user: { findUniqueOrThrow: async () => ({ username: "Owner", nickname: null }) },
    timePollGuest: { findMany: async () => [], findFirst: async () => ({ id: "guest", displayName: "小林" }), findFirstOrThrow: async () => ({ displayName: "小林" }), findUniqueOrThrow: async () => ({ displayName: "小林" }) },
    timePoll: {
      findFirst: async () => poll,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const nestedIdeas = data.activityIdeas as { create: (Person & { kind: string; title: string })[] } | undefined;
        const nestedInvitations = data.invitations as { create: Person & { version: number; status: string } } | undefined;
        Object.assign(poll, data, { activityIdeas: [], invitations: [] });
        for (const item of nestedIdeas?.create ?? []) poll.activityIdeas.push(Object.assign({ id: `new-${++sequence}`, pollId: poll.id, location: null, guestId: null, interests: [] as Interest[] }, item));
        if (nestedInvitations) poll.invitations.push(Object.assign({ id: "owner-invite", guestId: null, selected: true }, nestedInvitations.create));
        return poll;
      },
      update: async ({ data }: { data: Record<string, unknown> }) => { assert.ok(transaction); Object.assign(poll, data); effects.push("poll updated"); return poll; },
    },
    timePollActivityIdea: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => poll.activityIdeas.filter(item => where.id.in.includes(item.id)),
      findFirst: async ({ where }: { where: { id?: string; kind?: string; title?: { equals: string } } }) => poll.activityIdeas.find(item => (!where.id || item.id === where.id)
        && (!where.kind || item.kind === where.kind) && (!where.title || item.title.toLowerCase() === where.title.equals.toLowerCase())) ?? null,
      count: async ({ where }: { where: { kind: string } }) => poll.activityIdeas.filter(item => item.kind === where.kind).length,
      create: async ({ data }: { data: Person & { title: string; kind: string } }) => {
        const value = { id: `new-${++sequence}`, pollId: poll.id, location: null, ...data, interests: [] }; poll.activityIdeas.push(value); return value;
      },
    },
    timePollActivityInterest: {
      deleteMany: async ({ where }: { where: Partial<Person> & { ideaId?: string; idea?: { kind: { in: string[] } } } }) => {
        assert.ok(transaction);
        for (const item of poll.activityIdeas) if ((!where.ideaId || item.id === where.ideaId) && (!where.idea || where.idea.kind.in.includes(item.kind))) {
          item.interests = item.interests.filter(person => actorKey(person) !== actorKey(where));
        }
      },
      create: async ({ data }: { data: Person & { ideaId: string } }) => { assert.ok(transaction); const item = poll.activityIdeas.find(item => item.id === data.ideaId)!; item.interests.push({ id: `interest-${++sequence}`, ...data }); },
      upsert: async ({ create }: { create: Person & { ideaId: string } }) => {
        const item = poll.activityIdeas.find(item => item.id === create.ideaId)!;
        if (!item.interests.some(person => actorKey(person) === actorKey(create))) item.interests.push({ id: `interest-${++sequence}`, ...create });
      },
    },
    timePollResponse: {
      findFirst: async () => null,
      upsert: async ({ create, update }: { create: Person & { slotIds: number[] }; update: { displayName: string; slotIds: number[] } }) => {
        assert.ok(transaction); responseWrites++;
        const row = poll.responses.find(person => actorKey(person) === actorKey(create));
        if (row) Object.assign(row, update); else poll.responses.push({ id: `response-${++sequence}`, ...create });
      },
    },
    timePollInvitation: {
      updateMany: async ({ data }: { data: Record<string, unknown> }) => { assert.ok(transaction); for (const item of poll.invitations) Object.assign(item, data); },
      upsert: async ({ create, update }: { create: Person & { status: string; version: number; selected: boolean }; update: Record<string, unknown> }) => {
        assert.ok(transaction); const row = poll.invitations.find(person => actorKey(person) === actorKey(create));
        if (row) Object.assign(row, update); else poll.invitations.push(Object.assign({ id: `invite-${++sequence}`, userId: null, guestId: null }, create));
      },
    },
    calendarEntry: { upsert: async () => { calendarWrites++; }, deleteMany: async () => {} },
    $transaction: async (work: (tx: unknown) => Promise<void>) => { transaction = true; try { await work(prisma); } finally { transaction = false; } },
  };
  type Service = {
    getTimePoll: (token: string, actor: string | { guestId: string } | null, origin: string) => Promise<{
      collaboration: { options: { id: string; kind: string; interestedBy: { isMe: boolean }[] }[] }; activitySelection: { ideas: { id: string }[] };
      didRespond: boolean; preferenceSubmitted: boolean; mySlotIds: number[]; invitees?: { id: string; isGuest: boolean; selected: boolean }[];
      invitations: { id: string; isMe: boolean }[];
    }>;
    createTimePoll: (user: string, input: unknown, origin: string) => Promise<unknown>;
    savePollPreferences: (token: string, actor: string | { guestId: string }, input: { optionIds: string[]; slotIds?: number[] }, origin: string) => Promise<unknown>;
    suggestPollOption: (token: string, actor: string | { guestId: string }, input: { kind: string; value: string }, origin: string) => Promise<unknown>;
    sendPollInvitations: (token: string, user: string, input: unknown, origin: string) => Promise<unknown>;
  };
  const source = readFileSync(new URL("../../lib/api/v1/time-poll-service.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const loaded = { exports: {} as Service };
  const imports: Record<string, unknown> = {
    "server-only": {}, "node:crypto": { randomBytes }, "@/lib/db/prisma": { prisma }, "@/lib/api/v1/http": {},
    "@/lib/time-polls/domain": domain, "@/lib/time-polls/collaboration": collaboration,
    "@/lib/time-polls/planning": { lockPollPlan: async () => poll, hasPlanningBlock: async () => false },
    "@/lib/time-polls/lifecycle": { timePollPhase: (value: typeof poll) => value.phase, timePollExpiresAt: () => null },
    "@/lib/time-polls/notifications": { schedulePollInvitationNotification: () => effects.push("notification scheduled") },
  };
  new Function("require", "module", "exports", compiled)((name: string) => { assert.ok(name in imports, name); return imports[name]; }, loaded, loaded.exports);
  return { poll, a, b, location, service: loaded.exports, stats: () => ({ responseWrites, calendarWrites }), effects };
}

test("activity and location preferences replace only the submitting actor and keep availability when omitted", async () => {
  const f = fixture(), actor = { guestId: "guest" };
  f.a.interests.push({ id: "other-interest", ideaId: f.a.id, userId: "friend", guestId: null, displayName: "Friend" });
  await f.service.savePollPreferences("token", actor, { optionIds: [f.a.id, f.location.id], slotIds: [1, 0, 1] }, "https://example.test");
  assert.deepEqual(f.poll.responses[0].slotIds, [0, 1]);
  assert.equal(f.poll.invitations[0].status, "SHARED"); assert.equal(f.poll.invitations[0].selected, false);
  await f.service.savePollPreferences("token", actor, { optionIds: [f.b.id] }, "https://example.test");
  assert.deepEqual(f.a.interests.map(person => person.userId), ["friend"]);
  assert.equal(f.location.interests.length, 0); assert.equal(f.b.interests[0].guestId, "guest");
  assert.deepEqual(f.poll.responses[0].slotIds, [0, 1]); assert.equal(f.stats().responseWrites, 1);
});

test("preferences without time slots create an inviteable participant without inventing an availability response", async () => {
  const f = fixture();
  await f.service.savePollPreferences("token", { guestId: "guest" }, { optionIds: [f.location.id] }, "https://example.test");
  const guest = await f.service.getTimePoll("token", { guestId: "guest" }, "https://example.test");
  const owner = await f.service.getTimePoll("token", "owner", "https://example.test");
  assert.equal(guest.didRespond, false); assert.deepEqual(guest.mySlotIds, []); assert.equal(f.stats().responseWrites, 0);
  assert.equal(owner.invitees?.some(person => person.isGuest), true);
});

test("organizer invitees retain selection by participant identity when response and invitation IDs differ", async () => {
  const f = fixture(), origin = "https://example.test";
  f.poll.responses.push(
    { id: "account-response", userId: "peer", guestId: null, displayName: "Peer", slotIds: [0] },
    { id: "guest-response", userId: null, guestId: "guest", displayName: "小林", slotIds: [0] },
    { id: "response-only", userId: "uninvited", guestId: null, displayName: "Uninvited", slotIds: [0] },
  );
  f.poll.invitations.push(
    { id: "account-invitation", userId: "peer", guestId: null, displayName: "Peer", selected: true, status: "INVITED", version: 1 },
    { id: "guest-invitation", userId: null, guestId: "guest", displayName: "小林", selected: false, status: "SHARED", version: 1 },
    { id: "invitation-only", userId: null, guestId: "other-guest", displayName: "Other", selected: true, status: "INVITED", version: 1 },
  );
  const owner = await f.service.getTimePoll("token", "owner", origin);
  assert.deepEqual(owner.invitees?.map(person => ({ id: person.id, selected: person.selected })), [
    { id: "account-response", selected: true }, { id: "guest-response", selected: false },
    { id: "response-only", selected: false }, { id: "invitation-only", selected: true },
  ]);
  assert.equal((await f.service.getTimePoll("token", { guestId: "guest" }, origin)).invitees, undefined);
});

test("an empty preference submission remains submitted after clearing choices without exposing shared participants", async () => {
  const f = fixture(), actor = { guestId: "guest" }, origin = "https://example.test";
  assert.equal((await f.service.getTimePoll("token", actor, origin)).preferenceSubmitted, false);
  await f.service.savePollPreferences("token", actor, { optionIds: [] }, origin);
  assert.equal((await f.service.getTimePoll("token", actor, origin)).preferenceSubmitted, true);
  await f.service.savePollPreferences("token", actor, { optionIds: [f.location.id] }, origin);
  await f.service.savePollPreferences("token", actor, { optionIds: [] }, origin);
  const mine = await f.service.getTimePoll("token", actor, origin);
  assert.equal(mine.preferenceSubmitted, true); assert.equal(mine.didRespond, false);
  assert.equal(f.stats().responseWrites, 0); assert.equal(f.location.interests.length, 0);
  assert.deepEqual(mine.invitations, []); assert.equal(mine.invitees, undefined);
  for (const viewer of [null, "owner", { guestId: "other-guest" }]) {
    const data = await f.service.getTimePoll("token", viewer, origin);
    assert.equal(data.preferenceSubmitted, false); assert.deepEqual(data.invitations, []);
  }
});

test("the submitted marker uses only the viewer's response or interest and stays false for legacy plans", async () => {
  const f = fixture(), actor = { guestId: "guest" }, origin = "https://example.test";
  f.a.interests.push({ id: "my-interest", ideaId: f.a.id, userId: null, guestId: actor.guestId, displayName: "小林" });
  assert.equal((await f.service.getTimePoll("token", actor, origin)).preferenceSubmitted, true);
  f.a.interests = [];
  f.poll.responses.push({ id: "my-response", userId: null, guestId: actor.guestId, displayName: "小林", slotIds: [] });
  assert.equal((await f.service.getTimePoll("token", actor, origin)).preferenceSubmitted, true);
  Object.assign(f.poll, { collaboration: null });
  assert.equal((await f.service.getTimePoll("token", actor, origin)).preferenceSubmitted, false);
});

test("a field already set by the organizer cannot be changed through guest preferences", async () => {
  const f = fixture(); f.poll.collaboration.location = false;
  await assert.rejects(f.service.savePollPreferences("token", { guestId: "guest" }, { optionIds: [f.location.id], slotIds: [0, 1] }, "https://example.test"), /Choose open options/);
  assert.equal(f.poll.responses.length, 0); assert.equal(f.location.interests.length, 0);
  assert.equal(f.poll.invitations.length, 0);
});

test("location choices remain separate from legacy activity lists, and adding one marks the author's preference", async () => {
  const f = fixture();
  await f.service.suggestPollOption("token", { guestId: "guest" }, { kind: "LOCATION", value: "校园咖啡馆" }, "https://example.test");
  const data = await f.service.getTimePoll("token", { guestId: "guest" }, "https://example.test");
  assert.deepEqual(data.activitySelection.ideas.map(item => item.id), [f.a.id, f.b.id]);
  assert.equal(data.collaboration.options.filter(item => item.kind === "LOCATION").length, 2);
  const suggested = data.collaboration.options.find(item => item.id.startsWith("new-"));
  assert.equal(suggested?.interestedBy[0].isMe, true);
});

test("fixed time with an open location stays collecting; a fully specified plan can invite directly", async () => {
  const base = { title: "喝咖啡", timeZone: "Europe/Berlin", dates: ["2099-11-01"], startMinute: 540, endMinute: 720,
    durationMinutes: 60, fixedStart: "2099-11-01T08:00:00.000Z", planningMode: "FIXED",
    collaboration: { activity: false, location: true, time: false, activityType: "咖啡", activityOptions: [], locationOptions: ["图书馆"] } };
  const f = fixture(); await f.service.createTimePoll("owner", base, "https://example.test");
  assert.equal(f.poll.phase, "COLLECTING"); assert.equal(f.poll.invitationVersion, 0);
  assert.equal(f.poll.collaboration.finalized, false); assert.equal(f.poll.activityIdeas[0].kind, "LOCATION");
  const g = fixture(); await g.service.createTimePoll("owner", { ...base, collaboration: { ...base.collaboration, location: false } }, "https://example.test");
  assert.equal(g.poll.phase, "INVITING"); assert.equal(g.poll.invitationVersion, 1); assert.equal(g.poll.collaboration.finalized, true);
});

test("the organizer's final arrangement is stored with a new invitation version and fresh individual consent", async () => {
  const f = fixture(); f.poll.phase = "INVITING"; f.poll.planningMode = "FIXED"; f.poll.invitationVersion = 2;
  f.poll.collaboration.finalized = true; f.poll.activityChosenAt = new Date();
  f.poll.chosenStart = new Date("2099-11-01T08:00:00Z"); f.poll.chosenEnd = new Date("2099-11-01T09:00:00Z");
  f.poll.invitations.push({ id: "peer-invite", userId: "peer", guestId: null, displayName: "Peer", selected: true, status: "ACCEPTED", version: 2 });
  await f.service.sendPollInvitations("token", "owner", { version: 2, attendeeIds: ["peer-invite"], linkParticipantCount: 3,
    start: "2099-11-01T09:00:00Z", end: "2099-11-01T10:00:00Z", arrangement: { title: "一起吃饭", activityType: "晚饭", location: "新地点" } }, "https://example.test");
  assert.equal(f.poll.title, "一起吃饭"); assert.equal(f.poll.location, "新地点"); assert.equal(f.poll.collaboration.activityType, "晚饭");
  assert.equal(f.poll.invitationVersion, 3); assert.equal(f.poll.invitations.find(person => person.userId === "peer")?.status, "INVITED");
  assert.equal(f.poll.collaboration.finalized, true); assert.equal(f.stats().calendarWrites, 0);
});
