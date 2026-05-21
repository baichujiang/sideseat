/**
 * One-time maintenance: normalize User.email to lowercase and resolve duplicates.
 *
 * Usage:
 *   npx tsx scripts/dedupe-user-emails.ts           # dry-run (default)
 *   npx tsx scripts/dedupe-user-emails.ts --apply   # write changes
 *
 * Policy when multiple accounts share the same normalized email:
 *   - Keep the oldest account (earliest createdAt) with that email (normalized).
 *   - Clear email on newer duplicates (they can still log in via username or phone).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

function normalizeEmail(raw: string | null): string | null {
  if (!raw) return null;
  const email = raw.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { not: null } },
    select: {
      id: true,
      email: true,
      username: true,
      phone: true,
      createdAt: true,
      lastActiveAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const byNorm = new Map<string, typeof users>();
  for (const u of users) {
    const key = normalizeEmail(u.email);
    if (!key) continue;
    const arr = byNorm.get(key) ?? [];
    arr.push(u);
    byNorm.set(key, arr);
  }

  const duplicateGroups = [...byNorm.entries()].filter(([, arr]) => arr.length > 1);
  const lowercaseFixes = users.filter((u) => u.email && u.email !== normalizeEmail(u.email));

  console.log(`Users with email: ${users.length}`);
  console.log(`Need lowercase normalize: ${lowercaseFixes.length}`);
  console.log(`Duplicate normalized email groups: ${duplicateGroups.length}`);

  for (const [norm, arr] of duplicateGroups) {
    const keeper = arr[0];
    const drop = arr.slice(1);
    console.log(`\n[duplicate] ${norm}`);
    console.log(`  keep: ${keeper.id} (${keeper.username}) created ${keeper.createdAt.toISOString()}`);
    for (const u of drop) {
      console.log(
        `  clear email: ${u.id} (${u.username}) created ${u.createdAt.toISOString()} phone=${u.phone ?? "—"}`,
      );
    }
  }

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to update the database.");
    return;
  }

  let normalized = 0;
  for (const u of users) {
    const norm = normalizeEmail(u.email);
    if (!norm || norm === u.email) continue;
    const conflict = await prisma.user.findUnique({ where: { email: norm }, select: { id: true } });
    if (conflict && conflict.id !== u.id) {
      console.warn(`Skip normalize ${u.id}: ${norm} already taken by ${conflict.id}`);
      continue;
    }
    await prisma.user.update({ where: { id: u.id }, data: { email: norm } });
    normalized += 1;
  }

  let cleared = 0;
  for (const [, arr] of duplicateGroups) {
    const keeper = arr[0];
    const norm = normalizeEmail(keeper.email)!;
    await prisma.user.update({ where: { id: keeper.id }, data: { email: norm } });
    for (const u of arr.slice(1)) {
      await prisma.user.update({ where: { id: u.id }, data: { email: null } });
      cleared += 1;
    }
  }

  console.log(`\nApplied: ${normalized} emails lowercased, ${cleared} duplicate emails cleared.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
