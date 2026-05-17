import { createHash } from "crypto";

import type { PrismaClient } from "@prisma/client";

import {
  SCHEDULE_SHARE_PROPOSAL_RATE_LIMIT_MAX,
  SCHEDULE_SHARE_PROPOSAL_RATE_LIMIT_WINDOW_MINUTES,
} from "@/lib/schedule-share/constants";

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/** Recommended storage format for rate-limit rows (constant-length). */
export function maybeHashIp(ip: string): string {
  if (ip === "unknown") return "unknown";
  return createHash("sha256").update(ip, "utf8").digest("hex");
}

export async function assertScheduleShareProposalRateLimit(
  db: Pick<PrismaClient, "scheduleShareGuestProposal">,
  scheduleShareLinkId: string,
  ipFingerprint: string,
): Promise<{ ok: true } | { ok: false }> {
  const windowStart = new Date(Date.now() - SCHEDULE_SHARE_PROPOSAL_RATE_LIMIT_WINDOW_MINUTES * 60_000);
  const count = await db.scheduleShareGuestProposal.count({
    where: {
      scheduleShareLinkId,
      createdFromIp: ipFingerprint,
      createdAt: { gte: windowStart },
    },
  });
  if (count >= SCHEDULE_SHARE_PROPOSAL_RATE_LIMIT_MAX) return { ok: false };
  return { ok: true };
}
