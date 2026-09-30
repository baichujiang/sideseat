import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { generateMembershipCode, hashMembershipCode } from "../lib/membership/invite-code";

async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    label: { type: "string" }, days: { type: "string" }, "max-uses": { type: "string" },
    expires: { type: "string" }, id: { type: "string" }, help: { type: "boolean" },
  } });
  if (values.help || !positionals.length) {
    console.log("Set DATABASE_URL explicitly, then run:\n  npx tsx scripts/membership-invites.ts create --label beta --days 30 --max-uses 100 --expires 2026-12-31T23:59:59Z\n  npx tsx scripts/membership-invites.ts list\n  npx tsx scripts/membership-invites.ts disable --id <id>\nThe raw code is displayed only on creation. Existing membership is not revoked by disabling a code.");
    return;
  }
  if (positionals.length !== 1 || !["create", "list", "disable"].includes(positionals[0]!)) throw new Error("Use create, list, or disable.");
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL for the intended database explicitly.");
  const db = new PrismaClient();
  try {
    if (positionals[0] === "create") {
      const data = z.object({
        label: z.string().trim().min(1).max(80),
        durationDays: z.coerce.number().int().min(1).max(3650),
        maxRedemptions: z.coerce.number().int().min(1).max(1_000_000),
        expiresAt: z.string().datetime({ offset: true }).transform(value => new Date(value))
          .refine(value => value > new Date(), "The redemption deadline must be in the future."),
      }).parse({ label: values.label, durationDays: values.days, maxRedemptions: values["max-uses"], expiresAt: values.expires });
      const code = generateMembershipCode();
      const row = await db.membershipInviteCode.create({ data: { ...data, codeHash: hashMembershipCode(code) } });
      console.log(JSON.stringify({ id: row.id, label: row.label, code, durationDays: row.durationDays, maxRedemptions: row.maxRedemptions, expiresAt: row.expiresAt }, null, 2));
    } else if (positionals[0] === "list") {
      const rows = await db.membershipInviteCode.findMany({ orderBy: { createdAt: "desc" }, select: {
        id: true, label: true, durationDays: true, maxRedemptions: true, redeemedCount: true, expiresAt: true, disabledAt: true,
      } });
      console.log(JSON.stringify(rows.map(row => ({ ...row, remaining: row.maxRedemptions - row.redeemedCount })), null, 2));
    } else {
      if (!values.id) throw new Error("disable requires --id.");
      await db.membershipInviteCode.update({ where: { id: values.id }, data: { disabledAt: new Date() } });
      console.log(`Disabled invitation ${values.id}.`);
    }
  } finally { await db.$disconnect(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Invitation management failed."); process.exitCode = 1; });
