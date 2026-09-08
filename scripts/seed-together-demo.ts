/**
 * Scoped manual Together demo for the owner-confirmed test_001 account.
 * Dry run by default. Profiles/course are seed fixtures; all intents and
 * matching sessions go through the real native API. Never inserts opportunities,
 * decisions, Plans, Outcomes or Shared Encounters, and never resets user history.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import { isInternalAccount } from "../lib/analytics/layer2-outcome-pilot";
import { weeklyIntentCreateSchema } from "../lib/validators/weekly-intent";
import { weeklyIntentExpiry } from "../lib/v2/weekly-intent-policy";
import { demoBatch, demoIntentInput } from "./lib/together-demo-catalog";

const { values } = parseArgs({
  options: {
    apply: { type: "boolean", default: false },
    production: { type: "boolean", default: false },
    run: { type: "string" },
    batch: { type: "string", default: "categories" },
    "base-url": { type: "string" },
  },
});
const run = values.run ?? "";
assert.ok(
  run && /^[a-z0-9]{1,12}$/.test(run),
  "--run must be a fresh 1–12 character lowercase run name.",
);
const cases = demoBatch(values.batch!);
const target = "test_001";
const dbURL = new URL(
  process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
);
const baseURL = new URL(
  values["base-url"] ??
    (values.production ? "https://api.sideseat.de" : "http://127.0.0.1:3015"),
);
if (values.production) {
  assert.equal(
    dbURL.hostname,
    "ep-muddy-glitter-apcgou54.c-7.us-east-1.aws.neon.tech",
  );
  assert.equal(dbURL.pathname, "/neondb");
  assert.equal(baseURL.origin, "https://api.sideseat.de");
} else {
  assert.ok(
    ["127.0.0.1", "localhost"].includes(dbURL.hostname),
    "Non-local DB requires explicit --production.",
  );
  assert.ok(["127.0.0.1", "localhost"].includes(baseURL.hostname));
}
const db = new PrismaClient({ datasources: { db: { url: dbURL.toString() } } });
const usernamePrefix = `qa_mutual_demo_${run}_`;
const courseCode = `QA-TG-${run}`;
const notePrefix = `QA-DEMO:${run}:`;
const now = new Date();
// Leave a useful manual testing period before the first opportunity expires.
const startsAt = new Date(
  Math.ceil((now.getTime() + 18 * 3_600_000) / 3_600_000) * 3_600_000,
);
const endsAt = new Date(startsAt.getTime() + 2 * 3_600_000);
const window = { startAt: startsAt.toISOString(), endAt: endsAt.toISOString() };
assert.ok(
  endsAt <= weeklyIntentExpiry("Europe/Berlin", now),
  "The demo must finish this week; run after the week resets.",
);
for (const item of cases)
  weeklyIntentCreateSchema.parse(
    demoIntentInput(item, "qa-preflight", window, run),
  );

type Login = { token: string; refreshToken: string; userId: string };
const logins: Login[] = [];
async function api(
  path: string,
  login?: Login,
  method = "GET",
  data?: unknown,
) {
  const response = await fetch(new URL(path, baseURL), {
    method,
    headers: {
      Accept: "application/json",
      ...(login ? { Authorization: `Bearer ${login.token}` } : {}),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      ...(method === "GET"
        ? {}
        : { "Idempotency-Key": `qa-demo-${run}-${randomUUID()}` }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(
      `${method} ${path}: HTTP ${response.status} (${payload.error?.code ?? "request failed"})`,
    );
  return payload.data;
}
async function login(identifier: string, password: string): Promise<Login> {
  const data = await api("/api/v1/auth/login", undefined, "POST", {
    identifier,
    password,
    device: {
      id: `qa-demo-${run}-${identifier}`,
      name: "Together QA seed",
      appVersion: "1.0.0",
      platformVersion: "QA",
    },
  });
  const session = {
    token: data.tokens.accessToken,
    refreshToken: data.tokens.refreshToken,
    userId: data.user.id,
  };
  logins.push(session);
  return session;
}

async function main() {
  const owner = await db.user.findUniqueOrThrow({
    where: { username: target },
    select: {
      id: true,
      school: true,
      verifiedStudent: true,
      onboardingComplete: true,
      hideFromDiscovery: true,
      hideFromRecommendations: true,
      userLanguages: { select: { tag: true, proficiency: true } },
    },
  });
  assert.ok(owner.verifiedStudent && owner.onboardingComplete && owner.school);
  assert.ok(
    !owner.hideFromDiscovery &&
      !owner.hideFromRecommendations &&
      owner.userLanguages.length > 0,
  );
  const existingCount = await db.weeklyIntent.count({
    where: {
      userId: owner.id,
      status: { in: ["ACTIVE", "PAUSED"] },
      expiresAt: { gt: now },
    },
  });
  assert.ok(
    existingCount + cases.length <= 12,
    "Existing intentions plus this batch exceed 12; explicitly end completed demo intentions first.",
  );
  assert.equal(
    await db.user.count({
      where: { username: { startsWith: usernamePrefix } },
    }),
    0,
    "Run already exists; inspect its evidence instead of overwriting or duplicating it.",
  );
  assert.equal(await db.course.count({ where: { code: courseCode } }), 0);
  assert.ok(
    cases.every((item) => isInternalAccount(`${usernamePrefix}${item.key}`)),
  );
  console.log(
    JSON.stringify({
      mode: values.apply ? "APPLY" : "DRY_RUN",
      target,
      batch: values.batch,
      existingIntentsPreserved: existingCount,
      newIntents: cases.length,
      newQAPeers: cases.length,
      categories: cases.map((item) => item.label),
      window,
      isolation: "explicit same-course scope",
      outcomeWrites: 0,
    }),
  );
  if (!values.apply) return;

  const ownerPassword = process.env.SIDESEAT_QA_PASSWORD;
  assert.ok(
    ownerPassword,
    "SIDESEAT_QA_PASSWORD is required; no credentials are printed.",
  );
  const ownerLogin = await login(target, ownerPassword);
  assert.equal(
    ownerLogin.userId,
    owner.id,
    "API and seed DB must identify the same account.",
  );
  const matchingBefore = await api(
    "/api/v1/me/together-matching-session",
    ownerLogin,
  );
  const peerPassword = randomBytes(32).toString("base64url");
  const hashedPassword = await bcrypt.hash(peerPassword, 12);
  const course = await db.$transaction(
    async (tx) => {
      const created = await tx.course.create({
        data: {
          code: courseCode,
          name: `QA 同行演示 ${run}（非真实课程）`,
          school: owner.school!,
          semesterLabel: "QA internal",
          submittedById: owner.id,
        },
      });
      await tx.userCourse.create({
        data: {
          userId: owner.id,
          courseId: created.id,
          intentions: [],
          activeUntil: endsAt,
          inboxHiddenAt: now,
        },
      });
      for (const [index, item] of cases.entries()) {
        const nickname = `QA 测试·${item.label} ${run}`;
        await tx.user.create({
          data: {
            username: `${usernamePrefix}${item.key}`,
            hashedPassword,
            nickname,
            nicknameKey: nickname.toLowerCase(),
            school: owner.school,
            major: "QA 内部测试",
            degreeLevel: "BACHELOR",
            semester: 1,
            avatarUrl: `p${String(index + 1).padStart(2, "0")}`,
            bio: "QA 测试资料，不对应真实用户或真实邀约；仅用于同行匹配演示。",
            onboardingComplete: true,
            productTutorialDismissedAt: now,
            verifiedStudent: true,
            studentVerificationStatus: "VERIFIED",
            studentVerificationMethod: "MANUAL_DOCUMENT",
            studentVerifiedAt: now,
            studentVerificationNotes: `Synthetic QA fixture ${run}; not an actual student verification.`,
            hideFromCourseMembers: true,
            discoverByCourse: false,
            discoverByMajor: false,
            discoverBySemester: false,
            allowInvitationNotes: false,
            userLanguages: { create: owner.userLanguages },
            courses: {
              create: {
                courseId: created.id,
                intentions: [],
                activeUntil: endsAt,
                inboxHiddenAt: now,
              },
            },
          },
        });
      }
      return created;
    },
    { timeout: 30_000 },
  );

  for (const item of cases) {
    const peer = await login(`${usernamePrefix}${item.key}`, peerPassword);
    await api(
      "/api/v1/me/weekly-intents",
      peer,
      "POST",
      demoIntentInput(item, course.id, window, run),
    );
    await api("/api/v1/me/together-matching-session", peer, "POST");
    await api(
      "/api/v1/me/weekly-intents",
      ownerLogin,
      "POST",
      demoIntentInput(item, course.id, window, run),
    );
  }
  if (matchingBefore.state !== "MATCHING") {
    await api("/api/v1/me/together-matching-session", ownerLogin, "POST");
  }
  const list = await api("/api/v1/me/mutual-opportunities", ownerLogin);
  const ownIntents = await db.weeklyIntent.findMany({
    where: { userId: owner.id, note: { startsWith: notePrefix } },
    select: { id: true },
  });
  const ownIds = new Set(ownIntents.map((intent) => intent.id));
  const cards = list.opportunities.filter((item: { viewerIntentId: string }) =>
    ownIds.has(item.viewerIntentId),
  );
  assert.equal(
    cards.length,
    cases.length,
    "Every new intent must have a real API opportunity.",
  );
  for (const card of cards) {
    assert.equal(card.state, "NEEDS_DECISION");
    assert.equal(card.matchFit?.score, 100);
  }
  const persisted = await db.mutualOpportunity.findMany({
    where: { courseId: course.id },
    select: {
      topic: true,
      userAId: true,
      userBId: true,
      status: true,
      decisions: { select: { id: true } },
      expiresAt: true,
    },
  });
  assert.equal(persisted.length, cases.length);
  assert.ok(
    persisted.every(
      (item) =>
        (item.userAId === owner.id || item.userBId === owner.id) &&
        item.status === "PENDING" &&
        item.decisions.length === 0,
    ),
  );
  console.log(
    JSON.stringify({
      status: "READY",
      target,
      run,
      batch: values.batch,
      realMatchingCards: cards.length,
      topics: persisted.map((item) => item.topic),
      score: "100/100",
      decisionsWritten: 0,
      outcomeWrites: 0,
      earliestCardExpiry: persisted
        .map((item) => item.expiresAt.toISOString())
        .sort()[0],
      existingMatchingSessionPreserved: matchingBefore.state === "MATCHING",
    }),
  );
}

main()
  .catch((cause: unknown) => {
    console.error(
      cause instanceof Error ? cause.message : "Together demo setup failed.",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    for (const session of logins) {
      try {
        await api("/api/v1/auth/logout", undefined, "POST", {
          refreshToken: session.refreshToken,
        });
      } catch {
        console.error(
          "A temporary QA login could not be revoked; inspect this run.",
        );
        process.exitCode = 1;
      }
    }
    await db.$disconnect();
  });
