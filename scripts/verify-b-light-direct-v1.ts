import { Prisma, PrismaClient } from "@prisma/client";

import { verifyDirectV1CoordinationBackfill } from "../lib/v2/direct-v1-coordination-backfill";
import {
  parseDirectV1VerifyArgs,
  redactDirectV1CliError,
  requireDatabaseUrlFromEnvironment,
} from "./lib/direct-v1-backfill-cli";
import {
  formatDirectV1RunReport,
  runDirectV1Verification,
} from "./lib/direct-v1-backfill-runner";

const HELP = `Usage: npm run verify:b-light:direct-v1 -- [options]

This command is always read-only and always performs a full release-gate scan
from the beginning: actions first, then interests, at one fixed database-clock
cutoff. It exits nonzero when it finds quarantine cases or violations.

Options:
  --batch-size N             Rows per keyset page (1-500, default 100).
  --max-findings N           Maximum findings retained (1-500, default 100).
  --through ISO_TIMESTAMP    Fixed inclusive cutoff (DB clock by default).
  --database-url-env NAME    Environment variable containing the DB URL.
  --json                     Print the final report as JSON.
  --help                     Show this help.
`;

async function main(): Promise<void> {
  const options = parseDirectV1VerifyArgs(process.argv.slice(2), process.env);
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
    const report = await runDirectV1Verification(options, {
      readDatabaseClock: async () => {
        const rows = await database.$queryRaw<Array<{ now: Date }>>(
          Prisma.sql`SELECT CURRENT_TIMESTAMP AS "now"`,
        );
        const now = rows[0]?.now;
        if (!(now instanceof Date)) throw new Error("Database clock query failed.");
        return now;
      },
      backfillBatch: () => {
        throw new Error("Mutation is unavailable from the verifier command.");
      },
      verifyBatch: (request) =>
        verifyDirectV1CoordinationBackfill({ ...request, db: database }),
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
    const options = parseDirectV1VerifyArgs(process.argv.slice(2), process.env);
    secret = process.env[options.databaseUrlEnv];
  } catch {
    // Argument errors are already safe to render without inspecting an env value.
  }
  process.stderr.write(`BL-DB-03 verifier failed: ${redactDirectV1CliError(error, secret ? [secret] : [])}\n`);
  process.exitCode = 2;
});
