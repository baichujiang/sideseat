import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

const migrationPath = join(
  process.cwd(),
  "prisma",
  "migrations",
  "20260830233000_blight_direct_context_compatibility",
  "migration.sql",
);
const schemaPath = join(process.cwd(), "prisma", "schema.prisma");
const contractPath = join(
  process.cwd(),
  "docs",
  "LEGACY_ACTION_COMPATIBILITY.md",
);

test("BL-DB-03 compatibility migration relaxes only the legacy DIRECT activation link", async () => {
  const [migration, schema, contract] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(schemaPath, "utf8"),
    readFile(contractPath, "utf8"),
  ]);
  const executable = migration.replace(/^\s*--.*$/gm, "");

  assert.equal(executable.match(/^\s*BEGIN\s*;/gim)?.length, 1);
  assert.equal(executable.match(/^\s*COMMIT\s*;/gim)?.length, 1);
  assert.match(
    executable,
    /ALTER TABLE "ActionCoordinationContext"\s+ALTER COLUMN "currentActivationId" DROP NOT NULL;/,
  );
  assert.doesNotMatch(executable, /\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\b/i);
  assert.doesNotMatch(executable, /\b(?:CREATE|DROP)\s+(?:TABLE|TYPE|INDEX)\b/i);

  const context = extractPrismaModel(schema, "ActionCoordinationContext");
  assert.match(context, /^\s*currentActivationId\s+String\?/m);
  assert.match(context, /^\s*currentActivation\s+ActionInterestActivation\?/m);
  assert.match(
    contract,
    /`DIRECT_CONVERSATION_V1` compatibility Context has no activation attempt/,
  );
  assert.match(contract, /do not fabricate MESSAGE/);
});

function extractPrismaModel(source: string, name: string): string {
  const match = source.match(new RegExp(`^model ${name}\\s*\\{[\\s\\S]*?^\\}`, "m"));
  assert.ok(match, `model ${name} must exist`);
  return match[0];
}
