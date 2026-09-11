import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { weeklyIntentCreateSchema, weeklyIntentPatchSchema } from "../../lib/validators/weekly-intent";

test("Explore visibility is explicit in Weekly Intent writes", () => {
  const base = {
    topic: "COFFEE" as const,
    activityText: "Coffee after class",
    timeWindows: [],
    timePreference: { kind: "UNDECIDED" as const },
    timeZone: "Europe/Berlin",
    exploreVisible: true,
  };
  assert.equal(weeklyIntentCreateSchema.parse(base).exploreVisible, true);
  const edit = weeklyIntentPatchSchema.parse({
    action: "EDIT", expectedVersion: 1, exploreVisible: false,
  });
  assert.equal(edit.action, "EDIT");
  if (edit.action === "EDIT") assert.equal(edit.exploreVisible, false);
});

test("Existing intentions stay private and Explore projection omits identity fields", () => {
  const schema = fs.readFileSync("prisma/schema.prisma", "utf8");
  const migration = fs.readFileSync(
    "prisma/migrations/20260911001000_explore_intent_visibility/migration.sql", "utf8",
  );
  const service = fs.readFileSync("lib/v2/explore-intents.ts", "utf8");
  assert.match(schema, /exploreVisible\s+Boolean\s+@default\(false\)/);
  assert.match(migration, /DEFAULT false/);
  for (const forbidden of ["username: true", "nickname: true", "avatarUrl: true", "major: true", "semester: true", "email: true", "phone: true"]) {
    assert.equal(service.includes(forbidden), false, `Explore must not select ${forbidden}`);
  }
  assert.match(service, /descriptionPreview: row\.note\?\.trim\(\)\.slice\(0, 96\)/);
  assert.match(service, /languages: row\.user\.userLanguages\.slice\(0, 1\)/);
  assert.match(service, /time: safeTimeContext\(row\)/);
  assert.match(service, /prisma\.block\.findMany/);
});

test("Explore endpoint is separately feature gated and free results are capped", () => {
  const route = fs.readFileSync("app/api/v1/explore/intents/route.ts", "utf8");
  const service = fs.readFileSync("lib/v2/explore-intents.ts", "utf8");
  assert.match(route, /v2ExploreIntents/);
  assert.match(service, /MAX_FREE_EXPLORE_RESULTS = 5/);
});
