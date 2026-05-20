import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
const { Client } = pg;
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const databaseDir = join(root, ".local-postgres");
const port = Number(process.env.LOCAL_PG_PORT ?? 5433);
const user = "postgres";
const password = "password";
const database = "sideseat";

const embeddedPg = new EmbeddedPostgres({
  databaseDir,
  user,
  password,
  port,
  persistent: true,
});

if (!existsSync(join(databaseDir, "PG_VERSION"))) {
  console.log("Initializing local PostgreSQL…");
  await embeddedPg.initialise();
}

console.log(`Starting local PostgreSQL on port ${port}…`);
await embeddedPg.start();

const client = new Client({
  host: "127.0.0.1",
  port,
  user,
  password,
  database: "postgres",
});
await client.connect();

const exists = await client.query(
  "SELECT 1 FROM pg_database WHERE datname = $1",
  [database],
);
if (exists.rowCount === 0) {
  await client.query(`CREATE DATABASE ${database}`);
  console.log(`Created database "${database}".`);
}

await client.end();

const url = `postgresql://${user}:${password}@127.0.0.1:${port}/${database}?schema=public`;
console.log("\nLocal database is ready.");
console.log(`DATABASE_URL=${url}`);
console.log("\nKeep this process running while you develop.");
console.log("Press Ctrl+C to stop the database.\n");

process.on("SIGINT", async () => {
  await embeddedPg.stop();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await embeddedPg.stop();
  process.exit(0);
});
