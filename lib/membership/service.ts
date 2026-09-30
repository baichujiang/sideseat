import "server-only";
import { isPlusMember } from "./status";
import { prisma } from "@/lib/db/prisma";
import { hashMembershipCode, redeemMembershipSchema } from "./invite-code";

export function membershipStatus(expiresAt: Date | null, now = new Date()) {
  return {
    tier: isPlusMember(expiresAt, now) ? "PLUS" as const : "FREE" as const,
    plusExpiresAt: expiresAt?.toISOString() ?? null,
  };
}

export async function getMembership(userId: string) {
  const row = await prisma.userMembership.findUnique({ where: { userId } });
  return membershipStatus(row?.plusExpiresAt ?? null);
}

export class MembershipCodeError extends Error {
  constructor() { super("This invitation code is invalid, expired, or fully redeemed."); }
}

export async function redeemMembershipCode(userId: string, rawCode: string) {
  const parsed = redeemMembershipSchema.safeParse({ code: rawCode });
  if (!parsed.success) throw new MembershipCodeError();
  const codeHash = hashMembershipCode(parsed.data.code);
  return prisma.$transaction(async tx => {
    // Serialize redemptions for the same account, including different codes.
    const users = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    if (!users.length) throw new MembershipCodeError();
    const now = new Date();
    const code = await tx.membershipInviteCode.findUnique({ where: { codeHash } });
    if (!code) throw new MembershipCodeError();
    const membership = await tx.userMembership.findUnique({ where: { userId } });
    const previous = await tx.membershipRedemption.findUnique({ where: { codeId_userId: { codeId: code.id, userId } } });
    // Lost-response retries remain successful even after the code expires or fills.
    if (previous) return { ...membershipStatus(membership?.plusExpiresAt ?? null, now), alreadyRedeemed: true };

    const claimed = await tx.membershipInviteCode.updateMany({
      where: { id: code.id, disabledAt: null, expiresAt: { gt: now }, redeemedCount: { lt: code.maxRedemptions } },
      data: { redeemedCount: { increment: 1 } },
    });
    if (claimed.count !== 1) throw new MembershipCodeError();
    const base = Math.max(now.getTime(), membership?.plusExpiresAt.getTime() ?? 0);
    const plusExpiresAt = new Date(base + code.durationDays * 86_400_000);
    await tx.userMembership.upsert({ where: { userId }, create: { userId, plusExpiresAt }, update: { plusExpiresAt } });
    await tx.membershipRedemption.create({ data: { codeId: code.id, userId, plusExpiresAt } });
    return { ...membershipStatus(plusExpiresAt, now), alreadyRedeemed: false };
  });
}
