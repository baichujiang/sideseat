import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  classifyActivityMatch,
  displayStudyGoal,
  generalActivityTextsAreCompatible,
  normalizeActivityText,
  normalizeSportOtherNote,
  normalizeStudyGoal,
  sportIntentsAreCompatible,
} from "../../lib/v2/mutual-opportunity-activity-compatibility";

const source = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("sports match on the concrete activity rather than the broad SPORTS topic", () => {
  assert.equal(
    sportIntentsAreCompatible(
      { sportTag: "BADMINTON", sportOtherNote: null },
      { sportTag: "BADMINTON", sportOtherNote: null },
    ),
    true,
  );
  assert.equal(
    sportIntentsAreCompatible(
      { sportTag: "BADMINTON", sportOtherNote: null },
      { sportTag: "BASKETBALL", sportOtherNote: null },
    ),
    false,
  );
});

test("legacy SPORTS intents only match other legacy intents", () => {
  assert.equal(
    sportIntentsAreCompatible(
      { sportTag: null, sportOtherNote: null },
      { sportTag: null, sportOtherNote: null },
    ),
    true,
  );
  assert.equal(
    sportIntentsAreCompatible(
      { sportTag: null, sportOtherNote: null },
      { sportTag: "BADMINTON", sportOtherNote: null },
    ),
    false,
  );
});

test("OTHER sports require the same non-empty normalized description", () => {
  assert.equal(normalizeSportOtherNote("  Ultimate   Frisbee  "), "ultimate frisbee");
  assert.equal(
    sportIntentsAreCompatible(
      { sportTag: "OTHER", sportOtherNote: " Ultimate   Frisbee " },
      { sportTag: "OTHER", sportOtherNote: "ultimate frisbee" },
    ),
    true,
  );
  assert.equal(
    sportIntentsAreCompatible(
      { sportTag: "OTHER", sportOtherNote: "Ultimate Frisbee" },
      { sportTag: "OTHER", sportOtherNote: "Squash" },
    ),
    false,
  );
  assert.equal(
    sportIntentsAreCompatible(
      { sportTag: "OTHER", sportOtherNote: " " },
      { sportTag: "OTHER", sportOtherNote: " " },
    ),
    false,
  );
});

test("general categories match the same normalized concrete action", () => {
  assert.equal(normalizeActivityText("  Eat   Hotpot  "), "eat hotpot");
  assert.equal(
    generalActivityTextsAreCompatible(" Eat   Hotpot ", "eat hotpot"),
    true,
  );
  assert.equal(
    generalActivityTextsAreCompatible("Eat hotpot", "Eat pizza"),
    false,
  );
  assert.equal(generalActivityTextsAreCompatible(null, null), true);
  assert.equal(generalActivityTextsAreCompatible(null, "Eat hotpot"), false);

  const base = {
    topic: "FOOD" as const,
    activityText: "Eat hotpot",
    sportTag: null,
    sportOtherNote: null,
    togetherMode: "SAME_ACTIVITY" as const,
    studyGoal: null,
  };
  assert.ok(classifyActivityMatch(base, { ...base, activityText: "eat hotpot" }));
  assert.equal(
    classifyActivityMatch(base, { ...base, activityText: "Eat pizza" }),
    null,
  );
});

test("same normalized study goal is an exact activity match", () => {
  assert.equal(displayStudyGoal("  Linear   Algebra  "), "Linear Algebra");
  assert.equal(normalizeStudyGoal("  LINEAR   Algebra  "), "linear algebra");
  assert.deepEqual(
    classifyActivityMatch(
      {
        topic: "STUDY",
        activityText: null,
        sportTag: null,
        sportOtherNote: null,
        togetherMode: "SAME_ACTIVITY",
        studyGoal: " Linear   Algebra ",
      },
      {
        topic: "STUDY",
        activityText: null,
        sportTag: null,
        sportOtherNote: null,
        togetherMode: "PARALLEL",
        studyGoal: "linear algebra",
      },
    ),
    {
      matchKind: "EXACT_ACTIVITY",
      sharedContext: null,
      first: {
        togetherMode: "SAME_ACTIVITY",
        displayStudyGoal: "Linear Algebra",
      },
      second: {
        togetherMode: "PARALLEL",
        displayStudyGoal: "linear algebra",
      },
    },
  );
});

test("different study goals match only when both users allow parallel study", () => {
  const first = {
    topic: "STUDY" as const,
    activityText: null,
    sportTag: null,
    sportOtherNote: null,
    togetherMode: "PARALLEL" as const,
    studyGoal: "Algorithms exam",
  };
  assert.deepEqual(
    classifyActivityMatch(first, {
      ...first,
      togetherMode: "EITHER",
      studyGoal: "German homework",
    }),
    {
      matchKind: "SHARED_CONTEXT",
      sharedContext: "PARALLEL_STUDY",
      first: {
        togetherMode: "PARALLEL",
        displayStudyGoal: "Algorithms exam",
      },
      second: {
        togetherMode: "EITHER",
        displayStudyGoal: "German homework",
      },
    },
  );
  assert.equal(
    classifyActivityMatch(
      { ...first, togetherMode: "SAME_ACTIVITY" },
      { ...first, togetherMode: "EITHER", studyGoal: "German homework" },
    ),
    null,
  );
});

test("legacy study goals only match legacy goals and default to same activity", () => {
  const legacy = {
    topic: "STUDY" as const,
    activityText: null,
    sportTag: null,
    sportOtherNote: null,
    togetherMode: null,
    studyGoal: null,
  };
  assert.deepEqual(classifyActivityMatch(legacy, legacy), {
    matchKind: "EXACT_ACTIVITY",
    sharedContext: null,
    first: { togetherMode: "SAME_ACTIVITY", displayStudyGoal: null },
    second: { togetherMode: "SAME_ACTIVITY", displayStudyGoal: null },
  });
  assert.equal(
    classifyActivityMatch(legacy, {
      ...legacy,
      togetherMode: "EITHER",
      studyGoal: "Calculus",
    }),
    null,
  );
});

test("SPORTS never broadens across concrete activities through parallel mode", () => {
  assert.equal(
    classifyActivityMatch(
      {
        topic: "SPORTS",
        activityText: null,
        sportTag: "BADMINTON",
        sportOtherNote: null,
        togetherMode: "PARALLEL",
        studyGoal: null,
      },
      {
        topic: "SPORTS",
        activityText: null,
        sportTag: "BASKETBALL",
        sportOtherNote: null,
        togetherMode: "EITHER",
        studyGoal: null,
      },
    ),
    null,
  );
});

test("explicit session start is the matching trigger and both participants are gated", () => {
  const matcher = source("lib/v2/mutual-opportunities.ts");
  const orchestrator = source("lib/v2/mutual-opportunity-auto-match.ts");
  const sessionRoute = source(
    "app/api/v1/me/together-matching-session/route.ts",
  );
  assert.match(matcher, /Promise<CreatedMutualOpportunityMatch\[\]>/);
  assert.match(matcher, /opportunityId: created\.id/);
  assert.match(
    matcher,
    /const ownerSession = await prisma\.togetherMatchingSession\.findFirst/,
  );
  assert.match(
    matcher,
    /togetherMatchingSession:[\s\S]*stoppedAt: null[\s\S]*matchingUntil: \{ gt: now \}/,
  );
  assert.match(matcher, /lockActiveMatchingSessions/);
  assert.match(matcher, /FROM "TogetherMatchingSession"[\s\S]*FOR UPDATE/);
  assert.match(orchestrator, /export async function matchAndNotifyForUser/);
  assert.match(orchestrator, /url: "\/discover"/);
  assert.match(orchestrator, /kind: "mutual_opportunity"/);
  assert.match(orchestrator, /opportunityId: match\.opportunityId/);
  assert.match(
    sessionRoute,
    /startTogetherMatchingSession\(auth\.user\.id\)[\s\S]*matchAndNotifyForUser\(auth\.user\.id\)/,
  );
});

test("matcher persists an explainable shared-context snapshot and viewer-relative goals", () => {
  const matcher = source("lib/v2/mutual-opportunities.ts");
  assert.match(
    matcher,
    /for \(const preferredMatchKind of \["EXACT_ACTIVITY", "SHARED_CONTEXT"\]/,
  );
  assert.match(matcher, /const activityMatch = classifyActivityMatch\(ownerIntent, candidateIntent\)/);
  assert.match(matcher, /matchKind: activityMatch\.matchKind/);
  assert.match(matcher, /sharedContext: activityMatch\.sharedContext/);
  assert.match(matcher, /intentAStudyGoal: intentAActivity\.displayStudyGoal/);
  assert.match(matcher, /intentBStudyGoal: intentBActivity\.displayStudyGoal/);
  assert.match(matcher, /intentATogetherMode: intentAActivity\.togetherMode/);
  assert.match(matcher, /intentBTogetherMode: intentBActivity\.togetherMode/);
  assert.match(matcher, /viewerStudyGoal: viewerIsA \? row\.intentAStudyGoal : row\.intentBStudyGoal/);
  assert.match(matcher, /peerStudyGoal: viewerIsA \? row\.intentBStudyGoal : row\.intentAStudyGoal/);
  assert.match(matcher, /return "Study side by side"/);
});

test("NO releases the opportunity and rematches both active intent owners after commit", () => {
  const matcher = source("lib/v2/mutual-opportunities.ts");
  const route = source(
    "app/api/v1/me/mutual-opportunities/[opportunityId]/decision/route.ts",
  );
  assert.match(
    matcher,
    /options\.decision === "NO"[\s\S]*status: "UNAVAILABLE"[\s\S]*rematchUserIds: \[row\.userAId, row\.userBId\]/,
  );
  assert.match(route, /await decideMutualOpportunity/);
  assert.match(route, /result\.rematchUserIds\.map/);
  assert.match(route, /matchAndNotifyForUser\(userId\)/);
});

test("a single YES remains visible only as the viewer's private saved choice", () => {
  const matcher = source("lib/v2/mutual-opportunities.ts");
  assert.match(matcher, /ownDecision === MutualOpportunityDecisionValue\.YES[\s\S]*\? "DECIDED"/);
  assert.match(matcher, /row\.state === "DECIDED"/);
});

test("withdrawing a private YES closes the opportunity and rematches both owners", () => {
  const matcher = source("lib/v2/mutual-opportunities.ts");
  const route = source(
    "app/api/v1/me/mutual-opportunities/[opportunityId]/decision/route.ts",
  );
  const withdraw = matcher.slice(
    matcher.indexOf("export async function withdrawMutualOpportunityDecision"),
  );
  assert.match(withdraw, /value:\s*"WITHDRAWN"/);
  assert.match(withdraw, /status:\s*"UNAVAILABLE"/);
  assert.match(withdraw, /rematchUserIds:\s*\[row\.userAId, row\.userBId\]/);
  assert.match(route, /result\.rematchUserIds\.map/);
});
