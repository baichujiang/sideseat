/**
 * Read-only persistence boundaries for FiveRootTogetherLiveUITests.
 * Only the owned local database is accepted. Every business action belongs to native UI.
 * The observer never calls the opportunities API: that GET can generate matches.
 */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const lifecyclePhases = [
  "lifecycle-draft-cancelled", "lifecycle-published", "lifecycle-edited",
  "lifecycle-paused", "lifecycle-paused-edited", "lifecycle-resumed",
  "lifecycle-share-cancelled", "lifecycle-delete-cancelled", "lifecycle-reloaded",
  "lifecycle-deleted",
] as const;
const mainPhases = [
  "owner-published", "peer-published", "profile-returned", "bookmarked",
  "bookmark-roundtrip", "composer-cancelled", "greeting-sent", "reply-sent", "chat-roundtrip",
] as const;
const scenarioPhases: Record<string, readonly string[]> = {
  main: [...lifecyclePhases, ...mainPhases],
  discovery: ["edge-owner-published", "edge-peer-published", "edge-inline-results", "edge-profile-returned",
    "edge-bookmarked", "edge-unbookmarked", "edge-empty-saved-returned", "edge-composer-cancelled",
    "edge-draft-restored", "edge-hide-undone", "edge-hide-committed", "edge-hidden-reloaded"],
  safety: ["safety-owner-published", "safety-peer-published", "safety-profile-opened", "safety-report-cancelled",
    "safety-reported", "safety-block-cancelled", "safety-blocked", "safety-peer-reloaded", "safety-owner-reloaded"],
  input: ["categories-validated", "exact-windows-selected", "cancel-reopen-preserved", "account-drafts-isolated",
    "exact-save-readback", "timing-edge-ui-deleted", "save-failed-no-server-write", "save-retry-created-once", "retry-edge-ui-deleted"],
};
type Account = { role: "owner" | "peer"; id: string; identifier: string };
type Fixture = {
  kind: string; schemaVersion: number; runID: string; baseURL: string; accounts: Account[];
  activityTitle?: string; lifecycleTitle?: string; editedTitle?: string;
  pausedEditedTitle?: string; greeting?: string; reply?: string;
  reportDetails?: string; inputTimingTitle?: string; inputRetryTitle?: string;
};
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

async function main() {
  const args = process.argv.slice(2);
  const scenarioIndex = args.indexOf("--scenario");
  const scenario = scenarioIndex < 0 ? "main" : args[scenarioIndex + 1];
  assert(scenario && Object.hasOwn(scenarioPhases, scenario), "Scenario must be main, discovery, safety or input.");
  if (scenarioIndex >= 0) args.splice(scenarioIndex, 2);
  const [mode = "--snapshot", logArgument] = args;
  assert(["--snapshot", "snapshot", "observe"].includes(mode) && args.length <= 2,
    "Use [--scenario main|discovery|safety|input] --snapshot or observe <xcode-log>.");
  const selectedPhases = scenarioPhases[scenario]!;
  const privateDir = path.resolve(process.env.SIDESEAT_FIVE_ROOT_PRIVATE_DIR || "/tmp/sideseat-five-roots-private");
  assert(/^\/tmp\/sideseat-five-roots-[a-zA-Z0-9_-]+$/.test(privateDir), "Use the owned private QA directory.");
  assert((await fs.lstat(privateDir)).isDirectory(), "The private directory must not be a symlink.");
  await fs.chmod(privateDir, 0o700);
  const fixturePath = path.join(privateDir, "fixture.json");
  assert((await fs.lstat(fixturePath)).isFile(), "The fixture must be a regular file.");
  const fixture = JSON.parse(await fs.readFile(fixturePath, "utf8")) as Fixture;
  assert(fixture.kind === "five-roots-live" && fixture.schemaVersion === 1, "Unrecognized fixture.");
  assert(fixture.baseURL === "http://127.0.0.1:3344", "This observer cannot access production.");
  assert(/^[a-f0-9]{12}$/.test(fixture.runID), "Invalid private run identity.");
  assert(fixture.accounts.length === 2, "Expected exactly the two owned accounts.");
  for (const role of ["owner", "peer"] as const) {
    const accounts = fixture.accounts.filter(account => account.role === role);
    assert(accounts.length === 1 && accounts[0]!.id, "Each owned role must have one server identity.");
    assert(accounts[0]!.identifier === `e2e_roots_${role}_${fixture.runID}`, "Only this run's accounts are allowed.");
  }
  const ids = fixture.accounts.map(account => account.id);
  assert(new Set(ids).size === 2, "The two account identities must differ.");
  const ownerID = fixture.accounts.find(account => account.role === "owner")!.id;
  const peerID = fixture.accounts.find(account => account.role === "peer")!.id;
  const databaseURL = new URL(process.env.DATABASE_URL || "http://invalid");
  assert(databaseURL.protocol === "postgresql:" || databaseURL.protocol === "postgres:");
  assert(databaseURL.hostname === "127.0.0.1" && databaseURL.port === "15434", "Only the owned port-15434 database is allowed.");
  assert(databaseURL.pathname === "/sideseat_five_roots_20261026", "Only the dedicated five-root database is allowed.");
  if (process.env.DATABASE_URL_UNPOOLED) {
    const direct = new URL(process.env.DATABASE_URL_UNPOOLED);
    assert(direct.host === databaseURL.host && direct.pathname === databaseURL.pathname, "Direct database must match the owned database.");
  }
  const activity = fixture.activityTitle || (scenario === "discovery" ? "五页同行发现边界"
    : scenario === "safety" ? "五页同行安全边界" : "五页同行真实闭环");
  const lifecycle = fixture.lifecycleTitle || "五页同行编辑咖啡";
  const edited = fixture.editedTitle || lifecycle + " 已修改";
  const pausedEdited = fixture.pausedEditedTitle || lifecycle + " 暂停编辑";
  const greeting = fixture.greeting || "五页同行首条招呼";
  const reply = fixture.reply || "五页同行收到回复";
  const reportDetails = fixture.reportDetails || "五页同行QA举报测试";
  const timingTitle = fixture.inputTimingTitle || "同行时间边界 " + ownerID.slice(-8);
  const retryTitle = fixture.inputRetryTitle || "同行重试边界 " + ownerID.slice(-8);
  const allowedReads = new Set(["findMany", "findUnique", "findFirst", "count", "aggregate", "groupBy"]);
  const client = new PrismaClient();
  const db = client.$extends({ query: { $allModels: { async $allOperations({ operation, args, query }) {
    assert(allowedReads.has(operation), "The observer is read-only; a mutation was rejected.");
    return query(args);
  } } } });
  const output = path.resolve(process.env.SIDESEAT_QA_OUTPUT || path.join(privateDir, "together-observer"));
  await fs.mkdir(output, { recursive: true });
  const statePath = path.join(privateDir, "together-observer-state.json");
  const reportPath = path.join(output, "together-persistence-boundaries.json");
  const required = process.env.SIDESEAT_TOGETHER_REQUIRED_PHASES?.split(",").filter(Boolean) || [...selectedPhases];
  assert(required.length > 0 && required.every(phase => selectedPhases.includes(phase)), "Required phases must belong to the selected scenario.");
  assert(new Set(required).size === required.length, "Required phases must be unique.");
  const seen = new Set<string>();
  const checks: Record<string, unknown>[] = [];
  const history = new Map<string, { id: string; version: number }>();
  let lifecycleIdentity: string | undefined;
  const inputIdentities = new Map<string, { id: string; version: number }>();
  let faultBaseline: number | undefined;
  let nativeSummary: { tests: number; failures: number; skipped: number } | undefined;
  let stopped = false, completed = false, current = "starting";
  const stop = () => { stopped = true; };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);

  async function snapshot() {
    const users = await db.user.findMany({ select: { id: true, username: true } });
    assert(users.length === 2 && users.every(user => fixture.accounts.some(account => account.id === user.id && account.identifier === user.username)),
      "The database must contain only this run's owned users.");
    const [intents, opportunities, bookmarks, requests, connections, messages, plans, polls, calendars, outbox, decisions, reports, blocks] = await Promise.all([
      db.weeklyIntent.findMany({ orderBy: { createdAt: "asc" }, select: {
        id: true, userId: true, topic: true, activityText: true, status: true, version: true,
        timeWindows: true, timePreference: true, automaticMatching: true, exploreVisible: true,
        shareToken: true, endedAt: true, note: true,
      } }),
      db.mutualOpportunity.findMany({ select: {
        id: true, userAId: true, userBId: true, intentAId: true, intentBId: true,
        topic: true, activityText: true, status: true, connectionId: true,
      } }),
      db.mutualOpportunityBookmark.findMany({ select: { opportunityId: true, userId: true } }),
      db.mutualOpportunityMessageRequest.findMany({ select: { opportunityId: true, senderId: true, body: true, status: true } }),
      db.connection.findMany({ select: { id: true, userAId: true, userBId: true, status: true, replyLimitUnlockedAt: true } }),
      db.message.findMany({ orderBy: { createdAt: "asc" }, select: {
        id: true, connectionId: true, senderId: true, body: true, type: true, mutualOpportunityId: true, deletedAt: true,
      } }),
      db.planRequest.count(), db.timePoll.count(), db.calendarEntry.count(), db.notificationOutbox.count(),
      db.mutualOpportunityDecision.findMany({ select: { opportunityId: true, userId: true, value: true } }),
      db.report.findMany({ select: { reporterId: true, reportedUserId: true, reason: true, details: true, status: true } }),
      db.block.findMany({ select: { blockerId: true, blockedId: true, connectionId: true } }),
    ]);
    assert(intents.every(intent => ids.includes(intent.userId)), "An intention belongs to an unexpected actor.");
    assert(opportunities.every(opportunity => opportunity.userAId !== opportunity.userBId
      && ids.includes(opportunity.userAId) && ids.includes(opportunity.userBId)
      && intents.find(intent => intent.id === opportunity.intentAId)?.userId === opportunity.userAId
      && intents.find(intent => intent.id === opportunity.intentBId)?.userId === opportunity.userBId), "An opportunity crosses or misidentifies the owned pair.");
    assert(reports.every(row => ids.includes(row.reporterId) && ids.includes(row.reportedUserId)), "A report crosses the owned pair.");
    assert(blocks.every(row => ids.includes(row.blockerId) && ids.includes(row.blockedId)), "A block crosses the owned pair.");
    return { intents, opportunities, bookmarks, requests, connections, messages, plans, polls, calendars, outbox, decisions, reports, blocks };
  }
  type Snapshot = Awaited<ReturnType<typeof snapshot>>;
  const counts = (s: Snapshot) => ({ intentions: s.intents.length, currentIntentions: s.intents.filter(row => ["ACTIVE", "PAUSED"].includes(row.status)).length,
    opportunities: s.opportunities.length, bookmarks: s.bookmarks.length, messageRequests: s.requests.length,
    canonicalChats: s.connections.length, chatMessages: s.messages.length, plans: s.plans, timePolls: s.polls, calendarEntries: s.calendars,
    privateDecisions: s.decisions.length, reports: s.reports.length, blocks: s.blocks.length });
  function mainRows(s: Snapshot) {
    const rows = s.intents.filter(row => row.activityText === activity && row.status === "ACTIVE");
    const owner = rows.find(row => row.userId === ownerID);
    const peer = rows.find(row => row.userId !== ownerID);
    const matches = owner && peer ? s.opportunities.filter(row =>
      [row.intentAId, row.intentBId].includes(owner.id) && [row.intentAId, row.intentBId].includes(peer.id)) : [];
    assert(matches.length <= 1, "The owned intention pair must not produce duplicate opportunities.");
    return { owner, peer, opportunity: matches[0] };
  }
  async function writeState(s: Snapshot) {
    const { owner, peer, opportunity } = mainRows(s);
    const state = { checkedAt: new Date().toISOString(), scenario, runIdentitySHA256: sha(fixture.runID), seenPhases: [...seen],
      ...(owner ? { ownerIntentID: owner.id } : {}), ...(peer ? { peerIntentID: peer.id } : {}),
      ...(opportunity ? { opportunityID: opportunity.id, ...(opportunity.connectionId ? { connectionID: opportunity.connectionId } : {}) } : {}) };
    const temporary = path.join(privateDir, `together-observer-${randomUUID()}.tmp`);
    await fs.writeFile(temporary, JSON.stringify(state, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    await fs.rename(temporary, statePath);
  }
  async function report(failure = false) {
    await fs.writeFile(reportPath, JSON.stringify({ passed: completed && !failure, scenario, scope: "Selected Together scenario only; real native UI with owned local API/PostgreSQL",
      businessMutations: "Native UI only; observer uses database reads, optional proxy-state GET, and evidence-file writes",
      runIdentitySHA256: sha(fixture.runID), expectedPhases: required, checks, nativeSummary,
      missingPhases: required.filter(phase => !seen.has(phase)),
      failure: failure ? { phase: current, message: "Boundary assertion failed; private diagnostic retained." } : null,
      checkedAt: new Date().toISOString() }, null, 2) + "\n");
  }
  function noPlans(s: Snapshot) {
    assert(s.plans === 0 && s.polls === 0 && s.calendars === 0, "Together must not implicitly create a plan or calendar projection.");
  }
  function noContact(s: Snapshot) {
    assert(s.requests.length === 0 && s.connections.length === 0 && s.messages.length === 0, "No greeting or chat may be created before explicit send/reply.");
  }
  function verifyLifecycle(phase: string, s: Snapshot) {
    noContact(s); assert(s.bookmarks.length === 0 && s.opportunities.length === 0, "The isolated lifecycle must not contact the peer.");
    const rows = s.intents.filter(row => row.userId === ownerID && [lifecycle, edited, pausedEdited].includes(row.activityText || ""));
    assert(rows.length === (phase === "lifecycle-draft-cancelled" ? 0 : 1), "Lifecycle must create exactly one intention after explicit publish.");
    if (!rows.length) return {};
    const row = rows[0]!;
    lifecycleIdentity ||= row.id; assert(row.id === lifecycleIdentity, "Lifecycle edits must retain the same intention identity.");
    assert(row.topic === "COFFEE");
    const expectedTitle = phase === "lifecycle-published" ? lifecycle
      : ["lifecycle-edited", "lifecycle-paused"].includes(phase) ? edited : pausedEdited;
    assert(row.activityText === expectedTitle, "The saved lifecycle title must match its UI edit.");
    const expectedStatus = phase === "lifecycle-deleted" ? "ENDED"
      : ["lifecycle-paused", "lifecycle-paused-edited"].includes(phase) ? "PAUSED" : "ACTIVE";
    assert(row.status === expectedStatus, "Lifecycle status must match the UI action.");
    if (phase === "lifecycle-deleted") assert(row.endedAt !== null, "Delete must terminate the same intention.");
    const prior = [...lifecyclePhases].slice(0, lifecyclePhases.indexOf(phase as typeof lifecyclePhases[number])).reverse().map(name => history.get(name)).find(Boolean);
    if (prior) {
      assert(row.id === prior.id);
      if (["lifecycle-edited", "lifecycle-paused", "lifecycle-paused-edited", "lifecycle-resumed", "lifecycle-deleted"].includes(phase)) {
        assert(row.version > prior.version, "A committed lifecycle mutation must advance its version.");
      } else assert(row.version >= prior.version, "Read/return must not roll back version.");
    }
    history.set(phase, { id: row.id, version: row.version });
    return { status: row.status, version: row.version, sameLifecycleIdentity: true, pausedEditRemainsPaused: phase === "lifecycle-paused-edited" ? true : undefined };
  }
  function verifyMain(phase: string, s: Snapshot) {
    const rows = s.intents.filter(row => row.status === "ACTIVE");
    const { owner, peer, opportunity } = mainRows(s);
    assert(owner?.topic === "COFFEE", "The owner must publish the concrete Coffee activity in the App.");
    assert(rows.length === (phase === "owner-published" ? 1 : 2), "Main flow must have exactly one owned intention per published actor.");
    if (phase === "owner-published") { noContact(s); assert(s.bookmarks.length === 0); return {}; }
    assert(peer?.topic === "COFFEE" && opportunity, "Two native publications must yield one owned opportunity.");
    assert(s.opportunities.length === 1, "No extra opportunity may be generated for this isolated pair.");
    const bookmarked = ["bookmarked", "bookmark-roundtrip", "composer-cancelled", "greeting-sent", "reply-sent", "chat-roundtrip"].includes(phase);
    assert(s.bookmarks.length === (bookmarked ? 1 : 0), "Only the explicit private bookmark may create a saved row.");
    if (bookmarked) assert(s.bookmarks[0]!.opportunityId === opportunity.id && ids.includes(s.bookmarks[0]!.userId));
    if (!["greeting-sent", "reply-sent", "chat-roundtrip"].includes(phase)) {
      noContact(s); assert(opportunity.connectionId === null);
      assert(s.outbox === 0, "Bookmarking or previewing must not enqueue a plan notification.");
      return { privateBookmarkOnly: bookmarked, noImplicitContact: true };
    }
    assert(s.requests.length === 1, "Exactly one explicit first message is allowed.");
    const request = s.requests[0]!;
    assert(request.opportunityId === opportunity.id && ids.includes(request.senderId) && request.body === greeting, "The original greeting must be stored once with the owned opportunity.");
    if (phase === "greeting-sent") {
      assert(request.status === "PENDING" && opportunity.connectionId === null);
      assert(s.connections.length === 0 && s.messages.length === 0, "A first message must not create canonical chat before the written reply.");
      return { oneGreetingOnly: true, canonicalChatRequiresWrittenReply: true };
    }
    assert(request.status === "REPLIED" && opportunity.status === "MUTUAL");
    assert(s.connections.length === 1 && opportunity.connectionId === s.connections[0]!.id, "The written reply must create or reuse exactly one canonical chat.");
    const connection = s.connections[0]!;
    assert(connection.status === "ACTIVE" && connection.replyLimitUnlockedAt !== null);
    assert(new Set([connection.userAId, connection.userBId]).size === 2 && [connection.userAId, connection.userBId].every(id => ids.includes(id)));
    assert(s.messages.length === 3 && s.messages.every(message => message.connectionId === connection.id && message.deletedAt === null), "Context, greeting and reply must remain in one chat without duplicates.");
    const context = s.messages.filter(message => message.type === "MUTUAL_OPPORTUNITY_CARD");
    assert(context.length === 1 && context[0]!.mutualOpportunityId === opportunity.id);
    const texts = s.messages.filter(message => message.type === "TEXT");
    assert(texts.length === 2 && texts[0]!.body === greeting && texts[0]!.senderId === request.senderId);
    assert(texts[1]!.body === reply && ids.includes(texts[1]!.senderId) && texts[1]!.senderId !== request.senderId);
    return { oneCanonicalChat: true, originalGreetingAndReplyPreserved: true, sourceContextPreserved: true };
  }
  function edgePair(phase: string, s: Snapshot) {
    noContact(s);
    const { owner, peer, opportunity } = mainRows(s);
    const ownerOnly = phase.endsWith("owner-published");
    assert(s.intents.length === (ownerOnly ? 1 : 2) && s.intents.every(row => row.status === "ACTIVE" && row.topic === "COFFEE" && row.activityText === activity),
      "An edge scenario must preserve only its one or two explicitly published Coffee intentions.");
    assert(owner, "The owned organizer's intention must exist.");
    if (ownerOnly) assert(s.opportunities.length === 0, "One publication cannot produce a two-user opportunity.");
    else assert(peer && opportunity && s.opportunities.length === 1, "The exact owned pair must have one opportunity, never a duplicate.");
    return { owner, peer, opportunity };
  }
  function verifyDiscovery(phase: string, s: Snapshot) {
    const { opportunity } = edgePair(phase, s);
    assert(s.reports.length === 0 && s.blocks.length === 0, "Discovery browsing must not implicitly report or block.");
    const saved = phase === "edge-bookmarked";
    assert(s.bookmarks.length === (saved ? 1 : 0), "Only the explicit Save step may retain a bookmark.");
    if (saved) assert(s.bookmarks[0]!.userId === peerID && s.bookmarks[0]!.opportunityId === opportunity!.id);
    const hidden = ["edge-hide-committed", "edge-hidden-reloaded"].includes(phase);
    assert(s.decisions.length === (hidden ? 1 : 0), "Cancel, draft restoration and Hide Undo must not persist a private rejection.");
    if (hidden) {
      const decision = s.decisions[0]!;
      assert(decision.opportunityId === opportunity!.id && decision.userId === peerID && decision.value === "NO");
      assert(opportunity!.status === "UNAVAILABLE", "A committed rejection must terminalize the same opportunity.");
    } else if (opportunity) {
      assert(["PENDING", "DRAFT"].includes(opportunity.status) && opportunity.connectionId === null);
    }
    assert(s.outbox === 0, "Browsing and private bookmarks must not enqueue plan notifications.");
    return { onlyOwnedPair: true, explicitBookmarkOnly: true, noImplicitContact: true,
      hideUndoLeavesNoDecision: phase === "edge-hide-undone" ? true : undefined,
      committedHidePersisted: hidden || undefined, noDuplicateOpportunity: true };
  }
  function verifySafety(phase: string, s: Snapshot) {
    const { owner, opportunity } = edgePair(phase, s);
    assert(s.bookmarks.length === 0 && s.decisions.length === 0, "Safety previews must not save or decide for the user.");
    const reported = ["safety-reported", "safety-block-cancelled", "safety-blocked", "safety-peer-reloaded", "safety-owner-reloaded"].includes(phase);
    const blocked = ["safety-blocked", "safety-peer-reloaded", "safety-owner-reloaded"].includes(phase);
    assert(s.reports.length === (reported ? 1 : 0), "Only explicit report submission may create one report.");
    if (reported) {
      const report = s.reports[0]!;
      assert(report.reporterId === peerID && report.reportedUserId === ownerID && report.reason === "OTHER" && report.status === "OPEN");
      assert(report.details === `[Together opportunity: ${opportunity!.id}; intention: ${owner.id}]\n${activity}\n${reportDetails}`,
        "The report must retain its precise owned intention context and entered details.");
    }
    assert(s.blocks.length === (blocked ? 1 : 0), "Only explicit Block confirmation may install the directed barrier.");
    if (blocked) {
      const block = s.blocks[0]!;
      assert(block.blockerId === peerID && block.blockedId === ownerID && block.connectionId === null);
      assert(opportunity!.status === "UNAVAILABLE" && opportunity!.connectionId === null);
    } else if (opportunity) assert(["PENDING", "DRAFT"].includes(opportunity.status));
    return { onlyOwnedPair: true, reportRequiresSubmission: true, blockRequiresConfirmation: true,
      directedBlockPersisted: blocked || undefined, noImplicitContact: true };
  }
  async function proxyState() {
    // This GET reads only the owned transport proxy's counter, never a business API.
    const response = await fetch("http://127.0.0.1:3345/__qa/state", { method: "GET", redirect: "error", signal: AbortSignal.timeout(5_000) });
    assert(response.status === 200, "The owned failure proxy state must be readable.");
    const state = await response.json() as { pending: boolean; injected: number };
    assert(typeof state.pending === "boolean" && Number.isSafeInteger(state.injected) && state.injected >= 0);
    return state;
  }
  async function verifyInput(phase: string, s: Snapshot) {
    noContact(s);
    assert(s.opportunities.length === 0 && s.bookmarks.length === 0 && s.decisions.length === 0 && s.reports.length === 0 && s.blocks.length === 0);
    assert(s.intents.every(row => row.userId === ownerID && [timingTitle, retryTitle].includes(row.activityText || "")),
      "Input edges must not write to the other account or overwrite unrelated intentions.");
    const timingRows = s.intents.filter(row => row.activityText === timingTitle);
    const retryRows = s.intents.filter(row => row.activityText === retryTitle);
    const timingSaved = ["exact-save-readback", "timing-edge-ui-deleted"].includes(phase);
    const retrySaved = ["save-retry-created-once", "retry-edge-ui-deleted"].includes(phase);
    const targetRows = timingSaved ? timingRows : retrySaved ? retryRows : [];
    const targetTitle = timingSaved ? timingTitle : retryTitle;
    const deleted = phase.endsWith("ui-deleted");
    if (["categories-validated", "exact-windows-selected", "cancel-reopen-preserved", "account-drafts-isolated"].includes(phase)) {
      assert(timingRows.length === 0 && retryRows.every(row => row.status === "ENDED"),
        "Unsubmitted timing drafts must have no server row; a prior retry case may retain only its ended intention.");
      return { unsavedDraftHasNoServerRow: true, noImplicitContact: true };
    }
    if (phase === "save-failed-no-server-write") {
      assert(retryRows.length === 0 && s.intents.every(row => row.status === "ENDED"), "A rejected transport request must not create a live intention.");
      const state = await proxyState();
      assert(faultBaseline !== undefined && !state.pending && state.injected === faultBaseline + 1, "Exactly one armed 503 must be consumed without forwarding.");
      return { failedSaveHasNoServerRow: true, oneControlledTransport503: true };
    }
    assert(targetRows.length === 1, "One explicit successful save must create exactly one intention.");
    const row = targetRows[0]!;
    assert(row.topic === "COFFEE" && row.note === null && row.status === (deleted ? "ENDED" : "ACTIVE"));
    if (deleted) assert(row.endedAt !== null);
    const preference = row.timePreference as { kind?: unknown } | null;
    assert(preference?.kind === "EXACT", "Successful input must persist the declared exact timing kind.");
    assert(Array.isArray(row.timeWindows) && row.timeWindows.length === 2, "Both confirmed windows must survive save/retry.");
    const windows = row.timeWindows as { startAt?: unknown; endAt?: unknown }[];
    const normalized = windows.map(window => {
      assert(typeof window.startAt === "string" && typeof window.endAt === "string");
      const start = new Date(window.startAt), end = new Date(window.endAt);
      assert(Number.isFinite(start.getTime()) && Number.isFinite(end.getTime()) && end.getTime() - start.getTime() >= 30 * 60_000);
      assert(start.getUTCMinutes() % 15 === 0 && end.getUTCMinutes() % 15 === 0 && start.getUTCSeconds() === 0 && end.getUTCSeconds() === 0);
      return { start: start.getTime(), end: end.getTime() };
    }).sort((a, b) => a.start - b.start);
    assert(normalized[0]!.start !== normalized[1]!.start && normalized[0]!.end <= normalized[1]!.start, "Saved windows must be distinct and nonoverlapping.");
    if (!deleted) assert(normalized.every(window => window.start > Date.now()), "The App must create future exact windows.");
    const identity = inputIdentities.get(targetTitle);
    if (identity) {
      assert(identity.id === row.id, "Delete/reload must retain the original intention identity.");
      assert(row.version > identity.version, "Explicit UI deletion must advance the same intention version.");
    }
    inputIdentities.set(targetTitle, { id: row.id, version: row.version });
    assert(s.intents.filter(intent => intent.status === "ACTIVE").length === (deleted ? 0 : 1));
    if (retrySaved) {
      const state = await proxyState();
      assert(faultBaseline !== undefined && !state.pending && state.injected === faultBaseline + 1, "Retry must reach the real service without injecting another failure.");
    }
    return { exactWindowCount: 2, persistedTimingKind: "EXACT", oneExplicitSaveOnly: true,
      sameIntentionIdentity: true, status: row.status, version: row.version, noImplicitContact: true };
  }
  async function verify(phase: string) {
    const s = await snapshot(); noPlans(s);
    const details = scenario === "discovery" ? verifyDiscovery(phase, s) : scenario === "safety" ? verifySafety(phase, s)
      : scenario === "input" ? await verifyInput(phase, s)
      : lifecyclePhases.includes(phase as typeof lifecyclePhases[number]) ? verifyLifecycle(phase, s) : verifyMain(phase, s);
    seen.add(phase); checks.push({ phase, ...counts(s), ...details, checkedAt: new Date().toISOString() });
    await writeState(s); await report(); console.log(`Together persistence boundary passed: ${phase}`);
  }
  try {
    if (mode !== "observe") {
      const s = await snapshot(); await writeState(s);
      await fs.writeFile(path.join(output, "together-readonly-snapshot.json"), JSON.stringify({ checkedAt: new Date().toISOString(), scenario, ...counts(s),
        allActorsOwned: true, businessMutationsPerformed: false }, null, 2) + "\n");
      console.log("Owned local Together snapshot saved; no business mutation performed."); return;
    }
    assert(logArgument, "Supply the actual xcodebuild test log.");
    const logPath = path.resolve(logArgument);
    const existingLog = await fs.readFile(logPath, "utf8").catch(() => "");
    assert(!/FIVE_ROOT_TOGETHER(?:_EDGE)?_PHASE |\*\* TEST (?:EXECUTE )?(?:SUCCEEDED|FAILED) \*\*/.test(existingLog),
      "Start the observer before business phases using a fresh, single-invocation XCTest log.");
    if (scenario === "input" && required.some(phase => ["save-failed-no-server-write", "save-retry-created-once", "retry-edge-ui-deleted"].includes(phase))) {
      const state = await proxyState();
      assert(!state.pending, "The prior controlled fault must be consumed before starting a fresh input run.");
      faultBaseline = state.injected;
    }
    const timeout = Number(process.env.SIDESEAT_TOGETHER_TIMEOUT_MS || 1_800_000);
    assert(Number.isFinite(timeout) && timeout > 0 && timeout <= 3_600_000);
    const deadline = Date.now() + timeout;
    while (!stopped && Date.now() < deadline) {
      const log = await fs.readFile(logPath, "utf8").catch(() => "");
      for (const [, phase] of log.matchAll(/FIVE_ROOT_TOGETHER(?:_EDGE)?_PHASE ([a-z-]+)/g)) {
        assert(selectedPhases.includes(phase!), "A phase outside the selected scenario cannot silently pass.");
        if (!seen.has(phase!)) { current = phase!; await verify(phase!); }
      }
      const terminalMarkers = [...log.matchAll(/\*\* TEST (?:EXECUTE )?(SUCCEEDED|FAILED) \*\*/g)];
      if (terminalMarkers.length) {
        assert(terminalMarkers.length === 1 && terminalMarkers[0]![1] === "SUCCEEDED", "The single native invocation must finish successfully.");
        // A child/empty suite saying "passed" is not acceptance. Require the final
        // xcodebuild marker plus an actual nonempty, failure/skip-free XCTest summary.
        const executed = [...log.matchAll(/Executed (\d+) tests?[^\r\n]*/g)].at(-1);
        assert(executed, "A real executed-test summary is required.");
        const failures = executed[0].match(/(\d+) failures?/);
        const skipped = executed[0].match(/(\d+) tests? skipped/);
        assert(failures, "The executed-test summary must contain a failure count.");
        nativeSummary = { tests: Number(executed[1]), failures: Number(failures[1]), skipped: Number(skipped?.[1] || 0) };
        assert(nativeSummary.tests > 0 && nativeSummary.failures === 0 && nativeSummary.skipped === 0,
          "An empty, failed or skipped suite cannot complete this scenario.");
        assert(required.every(phase => seen.has(phase)), "The native run did not reach every required boundary.");
        completed = true; await report(); break;
      }
      await writeState(await snapshot());
      await sleep(400);
    }
    assert(completed, stopped ? "Observer interrupted before completion." : "Observer timed out before full native completion.");
  } catch (error) {
    await fs.writeFile(path.join(privateDir, "together-observer-failure.txt"), String(error instanceof Error ? error.stack : error) + "\n", { mode: 0o600 });
    await report(true); process.exitCode = 1; console.error("Together observer failed; inspect the private diagnostic.");
  } finally {
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
    await client.$disconnect();
  }
}

main().catch(() => {
  // Setup errors are deliberately sanitized so a malformed URL/config never leaks credentials.
  console.error("Together observer setup failed; check the owned local fixture/database configuration.");
  process.exitCode = 1;
});
