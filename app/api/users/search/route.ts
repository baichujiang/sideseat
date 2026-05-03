import { NextRequest } from "next/server";
import { ConnectionStatus } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import { ok } from "@/lib/http";

export type UserSearchHit = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
  school: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus:
    | "UNVERIFIED"
    | "EMAIL_PENDING"
    | "VERIFIED"
    | "MANUAL_REVIEW_REQUIRED"
    | "REJECTED";
  /**
   * Number of courses this user has in common with the viewer. Helps the
   * client sort "familiar faces" above totally unknown classmates when two
   * search results match the query equally well.
   */
  sharedCourseCount: number;
  /**
   * True when the viewer already has an ACTIVE 1:1 thread with this user —
   * the client can badge or collapse the "Message" affordance on the card
   * so we don't send the viewer into a duplicate first-message flow.
   */
  hasActiveConnection: boolean;
};

/**
 * People-search backing for the Discover tab.
 *
 * Scope:
 *   - Same school as the viewer (MVP — cross-school matching has more
 *     product questions than we want to answer today).
 *   - Onboarded users only (no half-created accounts).
 *   - Excludes the viewer, anyone with mutual Block, and anyone with an
 *     active ModerationBlock.
 *
 * Matching:
 *   - Case-insensitive `contains` on `nickname`
 *   - Case-insensitive `startsWith` on `username` (usernames are handle-like
 *     so prefix match feels natural — "lin" should surface "linbai" but not
 *     "carolinlee")
 *   - Union via `OR`, dedup by row id (Prisma handles this automatically).
 *
 * Ranking priority (descending):
 *   1. Exact nickname equality (case-insensitive)
 *   2. Username prefix match (handle lookups are the most deliberate queries)
 *   3. Shared course count (familiar faces first)
 *   4. Verified students before unverified (trust signal on ties)
 *
 * A short `q` (<2 chars) returns an empty list — we don't want a 200k-row
 * broadcast when someone types one letter.
 */
export async function GET(request: NextRequest) {
  const user = await requireOnboardedUser();
  const url = new URL(request.url);
  const raw = url.searchParams.get("q")?.trim() ?? "";

  if (raw.length < 2) {
    return ok({ hits: [] as UserSearchHit[] });
  }

  const school = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
  const lower = raw.toLowerCase();

  const matches = await prisma.user.findMany({
    where: {
      id: { not: user.id },
      school,
      onboardingComplete: true,
      // Exclude users who have muted or been muted by the viewer.
      blocksInitiated: { none: { blockedId: user.id } },
      blocksReceived: { none: { blockerId: user.id } },
      moderationBlocks: { none: { isActive: true } },
      OR: [
        { nickname: { contains: raw, mode: "insensitive" } },
        { username: { startsWith: raw, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      username: true,
      nickname: true,
      avatarUrl: true,
      major: true,
      semester: true,
      school: true,
      verifiedStudent: true,
      studentVerificationStatus: true,
    },
    take: 40,
  });

  if (matches.length === 0) {
    return ok({ hits: [] as UserSearchHit[] });
  }

  const peerIds = matches.map((m) => m.id);

  // Pull shared-course counts and active connections in one round-trip each.
  // Both are small lookups — peerIds is bounded by the `take: 40` above.
  const [sharedCourseRows, activeConnections] = await Promise.all([
    prisma.userCourse.findMany({
      where: {
        userId: { in: peerIds },
        course: { members: { some: { userId: user.id } } },
      },
      select: { userId: true },
    }),
    prisma.connection.findMany({
      where: {
        status: ConnectionStatus.ACTIVE,
        OR: [
          { userAId: user.id, userBId: { in: peerIds } },
          { userAId: { in: peerIds }, userBId: user.id },
        ],
      },
      select: { userAId: true, userBId: true },
    }),
  ]);

  const sharedCount = new Map<string, number>();
  for (const row of sharedCourseRows) {
    sharedCount.set(row.userId, (sharedCount.get(row.userId) ?? 0) + 1);
  }

  const connectedSet = new Set<string>();
  for (const c of activeConnections) {
    connectedSet.add(c.userAId === user.id ? c.userBId : c.userAId);
  }

  const hits: UserSearchHit[] = matches
    .map((m) => ({
      id: m.id,
      username: m.username,
      nickname: m.nickname,
      avatarUrl: m.avatarUrl,
      major: m.major,
      semester: m.semester,
      school: m.school,
      verifiedStudent: m.verifiedStudent,
      studentVerificationStatus: m.studentVerificationStatus,
      sharedCourseCount: sharedCount.get(m.id) ?? 0,
      hasActiveConnection: connectedSet.has(m.id),
    }))
    .sort((a, b) => {
      const aExact = (a.nickname ?? "").toLowerCase() === lower ? 1 : 0;
      const bExact = (b.nickname ?? "").toLowerCase() === lower ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;

      const aHandle = a.username.toLowerCase().startsWith(lower) ? 1 : 0;
      const bHandle = b.username.toLowerCase().startsWith(lower) ? 1 : 0;
      if (aHandle !== bHandle) return bHandle - aHandle;

      if (b.sharedCourseCount !== a.sharedCourseCount)
        return b.sharedCourseCount - a.sharedCourseCount;

      if (a.verifiedStudent !== b.verifiedStudent)
        return a.verifiedStudent ? -1 : 1;

      return (a.nickname ?? a.username).localeCompare(b.nickname ?? b.username);
    })
    .slice(0, 20);

  return ok({ hits });
}
