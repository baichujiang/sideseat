import { Prisma, PrismaClient } from "@prisma/client";

import { backfillDirectV1CoordinationBatch } from "../lib/v2/direct-v1-coordination-backfill";
import {
  parseDirectV1BackfillArgs,
  redactDirectV1CliError,
  requireDatabaseUrlFromEnvironment,
} from "./lib/direct-v1-backfill-cli";
import {
  formatDirectV1RunReport,
  runDirectV1Backfill,
} from "./lib/direct-v1-backfill-runner";

const HELP = `Usage: npm run backfill:b-light:direct-v1 -- [options]

Safe defaults:
  Runs in dry-run mode and reads the database URL only from a named environment variable.
  Apply requires --apply plus the exact --through cutoff reviewed in a dry run.

Options:
  --dry-run                  Inspect without persistent writes (default).
  --apply                    Apply safe rows; requires explicit --through.
  --phase actions|interests|all
                             Scan both phases in order by default.
  --batch-size N             Rows per keyset page (1-500, default 100).
  --max-findings N           Maximum findings retained (1-500, default 100).
  --through ISO_TIMESTAMP    Fixed inclusive cutoff.
  --cursor TOKEN             Resume token emitted to stderr by an apply run.
  --database-url-env NAME    Environment variable containing the DB URL.
  --json                     Print the final report as JSON.
  --help                     Show this help.
`;

async function main(): Promise<void> {
  const options = parseDirectV1BackfillArgs(process.argv.slice(2), process.env);
  if (options.help) {
    process.stdout.write(HELP);
    return;
  }

  const databaseUrl = requireDatabaseUrlFromEnvironment(
    options.databaseUrlEnv,
    process.env,
  );
  const database = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const report = await runDirectV1Backfill(options, {
      readDatabaseClock: async () => {
        const rows = await database.$queryRaw<Array<{ now: Date }>>(
          Prisma.sql`SELECT CURRENT_TIMESTAMP AS "now"`,
        );
        const now = rows[0]?.now;
        if (!(now instanceof Date)) throw new Error("Database clock query failed.");
        return now;
      },
      backfillBatch: (request) =>
        backfillDirectV1CoordinationBatch({ ...request, db: database }),
      verifyBatch: () => {
        throw new Error("Verification is unavailable from the backfill command.");
      },
      writeCheckpoint: (checkpoint) => {
        process.stderr.write(`BL_DB03_CHECKPOINT=${checkpoint}\n`);
      },
    });
    process.stdout.write(`${formatDirectV1RunReport(report, options.format)}\n`);
    process.exitCode = report.exitCode;
  } finally {
    await database.$disconnect();
  }
}

void main().catch((error: unknown) => {
  let secret: string | undefined;
  try {
    const options = parseDirectV1BackfillArgs(process.argv.slice(2), process.env);
    secret = process.env[options.databaseUrlEnv];
  } catch {
    // Argument errors are already safe to render without inspecting an env value.
  }
  process.stderr.write(`BL-DB-03 backfill failed: ${redactDirectV1CliError(error, secret ? [secret] : [])}\n`);
  process.exitCode = 2;
});
