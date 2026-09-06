import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizeWeeklyIntentWindows,
  weeklyIntentExpiry,
  weeklyIntentWindowsFitLifecycle,
} from "../../lib/v2/weekly-intent-policy";
import {
  weeklyIntentCreateSchema,
  weeklyIntentPatchSchema,
} from "../../lib/validators/weekly-intent";

const validCreate = {
  topic: "COFFEE",
  courseId: null,
  timeWindows: [
    {
      startAt: "2026-09-01T10:00:00.000+02:00",
      endAt: "2026-09-01T11:00:00.000+02:00",
    },
  ],
  timeZone: "Europe/Berlin",
  note: "Coffee after class",
};

test("Weekly Intent input is strict, bounded, and activity-first", () => {
  assert.equal(weeklyIntentCreateSchema.safeParse(validCreate).success, true);
  assert.equal(
    weeklyIntentCreateSchema.safeParse({ ...validCreate, desiredPersonId: "u2" })
      .success,
    false,
  );
  assert.equal(
    weeklyIntentCreateSchema.safeParse({ ...validCreate, timeZone: "Berlin" })
      .success,
    false,
  );
  assert.equal(
    weeklyIntentCreateSchema.safeParse({
      ...validCreate,
      note: "x".repeat(161),
    }).success,
    false,
  );
});

test("general categories accept one bounded concrete activity while topic-specific fields stay separate", () => {
  const parsed = weeklyIntentCreateSchema.safeParse({
    ...validCreate,
    activityText: "  Coffee and a short walk  ",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.activityText, "Coffee and a short walk");
  }
  assert.equal(
    weeklyIntentCreateSchema.safeParse({
      ...validCreate,
      activityText: "x".repeat(81),
    }).success,
    false,
  );
  assert.equal(
    weeklyIntentCreateSchema.safeParse({
      ...validCreate,
      topic: "STUDY",
      activityText: "Exam revision",
    }).success,
    false,
  );
  // Old clients may omit the additive field until they age out.
  assert.equal(weeklyIntentCreateSchema.safeParse(validCreate).success, true);
});

test("Weekly Intent keeps legacy SPORTS payloads readable and validates concrete sports", () => {
  const sports = { ...validCreate, topic: "SPORTS" };
  assert.equal(
    weeklyIntentCreateSchema.safeParse({
      ...sports,
      sportTag: "BADMINTON",
    }).success,
    true,
  );
  // An already-shipped client does not know the additive field yet.
  assert.equal(weeklyIntentCreateSchema.safeParse(sports).success, true);

  const custom = weeklyIntentCreateSchema.safeParse({
    ...sports,
    sportTag: "OTHER",
    sportOtherNote: "  Padel  ",
  });
  assert.equal(custom.success, true);
  if (custom.success) assert.equal(custom.data.sportOtherNote, "Padel");

  assert.equal(
    weeklyIntentCreateSchema.safeParse({
      ...sports,
      sportTag: "OTHER",
      sportOtherNote: "   ",
    }).success,
    false,
  );
  assert.equal(
    weeklyIntentCreateSchema.safeParse({
      ...sports,
      sportTag: "BADMINTON",
      sportOtherNote: "Basketball",
    }).success,
    false,
  );
  assert.equal(
    weeklyIntentCreateSchema.safeParse({
      ...validCreate,
      sportTag: "BADMINTON",
    }).success,
    false,
  );
});

test("Weekly Intent validates study goals and study-only Together modes", () => {
  const study = { ...validCreate, topic: "STUDY" };
  const parsed = weeklyIntentCreateSchema.safeParse({
    ...study,
    togetherMode: "PARALLEL",
    studyGoal: "  Review linear algebra  ",
  });
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.studyGoal, "Review linear algebra");
    assert.equal(parsed.data.togetherMode, "PARALLEL");
  }

  // Older clients omit both additive fields and retain SAME_ACTIVITY in DB.
  assert.equal(weeklyIntentCreateSchema.safeParse(study).success, true);
  const blank = weeklyIntentCreateSchema.safeParse({
    ...study,
    studyGoal: "   ",
  });
  assert.equal(blank.success, true);
  if (blank.success) assert.equal(blank.data.studyGoal, null);

  assert.equal(
    weeklyIntentCreateSchema.safeParse({
      ...study,
      studyGoal: "x".repeat(81),
    }).success,
    false,
  );
  assert.equal(
    weeklyIntentCreateSchema.safeParse({
      ...validCreate,
      studyGoal: "Read together",
    }).success,
    false,
  );
  assert.equal(
    weeklyIntentCreateSchema.safeParse({
      ...validCreate,
      togetherMode: "PARALLEL",
    }).success,
    false,
  );
});

test("Weekly Intent rejects short, long, and overlapping time windows", () => {
  const shortWindow = [{
    startAt: "2026-09-01T10:00:00.000Z",
    endAt: "2026-09-01T10:20:00.000Z",
  }];
  const longWindow = [{
    startAt: "2026-09-01T00:00:00.000Z",
    endAt: "2026-09-01T13:00:00.000Z",
  }];
  const overlapping = [
    {
      startAt: "2026-09-01T10:00:00.000Z",
      endAt: "2026-09-01T11:00:00.000Z",
    },
    {
      startAt: "2026-09-01T10:30:00.000Z",
      endAt: "2026-09-01T12:00:00.000Z",
    },
  ];
  for (const timeWindows of [shortWindow, longWindow, overlapping]) {
    assert.equal(
      weeklyIntentCreateSchema.safeParse({ ...validCreate, timeWindows }).success,
      false,
    );
  }
});

test("Weekly Intent patch separates editing from pause and resume", () => {
  assert.equal(
    weeklyIntentPatchSchema.safeParse({
      action: "EDIT",
      expectedVersion: 2,
      topic: "STUDY",
    }).success,
    true,
  );
  assert.equal(
    weeklyIntentPatchSchema.safeParse({
      action: "EDIT",
      expectedVersion: 2,
    }).success,
    false,
  );
  assert.equal(
    weeklyIntentPatchSchema.safeParse({
      action: "PAUSE",
      expectedVersion: 2,
      topic: "STUDY",
    }).success,
    false,
  );
  assert.equal(
    weeklyIntentPatchSchema.safeParse({
      action: "EDIT",
      expectedVersion: 2,
      sportTag: "OTHER",
      sportOtherNote: "Padel",
    }).success,
    true,
  );
  assert.equal(
    weeklyIntentPatchSchema.safeParse({
      action: "EDIT",
      expectedVersion: 2,
      sportTag: "OTHER",
    }).success,
    false,
  );
  assert.equal(
    weeklyIntentPatchSchema.safeParse({
      action: "EDIT",
      expectedVersion: 2,
      topic: "FOOD",
      sportTag: "BADMINTON",
    }).success,
    false,
  );
  assert.equal(
    weeklyIntentPatchSchema.safeParse({
      action: "EDIT",
      expectedVersion: 2,
      togetherMode: "EITHER",
      studyGoal: "Prepare for calculus",
    }).success,
    true,
  );
  assert.equal(
    weeklyIntentPatchSchema.safeParse({
      action: "EDIT",
      expectedVersion: 2,
      topic: "SPORTS",
      togetherMode: "PARALLEL",
    }).success,
    false,
  );
});

test("Weekly Intent expiry is Sunday end-of-day across Berlin DST", () => {
  assert.equal(
    weeklyIntentExpiry(
      "Europe/Berlin",
      new Date("2026-08-26T10:00:00.000Z"),
    ).toISOString(),
    "2026-08-30T21:59:59.999Z",
  );
  assert.equal(
    weeklyIntentExpiry(
      "Europe/Berlin",
      new Date("2026-10-20T10:00:00.000Z"),
    ).toISOString(),
    "2026-10-25T22:59:59.999Z",
  );
});

test("Weekly Intent lifecycle accepts only future windows within its expiry", () => {
  const now = new Date("2026-08-31T08:00:00.000Z");
  const expiry = new Date("2026-09-06T21:59:59.999Z");
  assert.equal(
    weeklyIntentWindowsFitLifecycle(validCreate.timeWindows, now, expiry),
    true,
  );
  assert.equal(
    weeklyIntentWindowsFitLifecycle(
      [{ startAt: now.toISOString(), endAt: "2026-08-31T09:00:00.000Z" }],
      now,
      expiry,
    ),
    false,
  );
  assert.equal(
    weeklyIntentWindowsFitLifecycle(
      [{
        startAt: "2026-09-06T21:30:00.000Z",
        endAt: "2026-09-06T22:30:00.000Z",
      }],
      now,
      expiry,
    ),
    false,
  );
});

test("Weekly Intent normalization is chronological and UTC-stable", () => {
  assert.deepEqual(
    normalizeWeeklyIntentWindows([
      {
        startAt: "2026-09-02T10:00:00.000+02:00",
        endAt: "2026-09-02T11:00:00.000+02:00",
      },
      ...validCreate.timeWindows,
    ]),
    [
      {
        startAt: "2026-09-01T08:00:00.000Z",
        endAt: "2026-09-01T09:00:00.000Z",
      },
      {
        startAt: "2026-09-02T08:00:00.000Z",
        endAt: "2026-09-02T09:00:00.000Z",
      },
    ],
  );
});

test("Weekly Intent migration is additive and installs owner-safe lifecycle constraints", () => {
  const migration = readFileSync(
    new URL(
      "../../prisma/migrations/20260831120000_weekly_intent_foundation/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /CREATE TYPE "WeeklyIntentStatus"/);
  assert.match(migration, /CREATE TABLE "WeeklyIntent"/);
  assert.match(migration, /WeeklyIntent_terminal_check/);
  assert.match(migration, /REFERENCES "User"\("id"\)[\s\S]*ON DELETE CASCADE/);
  assert.doesNotMatch(migration, /ALTER TABLE "ClassmatePost"/);
  assert.doesNotMatch(migration, /ALTER TABLE "PlanRequest"/);
  assert.doesNotMatch(migration, /ALTER TABLE "CalendarEntry"/);
});

test("Concrete sport context uses one additive migration for intents and opportunities", () => {
  const migration = readFileSync(
    new URL(
      "../../prisma/migrations/20260901120000_weekly_intent_sport_context/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /ALTER TABLE "WeeklyIntent"[\s\S]*"sportTag" "SportTag"/);
  assert.match(migration, /ALTER TABLE "MutualOpportunity"[\s\S]*"sportTag" "SportTag"/);
  assert.match(migration, /"sportOtherNote" VARCHAR\(60\)/);
  assert.doesNotMatch(migration, /DROP|DELETE|UPDATE/i);
});

test("Together mode and study-goal migration preserves legacy exact semantics", () => {
  const migration = readFileSync(
    new URL(
      "../../prisma/migrations/20260901150000_together_mode_study_goal/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /CREATE TYPE "TogetherMode"[\s\S]*'SAME_ACTIVITY'[\s\S]*'PARALLEL'[\s\S]*'EITHER'/);
  assert.match(migration, /CREATE TYPE "MutualOpportunityMatchKind"[\s\S]*'EXACT_ACTIVITY'[\s\S]*'SHARED_CONTEXT'/);
  assert.match(migration, /CREATE TYPE "MutualOpportunitySharedContext"[\s\S]*'PARALLEL_STUDY'/);
  assert.match(migration, /"togetherMode" "TogetherMode" NOT NULL DEFAULT 'SAME_ACTIVITY'/);
  assert.match(migration, /"studyGoal" VARCHAR\(80\)/);
  assert.match(migration, /"matchKind" "MutualOpportunityMatchKind" NOT NULL DEFAULT 'EXACT_ACTIVITY'/);
  assert.match(migration, /"intentAStudyGoal" VARCHAR\(80\)/);
  assert.match(migration, /"intentBStudyGoal" VARCHAR\(80\)/);
  assert.doesNotMatch(migration, /DROP|DELETE|UPDATE/i);
});

test("general concrete activity uses one additive migration for intents and opportunities", () => {
  const migration = readFileSync(
    new URL(
      "../../prisma/migrations/20260902120000_weekly_intent_general_activity/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(migration, /ALTER TABLE "WeeklyIntent"[\s\S]*"activityText" VARCHAR\(80\)/);
  assert.match(migration, /ALTER TABLE "MutualOpportunity"[\s\S]*"activityText" VARCHAR\(80\)/);
  assert.doesNotMatch(migration, /DROP|DELETE|UPDATE/i);
});

test("OpenAPI exposes concrete sport context on intent and opportunity contracts", () => {
  const contract = JSON.parse(
    readFileSync(new URL("../../openapi/v1.json", import.meta.url), "utf8"),
  ) as {
    components: {
      schemas: Record<string, {
        properties?: Record<string, { enum?: unknown[] }>;
        required?: string[];
      }>;
    };
  };
  for (const schemaName of ["WeeklyIntent", "MutualOpportunity"]) {
    const schema = contract.components.schemas[schemaName];
    assert.ok(schema?.properties?.sportTag);
    assert.ok(schema?.properties?.sportOtherNote);
    assert.ok(schema.required?.includes("sportTag"));
    assert.ok(schema.required?.includes("sportOtherNote"));
  }
  assert.ok(
    contract.components.schemas.WeeklyIntentCreateRequest?.properties?.sportTag
      ?.enum?.includes("BADMINTON"),
  );
});

test("OpenAPI exposes viewer-safe shared-context matching fields", () => {
  const contract = JSON.parse(
    readFileSync(new URL("../../openapi/v1.json", import.meta.url), "utf8"),
  ) as {
    components: {
      schemas: Record<string, {
        properties?: Record<string, { enum?: unknown[] }>;
        required?: string[];
      }>;
    };
  };
  const intent = contract.components.schemas.WeeklyIntent;
  assert.ok(intent?.required?.includes("activityText"));
  assert.ok(intent?.required?.includes("togetherMode"));
  assert.ok(intent?.required?.includes("studyGoal"));
  assert.ok(intent?.properties?.togetherMode?.enum?.includes("PARALLEL"));

  const opportunity = contract.components.schemas.MutualOpportunity;
  assert.ok(opportunity?.required?.includes("activityText"));
  for (const field of [
    "matchKind",
    "sharedContext",
    "viewerTogetherMode",
    "peerTogetherMode",
    "viewerStudyGoal",
    "peerStudyGoal",
  ]) {
    assert.ok(opportunity?.properties?.[field]);
    assert.ok(opportunity?.required?.includes(field));
  }
});

test("Weekly Intent mutations refresh matching only through the active session gate", () => {
  const service = readFileSync(
    new URL("../../lib/v2/weekly-intents.ts", import.meta.url),
    "utf8",
  );
  const matcher = readFileSync(
    new URL("../../lib/v2/mutual-opportunities.ts", import.meta.url),
    "utf8",
  );
  assert.match(service, /matchAndNotifyForUser/);
  assert.match(service, /await autoMatchAfterMutation\(userId\)/);
  assert.match(service, /input\.action === "EDIT" \|\| input\.action === "RESUME"/);
  assert.doesNotMatch(
    service,
    /input\.action === "PAUSE"[\s\S]{0,100}autoMatchAfterMutation/,
  );
  assert.match(matcher, /TogetherMatchingSession/);
  assert.match(matcher, /matchingUntil:\s*\{ gt: now \}/);
  assert.match(matcher, /if \(!ownerSession\) return \[\]/);
});

test("Weekly Intent uses an independent feature gate and idempotent mutations", () => {
  const featureFlags = readFileSync(
    new URL("../../lib/v2/feature-flags.ts", import.meta.url),
    "utf8",
  );
  const collectionRoute = readFileSync(
    new URL("../../app/api/v1/me/weekly-intents/route.ts", import.meta.url),
    "utf8",
  );
  const itemRoute = readFileSync(
    new URL(
      "../../app/api/v1/me/weekly-intents/[intentId]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(featureFlags, /"v2WeeklyIntent"/);
  assert.match(featureFlags, /V2_WEEKLY_INTENT_ENABLED/);
  assert.match(collectionRoute, /runIdempotentV1Mutation/);
  assert.match(itemRoute, /runIdempotentV1Mutation/);
  assert.match(itemRoute, /parsed\.data\.action !== "PAUSE"/);
});

test("Familiar Campus cutover removes public-feed entry points from the V2 surface", () => {
  const together = readFileSync(
    new URL(
      "../../ios-native/SideSeat/Features/Together/TogetherRootView.swift",
      import.meta.url,
    ),
    "utf8",
  );
  const me = readFileSync(
    new URL(
      "../../ios-native/SideSeat/Features/Profile/MeRootView.swift",
      import.meta.url,
    ),
    "utf8",
  );
  const tutorial = readFileSync(
    new URL(
      "../../ios-native/SideSeat/Features/Onboarding/ProductTutorialController.swift",
      import.meta.url,
    ),
    "utf8",
  );
  const chats = readFileSync(
    new URL(
      "../../ios-native/SideSeat/Features/Chat/ChatsRootView.swift",
      import.meta.url,
    ),
    "utf8",
  );
  const contacts = readFileSync(
    new URL(
      "../../ios-native/SideSeat/Features/Chat/ContactsView.swift",
      import.meta.url,
    ),
    "utf8",
  );
  const publicProfile = readFileSync(
    new URL(
      "../../ios-native/SideSeat/Features/Profile/PublicProfileView.swift",
      import.meta.url,
    ),
    "utf8",
  );

  const togetherHome = together.split("private struct TogetherHomeView")[1];
  assert.ok(togetherHome);
  assert.doesNotMatch(togetherHome, /DiscoverRootView|together-open-explore/);
  assert.doesNotMatch(me, /"me-posts"|"me-saved-posts"/);
  assert.doesNotMatch(me, /My posts|Saved posts/);
  assert.doesNotMatch(tutorial, /Course actions, buddy posts, and activities/);
  assert.match(tutorial, /Your intention is not a public post or a people directory/);
  assert.doesNotMatch(chats, /inbox-toolbar-contacts|inbox-toolbar-new-group/);
  assert.doesNotMatch(contacts, /contacts-search-field|store\.add\(peerID:/);
  assert.match(publicProfile, /let connectionID = payload\.connectionId/);
  assert.doesNotMatch(publicProfile, /openConversation\.open/);
});
