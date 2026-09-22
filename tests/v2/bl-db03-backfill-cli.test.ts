import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeDirectV1BackfillCheckpoint,
  encodeDirectV1BackfillCheckpoint,
  parseDirectV1BackfillArgs,
  parseDirectV1VerifyArgs,
  redactDirectV1CliError,
  requireDatabaseUrlFromEnvironment,
} from "../../scripts/lib/direct-v1-backfill-cli";

const checkpoint = {
  version: 1 as const,
  phase: "interests" as const,
  through: "2026-08-30T18:00:00.000Z",
  createdAt: "2026-08-29T12:00:00.000Z",
  id: "interest-42",
};

test("backfill CLI is dry-run by default and never accepts a database URL argument", () => {
  const parsed = parseDirectV1BackfillArgs([], {
    DATABASE_URL: "postgresql://user:secret@localhost/db",
  });
  assert.equal(parsed.mode, "dry-run");
  assert.equal(parsed.phase, "all");
  assert.equal(parsed.batchSize, 100);
  assert.equal(parsed.databaseUrlEnv, "DATABASE_URL");
  assert.throws(
    () => parseDirectV1BackfillArgs(["postgresql://user:secret@localhost/db"], {}),
    /Unknown option/,
  );
});

test("apply requires the fixed cutoff produced by a reviewed dry run", () => {
  assert.throws(() => parseDirectV1BackfillArgs(["--apply"], {}), /requires.*--through/);
  const parsed = parseDirectV1BackfillArgs(
    [
      "--apply",
      "--phase=actions",
      "--batch-size",
      "250",
      "--through",
      "2026-08-30T18:00:00.000Z",
      "--database-url-env=LOCAL_BACKFILL_DATABASE_URL",
    ],
    {},
  );
  assert.equal(parsed.mode, "apply");
  assert.equal(parsed.phase, "actions");
  assert.equal(parsed.batchSize, 250);
  assert.equal(parsed.through?.toISOString(), "2026-08-30T18:00:00.000Z");
  assert.equal(parsed.databaseUrlEnv, "LOCAL_BACKFILL_DATABASE_URL");
});

test("checkpoint round-trips the phase, cutoff, and compound keyset cursor", () => {
  const encoded = encodeDirectV1BackfillCheckpoint(checkpoint);
  assert.deepEqual(decodeDirectV1BackfillCheckpoint(encoded), checkpoint);
  const parsed = parseDirectV1BackfillArgs(["--apply", `--cursor=${encoded}`], {});
  assert.equal(parsed.phase, "all");
  assert.equal(parsed.checkpoint?.phase, "interests");
  assert.equal(parsed.through?.toISOString(), checkpoint.through);

  assert.throws(
    () =>
      parseDirectV1BackfillArgs(
        ["--cursor", encoded, "--phase", "actions"],
        {},
      ),
    /phase embedded/,
  );
  assert.throws(
    () =>
      parseDirectV1BackfillArgs(
        ["--cursor", encoded, "--through", "2026-08-30T17:00:00.000Z"],
        {},
      ),
    /through value embedded/,
  );
});

test("CLI bounds batches, findings, environment names, and checkpoint timestamps", () => {
  for (const args of [
    ["--batch-size", "0"],
    ["--batch-size", "501"],
    ["--max-findings", "501"],
    ["--database-url-env", "not-an-env"],
    ["--phase", "plans"],
    ["--wat"],
  ]) {
    assert.throws(() => parseDirectV1BackfillArgs(args, {}));
  }

  const invalid = Buffer.from(
    JSON.stringify({ ...checkpoint, createdAt: "2026-08-31T00:00:00.000Z" }),
  ).toString("base64url");
  assert.throws(() => decodeDirectV1BackfillCheckpoint(invalid), /beyond/);
  assert.throws(() => decodeDirectV1BackfillCheckpoint("not-json!"), /valid checkpoint/);
});

test("verifier is read-only and database URLs can only be read from a named env", () => {
  assert.throws(
    () => parseDirectV1VerifyArgs(["--apply", "--through", checkpoint.through], {}),
    /read-only/,
  );
  const encoded = encodeDirectV1BackfillCheckpoint(checkpoint);
  assert.throws(
    () => parseDirectV1VerifyArgs(["--cursor", encoded], {}),
    /does not accept --cursor.*full dataset/i,
  );
  assert.throws(
    () => parseDirectV1VerifyArgs(["--phase", "interests"], {}),
    /requires --phase all.*actions then interests/i,
  );
  assert.throws(
    () => parseDirectV1VerifyArgs(["--phase=actions"], {}),
    /requires --phase all.*actions then interests/i,
  );
  const fullScan = parseDirectV1VerifyArgs(["--phase", "all"], {});
  assert.equal(fullScan.phase, "all");
  assert.equal(fullScan.checkpoint, null);
  assert.equal(
    requireDatabaseUrlFromEnvironment("MIGRATION_DATABASE_URL", {
      MIGRATION_DATABASE_URL: "postgresql://operator:secret@db.example.test/app",
    }),
    "postgresql://operator:secret@db.example.test/app",
  );
  assert.throws(
    () => requireDatabaseUrlFromEnvironment("MIGRATION_DATABASE_URL", {}),
    /is not set/,
  );
  const secret = "postgresql://operator:secret@db.example.test/app";
  assert.equal(
    redactDirectV1CliError(new Error(`Could not connect to ${secret}`), [secret]),
    "Could not connect to [REDACTED]",
  );
});
