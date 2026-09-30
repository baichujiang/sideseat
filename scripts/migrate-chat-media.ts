import { prisma } from "../lib/db/prisma";
import Module from "node:module";

// This is a server-side CLI, outside Next's server-only module alias.
const resolver = Module as typeof Module & { _resolveFilename: (request: string, ...args: unknown[]) => string };
const original = resolver._resolveFilename;
resolver._resolveFilename = function(request, ...args) {
  return original.call(this, request === "server-only" ? "next/dist/compiled/server-only/empty.js" : request, ...args);
};

async function main() {
const { migrateLegacyChatImages } = await import("../lib/media/migrate-chat-images");
const apply = process.argv.includes("--apply");
const host = new URL(process.env.DATABASE_URL ?? "http://invalid").hostname;
if (apply && !["localhost", "127.0.0.1", "::1"].includes(host) && !process.argv.includes("--allow-remote")) {
  throw new Error("Remote media migration requires --apply --allow-remote after release approval.");
}
try {
  let remaining = true;
  while (remaining) {
    const result = await migrateLegacyChatImages({ apply });
    console.log(JSON.stringify(result)); // Counts only: no user IDs, URLs, tokens or content.
    if (result.failed || ("deletion" in result && result.deletion?.failed)) { process.exitCode = 1; break; }
    remaining = apply && result.migrated > 0 && result.remainingAfter > 0;
  }
} finally { await prisma.$disconnect(); }
}
main().catch(cause => { console.error(cause instanceof Error ? cause.name : "MigrationError"); process.exitCode = 1; });
