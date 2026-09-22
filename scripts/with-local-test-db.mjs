import { spawnSync } from "node:child_process";

import pg from "pg";

const { Client } = pg;
const [, , command, ...args] = process.argv;

if (!command) {
  console.error("Usage: node scripts/with-local-test-db.mjs <command> [...args]");
  process.exit(2);
}

const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
const database = process.env.LOCAL_TEST_DB_NAME ?? "sideseat_ios_test";
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  console.error("LOCAL_PG_PORT must be a valid TCP port.");
  process.exit(2);
}
if (!/^[a-z][a-z0-9_]{0,62}$/.test(database)) {
  console.error("LOCAL_TEST_DB_NAME must be a lowercase PostgreSQL identifier.");
  process.exit(2);
}

const connection = {
  host: "127.0.0.1",
  port,
  user: "postgres",
  password: "password",
};

try {
  const admin = new Client({ ...connection, database: "postgres" });
  await admin.connect();
  const existing = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  if (existing.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${database}"`);
    console.log(`[local-test-db] Created ${database} on 127.0.0.1:${port}.`);
  }
  await admin.end();
} catch (cause) {
  console.error(
    `[local-test-db] Unable to reach PostgreSQL on 127.0.0.1:${port}. Run npm run db:start first.`,
  );
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
}

const url = `postgresql://${connection.user}:${connection.password}@${connection.host}:${port}/${database}?schema=public`;
console.log(`[local-test-db] Running against ${database} on 127.0.0.1:${port}.`);
const result = spawnSync(command, args, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    DATABASE_URL: url,
    DATABASE_URL_UNPOOLED: url,
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
