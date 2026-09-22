import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../prisma/migrations/20260830234000_blight_experiment_eligibility_history/migration.sql",
  import.meta.url,
);
const schemaUrl = new URL("../../prisma/schema.prisma", import.meta.url);

test("eligibility history migration is additive, versioned, bounded, and cascading", async () => {
  const [migration, schema] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(schemaUrl, "utf8"),
  ]);

  assert.match(migration, /CREATE TYPE "ExperimentEligibilityReason" AS ENUM/);
  for (const reason of [
    "ASSIGNMENT_BASELINE",
    "ELIGIBLE",
    "CLIENT_UNSUPPORTED",
    "ENROLLMENT_DISABLED",
    "PILOT_NOT_ELIGIBLE",
  ]) {
    assert.match(migration, new RegExp(`'${reason}'`));
    assert.match(schema, new RegExp(`\\b${reason}\\b`));
  }
  assert.match(migration, /CREATE TABLE "ExperimentEligibilityState"/);
  assert.match(migration, /CREATE TABLE "ExperimentEligibilityTransition"/);
  assert.match(
    migration,
    /UNIQUE INDEX "ExperimentEligibilityTransition_assignmentId_version_key"/,
  );
  assert.match(
    migration,
    /ExperimentEligibilityState_assignmentId_fkey[\s\S]*ON DELETE CASCADE/,
  );
  assert.match(
    migration,
    /ExperimentEligibilityTransition_assignmentId_fkey[\s\S]*ON DELETE CASCADE/,
  );
  assert.match(
    migration,
    /WHERE assignment\."experimentKey" = 'action_to_plan_creator_gated_v2'/,
  );
  assert.match(
    migration,
    /INSERT INTO "ExperimentEligibilityTransition"[\s\S]*FROM "ExperimentEligibilityState" state[\s\S]*ON assignment\."id" = state\."assignmentId"/,
  );
  assert.match(
    schema,
    /model ExperimentEligibilityState \{[\s\S]*assignmentId String[\s\S]*@id/,
  );
  assert.match(
    schema,
    /model ExperimentEligibilityTransition \{[\s\S]*@@unique\(\[assignmentId, version\]\)/,
  );
});

test("migration never rewrites assignment eligibility or variant", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.doesNotMatch(migration, /UPDATE\s+"ExperimentAssignment"/i);
  assert.doesNotMatch(migration, /ALTER TABLE "ExperimentAssignment"/);
});
