import "server-only";

import {
  ConnectionStatus,
  MessageType,
  MutualOpportunityDecisionValue,
  MutualOpportunityStatus,
  Prisma,
  type SportTag,
  type SocialIntentTopic,
  type TogetherMode,
} from "@prisma/client";

import {
  CanonicalConnectionIntegrityError,
  withCanonicalConnectionScope,
} from "@/lib/connections/canonical-connection";
import { normalizeSchoolCode } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import { repeatEligibility } from "@/lib/plans/repeat-eligibility";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";
import { activityFit, activityFitProjection } from "@/lib/v2/activity-fit";
import { compatibleIntentTiming, type OpportunityTimeContext } from "@/lib/v2/intent-timing";
import {
  classifyActivityMatch,
  type ActivityMatchClassification,
} from "@/lib/v2/mutual-opportunity-activity-compatibility";

export const MUTUAL_OPPORTUNITY_POLICY = "MUTUAL_OPPORTUNITY_V1";
const MAX_MATCH_CANDIDATES_PER_REFRESH = 240;
const PAIR_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1_000;
const MIN_OVERLAP_MS = 30 * 60 * 1_000;

type TimeWindow = Readonly<{ startAt: Date; endAt: Date }>;

export type CreatedMutualOpportunityMatch = Readonly<{
  opportunityId: string;
  userAId: string;
  userBId: string;
}>;

type LimitedUser = Readonly<{
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
  verifiedStudent: boolean;
  school: string | null;
  userLanguages: Array<{ tag: string }>;
}>;

const opportunityInclude = {
  userA: {
    select: {
      id: true,
      username: true,
      nickname: true,
      avatarUrl: true,
      major: true,
      semester: true,
      verifiedStudent: true,
      school: true,
      userLanguages: { select: { tag: true } },
    },
  },
  userB: {
    select: {
      id: true,
      username: true,
      nickname: true,
      avatarUrl: true,
      major: true,
      semester: true,
      verifiedStudent: true,
      school: true,
      userLanguages: { select: { tag: true } },
    },
  },
  course: { select: { id: true, code: true, name: true } },
  decisions: { select: { userId: true, value: true } },
} satisfies Prisma.MutualOpportunityInclude;

type OpportunityRow = Prisma.MutualOpportunityGetPayload<{
  include: typeof opportunityInclude;
}>;

export class MutualOpportunityError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "NO_LONGER_AVAILABLE"
      | "DECISION_FINAL"
      | "CONVERSATION_UNAVAILABLE",
  ) {
    super(code);
    this.name = "MutualOpportunityError";
  }
}

function parseWindows(value: Prisma.JsonValue): TimeWindow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const startAt = new Date(typeof item.startAt === "string" ? item.startAt : NaN);
    const endAt = new Date(typeof item.endAt === "string" ? item.endAt : NaN);
    return Number.isFinite(startAt.getTime()) &&
      Number.isFinite(endAt.getTime()) &&
      endAt > startAt
      ? [{ startAt, endAt }]
      : [];
  });
}

export function earliestActionableOverlap(
  first: Prisma.JsonValue,
  second: Prisma.JsonValue,
  now: Date,
): TimeWindow | null {
  let best: TimeWindow | null = null;
  for (const left of parseWindows(first)) {
    for (const right of parseWindows(second)) {
      const startAt = new Date(Math.max(left.startAt.getTime(), right.startAt.getTime()));
      const endAt = new Date(Math.min(left.endAt.getTime(), right.endAt.getTime()));
      if (
        startAt.getTime() < now.getTime() + MIN_OVERLAP_MS ||
        endAt.getTime() - startAt.getTime() < MIN_OVERLAP_MS
      ) continue;
      if (!best || startAt < best.startAt) best = { startAt, endAt };
    }
  }
  return best;
}

function displayName(user: Pick<LimitedUser, "nickname" | "username">): string {
  return user.nickname?.trim() || user.username;
}

const sportTitles: Record<Exclude<SportTag, "OTHER">, string> = {
  BASKETBALL: "Play basketball together",
  BADMINTON: "Play badminton together",
  TABLE_TENNIS: "Play table tennis together",
  FOOTBALL: "Play football together",
  VOLLEYBALL: "Play volleyball together",
  TENNIS: "Play tennis together",
  GYM: "Work out together",
  RUNNING: "Go running together",
  HIKING: "Go hiking together",
  CYCLING: "Go cycling together",
  SWIMMING: "Go swimming together",
  SKIING: "Go skiing together",
  CLIMBING: "Go climbing together",
  YOGA: "Do yoga together",
};

function topicTitle(options: {
  topic: SocialIntentTopic;
  activityText: string | null;
  sportTag: SportTag | null;
  sportOtherNote: string | null;
  matchKind: ActivityMatchClassification["matchKind"];
}): string {
  const { topic, activityText, sportTag, sportOtherNote, matchKind } = options;
  if (topic === "STUDY" && matchKind === "SHARED_CONTEXT") {
    return "Study side by side";
  }
  if (topic === "SPORTS" && sportTag) {
    if (sportTag === "OTHER") {
      const other = sportOtherNote?.trim();
      return other ? `${other} together` : "Do sports together";
    }
    return sportTitles[sportTag];
  }
  const concreteActivity = activityText?.trim();
  if (concreteActivity) return concreteActivity;
  switch (topic) {
    case "COFFEE": return "Coffee together";
    case "STUDY": return "Study together";
    case "SPORTS": return "Do sports together";
    case "EXPLORE": return "Explore together";
    case "FOOD": return "Eat together";
    case "EVENTS": return "Go to an event together";
  }
}

function planType(topic: SocialIntentTopic): "STUDY" | "MEAL" | "SPORTS" | "CUSTOM" {
  switch (topic) {
    case "STUDY": return "STUDY";
    case "FOOD": return "MEAL";
    case "SPORTS": return "SPORTS";
    default: return "CUSTOM";
  }
}

function sharedLanguages(first: LimitedUser, second: LimitedUser): string[] {
  const secondTags = new Set(second.userLanguages.map((row) => row.tag));
  return first.userLanguages.map((row) => row.tag).filter((tag) => secondTags.has(tag));
}

function viewerProjection(row: OpportunityRow, viewerId: string) {
  const viewerIsA = row.userAId === viewerId;
  const peer = viewerIsA ? row.userB : row.userA;
  const viewer = viewerIsA ? row.userA : row.userB;
  const ownDecision = row.decisions.find((decision) => decision.userId === viewerId)?.value ?? null;
  const state = row.status === MutualOpportunityStatus.MUTUAL && row.connectionId
    ? "READY_TO_COORDINATE"
    : row.status !== MutualOpportunityStatus.PENDING
      ? "UNAVAILABLE"
      : ownDecision === null
        ? "NEEDS_DECISION"
        : ownDecision === MutualOpportunityDecisionValue.YES
          ? "DECIDED"
          : "CLOSED";

  return {
    id: row.id,
    viewerIntentId: viewerIsA ? row.intentAId : row.intentBId,
    policyVersion: row.policyVersion,
    isRepeat: Boolean(row.repeatOfPlanId),
    state,
    topic: row.topic,
    matchKind: row.matchKind,
    matchFit: activityFitProjection(row.contextSnapshot, viewerIsA),
    sharedContext: row.sharedContext,
    viewerStudyGoal: viewerIsA ? row.intentAStudyGoal : row.intentBStudyGoal,
    peerStudyGoal: viewerIsA ? row.intentBStudyGoal : row.intentAStudyGoal,
    viewerTogetherMode: viewerIsA
      ? row.intentATogetherMode
      : row.intentBTogetherMode,
    peerTogetherMode: viewerIsA
      ? row.intentBTogetherMode
      : row.intentATogetherMode,
    activityText: row.activityText,
    sportTag: row.sportTag,
    sportOtherNote: row.sportOtherNote,
    course: row.course,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    timeContext: (row.contextSnapshot as Prisma.JsonObject)?.timeContext ?? null,
    expiresAt: row.expiresAt.toISOString(),
    peer: {
      displayName: displayName(peer),
      avatarUrl: peer.avatarUrl,
      verifiedStudent: peer.verifiedStudent,
      major: peer.major,
      semester: peer.semester,
      sharedLanguages: sharedLanguages(viewer, peer),
    },
    viewerDecision: ownDecision,
    coordination:
      state === "READY_TO_COORDINATE" && row.connectionId
        ? { connectionId: row.connectionId }
        : null,
    version: row.version,
  };
}

function contextSnapshot(options: {
  id: string;
  isRepeat?: boolean;
  topic: SocialIntentTopic;
  matchKind: ActivityMatchClassification["matchKind"];
  sharedContext: ActivityMatchClassification["sharedContext"];
  intentAStudyGoal: string | null;
  intentBStudyGoal: string | null;
  intentATogetherMode: TogetherMode;
  intentBTogetherMode: TogetherMode;
  activityText: string | null;
  sportTag: SportTag | null;
  sportOtherNote: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  timeContext: OpportunityTimeContext;
  userA: LimitedUser;
  userB: LimitedUser;
  course: { id: string; code: string | null; name: string } | null;
  activityFit: (ReturnType<typeof activityFit> & {
    intentAActivityText: string | null;
    intentBActivityText: string | null;
  }) | null;
}): Prisma.InputJsonObject {
  return {
    version: 1,
    sourceKind: "MUTUAL_OPPORTUNITY",
    sourceId: options.id,
    isRepeat: options.isRepeat ?? false,
    title: topicTitle(options),
    startsAt: options.startsAt?.toISOString() ?? null,
    endsAt: options.endsAt?.toISOString() ?? null,
    timeContext: options.timeContext,
    location: null,
    planType: planType(options.topic),
    participantIds: [options.userA.id, options.userB.id],
    author: { id: options.userA.id, displayName: displayName(options.userA) },
    course: options.course
      ? { id: options.course.id, code: options.course.code, name: options.course.name }
      : null,
    matchKind: options.matchKind,
    sharedContext: options.sharedContext,
    intentAStudyGoal: options.intentAStudyGoal,
    intentBStudyGoal: options.intentBStudyGoal,
    intentATogetherMode: options.intentATogetherMode,
    intentBTogetherMode: options.intentBTogetherMode,
    activityText: options.activityText,
    sportTag: options.sportTag,
    sportOtherNote: options.sportOtherNote,
    activityFit: options.activityFit,
  };
}

async function expireStaleForUser(userId: string, now: Date) {
  const stale = await prisma.mutualOpportunity.findMany({
    where: {
      status: MutualOpportunityStatus.PENDING,
      AND: [
        { OR: [{ userAId: userId }, { userBId: userId }] },
        { OR: [
          { expiresAt: { lte: now } },
          { startsAt: { lte: now } },
          { intentA: { status: { not: "ACTIVE" } } },
          { intentB: { status: { not: "ACTIVE" } } },
        ] },
      ],
    },
    select: { id: true },
  });
  if (stale.length === 0) return;
  await prisma.mutualOpportunity.updateMany({
    where: { id: { in: stale.map((row) => row.id) }, status: "PENDING" },
    data: { status: "EXPIRED", terminalAt: now, version: { increment: 1 } },
  });
}

async function lockIntentRows(
  tx: Prisma.TransactionClient,
  intentIds: string[],
) {
  const orderedIds = [...intentIds].sort();
  await tx.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "WeeklyIntent"
    WHERE "id" IN (${Prisma.join(orderedIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
  return orderedIds;
}

async function lockActiveMatchingSessions(
  tx: Prisma.TransactionClient,
  userIds: string[],
) {
  const orderedUserIds = [...new Set(userIds)].sort();
  if (orderedUserIds.length === 0) return true;
  await tx.$queryRaw(Prisma.sql`
    SELECT "userId"
    FROM "TogetherMatchingSession"
    WHERE "userId" IN (${Prisma.join(orderedUserIds)})
    ORDER BY "userId"
    FOR UPDATE
  `);
  // Read the clock only after every session row is locked. If this transaction
  // waited behind Stop, or the 48-hour window elapsed while waiting, the final
  // insert must observe that authoritative state rather than the earlier
  // candidate-query timestamp.
  const recheckNow = new Date();
  const activeSessions = await tx.togetherMatchingSession.findMany({
    where: {
      userId: { in: orderedUserIds },
      stoppedAt: null,
      matchingUntil: { gt: recheckNow },
    },
    select: { userId: true },
  });
  return activeSessions.length === orderedUserIds.length;
}

async function createCandidateOpportunity(options: {
  ownerIntent: {
    id: string;
    createdAt: Date;
    userId: string;
    topic: SocialIntentTopic;
    courseId: string | null;
    togetherMode: TogetherMode;
    studyGoal: string | null;
    activityText: string | null;
    sportTag: SportTag | null;
    sportOtherNote: string | null;
    timeWindows: Prisma.JsonValue;
    timePreference: Prisma.JsonValue;
    automaticMatching: boolean;
    timeZone: string;
    expiresAt: Date;
    version: number;
    user: LimitedUser;
  };
  candidateIntent: {
    id: string;
    createdAt: Date;
    userId: string;
    topic: SocialIntentTopic;
    courseId: string | null;
    togetherMode: TogetherMode;
    studyGoal: string | null;
    activityText: string | null;
    sportTag: SportTag | null;
    sportOtherNote: string | null;
    timeWindows: Prisma.JsonValue;
    timePreference: Prisma.JsonValue;
    automaticMatching: boolean;
    timeZone: string;
    expiresAt: Date;
    version: number;
    user: LimitedUser;
    course: { id: string; code: string | null; name: string } | null;
  };
  now: Date;
}): Promise<CreatedMutualOpportunityMatch | null> {
  const { ownerIntent, candidateIntent, now } = options;
  if (ownerIntent.topic !== candidateIntent.topic) return null;
  const activityMatch = classifyActivityMatch(
    ownerIntent, candidateIntent, isV2FeatureEnabled("v2ActivityFit"),
  );
  if (!activityMatch) return null;
  if (
    (ownerIntent.courseId || candidateIntent.courseId) &&
    ownerIntent.courseId !== candidateIntent.courseId
  ) return null;
  if (sharedLanguages(ownerIntent.user, candidateIntent.user).length === 0) return null;
  const overlap = compatibleIntentTiming(ownerIntent, candidateIntent, now);
  if (!overlap) return null;
  if (!overlap.startsAt && !isV2FeatureEnabled("v2FlexibleTiming")) return null;
  const expiresAt = overlap.expiresAt;
  if (expiresAt <= now) return null;

  const ownerFirst = ownerIntent.userId.localeCompare(candidateIntent.userId) < 0;
  const userA = ownerFirst ? ownerIntent.user : candidateIntent.user;
  const userB = ownerFirst ? candidateIntent.user : ownerIntent.user;
  const intentAId = ownerFirst ? ownerIntent.id : candidateIntent.id;
  const intentBId = ownerFirst ? candidateIntent.id : ownerIntent.id;
  const intentAActivity = ownerFirst ? activityMatch.first : activityMatch.second;
  const intentBActivity = ownerFirst ? activityMatch.second : activityMatch.first;
  const fit = {
    ...activityFit(activityMatch, overlap.overlapMinutes, Boolean(ownerIntent.timePreference || candidateIntent.timePreference)),
    intentAActivityText: ownerFirst ? ownerIntent.activityText : candidateIntent.activityText,
    intentBActivityText: ownerFirst ? candidateIntent.activityText : ownerIntent.activityText,
  };
  // A related activity has no agreed concrete title yet; the Plan editor uses
  // the shared topic, and the new card shows both original descriptions.
  const sharedActivityText = fit.basis === "RELATED_ACTIVITY" ? null : ownerIntent.activityText;
  // Pre-concrete legacy intents remain eligible under their old rules, but
  // without a declared activity there is no basis for public activity points.
  const fitSnapshot = ownerIntent.activityText || ownerIntent.studyGoal || ownerIntent.sportTag
    ? fit : null;

  return prisma.$transaction(async (tx) =>
    withCanonicalConnectionScope(tx, userA.id, userB.id, async (scope) => {
      if (scope.existing && scope.existing.status !== ConnectionStatus.ACTIVE) return null;

      const intentIds = await lockIntentRows(
        tx,
        [ownerIntent.id, candidateIntent.id],
      );
      // Published intentions use their locked lifecycle. Only legacy intents
      // require the separate session consent, rechecked after acquiring locks.
      if (!await lockActiveMatchingSessions(
        tx,
        [ownerIntent, candidateIntent].filter(intent => !intent.automaticMatching).map(intent => intent.userId),
      )) return null;
      const lockedIntents = await tx.weeklyIntent.findMany({
        where: { id: { in: intentIds } },
        select: {
          id: true,
          userId: true,
          topic: true,
          courseId: true,
          togetherMode: true,
          studyGoal: true,
          activityText: true,
          sportTag: true,
          sportOtherNote: true,
          timeWindows: true,
          timePreference: true,
          automaticMatching: true,
          timeZone: true,
          expiresAt: true,
          status: true,
          version: true,
        },
      });
      const expected = new Map([
        [ownerIntent.id, ownerIntent],
        [candidateIntent.id, candidateIntent],
      ]);
      const recheckNow = new Date();
      const intentsAreCurrent = lockedIntents.length === 2 &&
        lockedIntents.every((intent) => {
          const snapshot = expected.get(intent.id);
          return snapshot !== undefined &&
            intent.userId === snapshot.userId &&
            intent.status === "ACTIVE" &&
            intent.expiresAt > recheckNow &&
            intent.automaticMatching === snapshot.automaticMatching &&
            (!intent.automaticMatching || isV2FeatureEnabled("v2AutomaticMatching")) &&
            intent.version === snapshot.version &&
            intent.topic === snapshot.topic &&
            intent.courseId === snapshot.courseId &&
            intent.togetherMode === snapshot.togetherMode &&
            intent.studyGoal === snapshot.studyGoal &&
            intent.activityText === snapshot.activityText &&
            intent.sportTag === snapshot.sportTag &&
            intent.sportOtherNote === snapshot.sportOtherNote &&
            intent.timeZone === snapshot.timeZone &&
            JSON.stringify(intent.timePreference) === JSON.stringify(snapshot.timePreference) &&
            JSON.stringify(intent.timeWindows) === JSON.stringify(snapshot.timeWindows);
        });
      if (!intentsAreCurrent) return null;

      const repeat = await repeatEligibility(tx, userA.id, userB.id, now);
      // A known pair cannot fall back to first-encounter matching to bypass
      // missing/withdrawn permission. Both intents must be new after the Plan.
      if (repeat.hasHistory && (!isV2FeatureEnabled("v2MeetAgain") || !repeat.source ||
        ownerIntent.createdAt <= repeat.source.endedAt ||
        candidateIntent.createdAt <= repeat.source.endedAt)) return null;

      // A peer may not have refreshed Together since an older opportunity's
      // decision window elapsed. Retire those rows here so an expired PENDING
      // record cannot monopolize an otherwise active intent.
      await tx.mutualOpportunity.updateMany({
        where: {
          status: "PENDING",
          AND: [
            {
              OR: [
                { intentAId: { in: intentIds } },
                { intentBId: { in: intentIds } },
              ],
            },
            {
              OR: [
                { expiresAt: { lte: now } },
                { startsAt: { lte: now } },
                { intentA: { status: { not: "ACTIVE" } } },
                { intentB: { status: { not: "ACTIVE" } } },
              ],
            },
          ],
        },
        data: {
          status: "EXPIRED",
          terminalAt: now,
          version: { increment: 1 },
        },
      });

      const [blocked, moderated, recent, occupationRows] = await Promise.all([
        tx.block.findFirst({
          where: {
            OR: [
              { blockerId: userA.id, blockedId: userB.id },
              { blockerId: userB.id, blockedId: userA.id },
            ],
          },
          select: { id: true },
        }),
        tx.moderationBlock.findFirst({
          where: { userId: { in: [userA.id, userB.id] }, isActive: true },
          select: { id: true },
        }),
        tx.mutualOpportunity.findFirst({
          where: {
            userAId: userA.id,
            userBId: userB.id,
            createdAt: { gte: new Date(now.getTime() - PAIR_COOLDOWN_MS) },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, createdAt: true },
        }),
        tx.mutualOpportunity.findMany({
          where: {
            status: { in: ["PENDING", "MUTUAL"] },
            OR: [
              { intentAId: { in: intentIds } },
              { intentBId: { in: intentIds } },
              { userAId: userA.id, userBId: userB.id },
            ],
          },
          select: { id: true, status: true },
        }),
      ]);
      const completedCooldown = repeat?.source &&
        recent && recent.createdAt < repeat.source.endedAt;
      if (blocked || moderated || (recent && !completedCooldown)) return null;

      // Cooldown is historical and was checked above. Occupation is narrower:
      // an arranged MUTUAL row remains immutable history, but once its trusted
      // source Plan is ACCEPTED it is no longer an actionable pair slot.
      const mutualOccupationIds = occupationRows.flatMap((row) =>
        row.status === "MUTUAL" ? [row.id] : []
      );
      const acceptedOrigins = mutualOccupationIds.length > 0
        ? await tx.planRequest.findMany({
            where: {
              originKind: "MUTUAL_OPPORTUNITY",
              originId: { in: mutualOccupationIds },
              status: "ACCEPTED",
            },
            select: { originId: true },
          })
        : [];
      const arrangedOpportunityIds = new Set(
        acceptedOrigins.flatMap((row) => row.originId ? [row.originId] : []),
      );
      const hasOpenOccupation = occupationRows.some(
        (row) =>
          row.status === "PENDING" || !arrangedOpportunityIds.has(row.id),
      );
      if (hasOpenOccupation) return null;

      const placeholder = contextSnapshot({
        activityFit: fitSnapshot,
        id: "pending",
        isRepeat: Boolean(repeat?.source),
        topic: ownerIntent.topic,
        matchKind: activityMatch.matchKind,
        sharedContext: activityMatch.sharedContext,
        intentAStudyGoal: intentAActivity.displayStudyGoal,
        intentBStudyGoal: intentBActivity.displayStudyGoal,
        intentATogetherMode: intentAActivity.togetherMode,
        intentBTogetherMode: intentBActivity.togetherMode,
        activityText: sharedActivityText,
        sportTag: ownerIntent.sportTag,
        sportOtherNote: ownerIntent.sportOtherNote,
        startsAt: overlap.startsAt,
        endsAt: overlap.endsAt,
        timeContext: overlap.context,
        userA,
        userB,
        course: candidateIntent.course,
      });
      const inserted = await tx.mutualOpportunity.createMany({
        data: [{
          userAId: userA.id,
          userBId: userB.id,
          intentAId,
          intentBId,
          topic: ownerIntent.topic,
          matchKind: activityMatch.matchKind,
          sharedContext: activityMatch.sharedContext,
          intentAStudyGoal: intentAActivity.displayStudyGoal,
          intentBStudyGoal: intentBActivity.displayStudyGoal,
          intentATogetherMode: intentAActivity.togetherMode,
          intentBTogetherMode: intentBActivity.togetherMode,
          courseId: ownerIntent.courseId,
          activityText: sharedActivityText,
          sportTag: ownerIntent.sportTag,
          sportOtherNote: ownerIntent.sportOtherNote,
          startsAt: overlap.startsAt,
          endsAt: overlap.endsAt,
          expiresAt,
          contextSnapshot: placeholder,
          repeatOfPlanId: repeat?.source?.planId ?? null,
        }],
        skipDuplicates: true,
      });
      if (inserted.count === 0) return null;
      const created = await tx.mutualOpportunity.findUniqueOrThrow({
        where: { intentAId_intentBId: { intentAId, intentBId } },
        select: { id: true, userAId: true, userBId: true },
      });
      await tx.mutualOpportunity.update({
        where: { id: created.id },
        data: {
          contextSnapshot: contextSnapshot({
            activityFit: fitSnapshot,
            id: created.id,
            isRepeat: Boolean(repeat?.source),
            topic: ownerIntent.topic,
            matchKind: activityMatch.matchKind,
            sharedContext: activityMatch.sharedContext,
            intentAStudyGoal: intentAActivity.displayStudyGoal,
            intentBStudyGoal: intentBActivity.displayStudyGoal,
            intentATogetherMode: intentAActivity.togetherMode,
            intentBTogetherMode: intentBActivity.togetherMode,
            activityText: sharedActivityText,
            sportTag: ownerIntent.sportTag,
            sportOtherNote: ownerIntent.sportOtherNote,
            startsAt: overlap.startsAt,
            endsAt: overlap.endsAt,
            timeContext: overlap.context,
            userA,
            userB,
            course: candidateIntent.course,
          }),
        },
      });
      return {
        opportunityId: created.id,
        userAId: created.userAId,
        userBId: created.userBId,
      };
    }),
  );
}

function matchingEnrollmentWhere(now: Date): Prisma.WeeklyIntentWhereInput {
  return {
    OR: [
      ...(isV2FeatureEnabled("v2AutomaticMatching") ? [{ automaticMatching: true }] : []),
      { automaticMatching: false, user: { togetherMatchingSession: { is: {
        stoppedAt: null, matchingUntil: { gt: now },
      } } } },
    ],
  };
}

export async function generateMutualOpportunitiesForUser(
  userId: string,
): Promise<CreatedMutualOpportunityMatch[]> {
  const now = new Date();
  await expireStaleForUser(userId, now);
  const ownerIntents = await prisma.weeklyIntent.findMany({
    where: {
      ...matchingEnrollmentWhere(now),
      userId,
      status: "ACTIVE",
      expiresAt: { gt: now },
      mutualOpportunitiesAsA: {
        none: { status: { in: ["PENDING", "MUTUAL"] } },
      },
      mutualOpportunitiesAsB: {
        none: { status: { in: ["PENDING", "MUTUAL"] } },
      },
      user: {
        onboardingComplete: true,
        isGuest: false,
        verifiedStudent: true,
        hideFromDiscovery: false,
        hideFromRecommendations: false,
        moderationBlocks: { none: { isActive: true } },
      },
    },
    // Every currently unoccupied intent gets one matching pass. Oldest first
    // prevents a newly-created intent from repeatedly starving earlier ones.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      userId: true,
      topic: true,
      courseId: true,
      togetherMode: true,
      studyGoal: true,
      activityText: true,
      sportTag: true,
      sportOtherNote: true,
      timeWindows: true,
      timePreference: true,
      automaticMatching: true,
      timeZone: true,
      expiresAt: true,
      version: true,
      user: { select: opportunityInclude.userA.select },
      createdAt: true,
    },
  });
  if (ownerIntents.length === 0) return [];
  const owner = ownerIntents[0]!.user;
  if (
    !owner.verifiedStudent ||
    normalizeSchoolCode(owner.school) === null ||
    owner.userLanguages.length === 0
  ) return [];

  const candidates = await prisma.weeklyIntent.findMany({
    where: {
      ...matchingEnrollmentWhere(now),
      userId: { not: userId },
      status: "ACTIVE",
      expiresAt: { gt: now },
      topic: { in: [...new Set(ownerIntents.map((intent) => intent.topic))] },
      mutualOpportunitiesAsA: {
        none: {
          OR: [
            { status: "MUTUAL" },
            {
              status: "PENDING",
              expiresAt: { gt: now },
              OR: [{ startsAt: null }, { startsAt: { gt: now } }],
              intentA: { status: "ACTIVE" },
              intentB: { status: "ACTIVE" },
            },
          ],
        },
      },
      mutualOpportunitiesAsB: {
        none: {
          OR: [
            { status: "MUTUAL" },
            {
              status: "PENDING",
              expiresAt: { gt: now },
              OR: [{ startsAt: null }, { startsAt: { gt: now } }],
              intentA: { status: "ACTIVE" },
              intentB: { status: "ACTIVE" },
            },
          ],
        },
      },
      user: {
        onboardingComplete: true,
        isGuest: false,
        verifiedStudent: true,
        hideFromDiscovery: false,
        hideFromRecommendations: false,
        moderationBlocks: { none: { isActive: true } },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: MAX_MATCH_CANDIDATES_PER_REFRESH,
    select: {
      id: true,
      userId: true,
      topic: true,
      courseId: true,
      togetherMode: true,
      studyGoal: true,
      activityText: true,
      sportTag: true,
      sportOtherNote: true,
      timeWindows: true,
      timePreference: true,
      automaticMatching: true,
      timeZone: true,
      expiresAt: true,
      version: true,
      user: { select: opportunityInclude.userB.select },
      createdAt: true,
      course: { select: { id: true, code: true, name: true } },
    },
  });

  const ownerSchool = normalizeSchoolCode(owner.school);
  const created: CreatedMutualOpportunityMatch[] = [];
  for (const ownerIntent of ownerIntents) {
    const rankedCandidates = candidates.flatMap((candidate) => {
      const match = classifyActivityMatch(ownerIntent, candidate, isV2FeatureEnabled("v2ActivityFit"));
      const overlap = compatibleIntentTiming(ownerIntent, candidate, now);
      if (!match || !overlap) return [];
      const fit = activityFit(match, overlap.overlapMinutes, Boolean(ownerIntent.timePreference || candidate.timePreference));
      return [{ candidate, fit, certainty: overlap.certainty }];
    }).sort((left, right) => right.certainty - left.certainty || right.fit.score - left.fit.score ||
      right.fit.activityPoints - left.fit.activityPoints);
    // Scores rank feasible opportunities; there is deliberately no score cutoff.
    // Stable ties retain the existing oldest-first order.
    for (const { candidate } of rankedCandidates) {
      const candidateSchool = normalizeSchoolCode(candidate.user.school);
      const sameSchool =
        ownerSchool !== null &&
        candidateSchool !== null &&
        ownerSchool === candidateSchool;
      if (!sameSchool) continue;
      const opportunity = await createCandidateOpportunity({
        ownerIntent,
        candidateIntent: candidate,
        now,
      });
      if (opportunity) {
        created.push(opportunity);
        break;
      }
    }
  }
  return created;
}

async function rowsForUser(userId: string) {
  const acceptedOrigins = await prisma.planRequest.findMany({
    where: {
      originKind: "MUTUAL_OPPORTUNITY",
      status: "ACCEPTED",
      originId: { not: null },
      OR: [{ proposerUserId: userId }, { receiverUserId: userId }],
    },
    select: { originId: true },
  });
  const acceptedOpportunityIds = acceptedOrigins.flatMap((row) =>
    row.originId ? [row.originId] : []
  );
  return prisma.mutualOpportunity.findMany({
    where: {
      ...(acceptedOpportunityIds.length > 0
        ? { id: { notIn: acceptedOpportunityIds } }
        : {}),
      OR: [{ userAId: userId }, { userBId: userId }],
      status: { in: ["PENDING", "MUTUAL"] },
    },
    include: opportunityInclude,
    orderBy: [{ updatedAt: "desc" }, { startsAt: "asc" }],
    take: 32,
  });
}

export async function listMutualOpportunities(userId: string, generate: boolean) {
  const now = new Date();
  await expireStaleForUser(userId, now);
  if (generate) await generateMutualOpportunitiesForUser(userId);
  const rows = await rowsForUser(userId);
  return {
    opportunities: rows
      .map((row) => viewerProjection(row, userId))
      .filter((row) =>
        row.state === "NEEDS_DECISION" ||
        row.state === "DECIDED" ||
        row.state === "READY_TO_COORDINATE"
      ),
  };
}

async function lockedOpportunity(
  tx: Prisma.TransactionClient,
  opportunityId: string,
) {
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "MutualOpportunity" WHERE "id" = ${opportunityId} FOR UPDATE
  `);
  return tx.mutualOpportunity.findUnique({
    where: { id: opportunityId },
    include: opportunityInclude,
  });
}

export async function decideMutualOpportunity(options: {
  userId: string;
  opportunityId: string;
  decision: "YES" | "NO";
}) {
  const seed = await prisma.mutualOpportunity.findFirst({
    where: {
      id: options.opportunityId,
      OR: [{ userAId: options.userId }, { userBId: options.userId }],
    },
    select: {
      userAId: true,
      userBId: true,
      intentAId: true,
      intentBId: true,
    },
  });
  if (!seed) throw new MutualOpportunityError("NOT_FOUND");

  return prisma.$transaction(async (tx) =>
    withCanonicalConnectionScope(tx, seed.userAId, seed.userBId, async (scope) => {
      await lockIntentRows(tx, [seed.intentAId, seed.intentBId]);
      let row = await lockedOpportunity(tx, options.opportunityId);
      if (!row || (row.userAId !== options.userId && row.userBId !== options.userId)) {
        throw new MutualOpportunityError("NOT_FOUND");
      }
      const now = new Date();
      if (row.status !== "PENDING" || row.expiresAt <= now || (row.startsAt !== null && row.startsAt <= now)) {
        throw new MutualOpportunityError("NO_LONGER_AVAILABLE");
      }
      if (row.repeatOfPlanId && options.decision === "YES") {
        const repeat = isV2FeatureEnabled("v2MeetAgain")
          ? await repeatEligibility(tx, row.userAId, row.userBId, now)
          : null;
        if (repeat?.source?.planId !== row.repeatOfPlanId) {
          throw new MutualOpportunityError("NO_LONGER_AVAILABLE");
        }
      }
      const existing = row.decisions.find((decision) => decision.userId === options.userId);
      if (existing && existing.value !== options.decision) {
        throw new MutualOpportunityError("DECISION_FINAL");
      }
      if (!existing) {
        await tx.mutualOpportunityDecision.create({
          data: {
            opportunityId: row.id,
            userId: options.userId,
            value: options.decision,
          },
        });
      }
      row = (await lockedOpportunity(tx, row.id))!;
      if (options.decision === "NO") {
        const unavailable = await tx.mutualOpportunity.update({
          where: { id: row.id },
          data: {
            status: "UNAVAILABLE",
            terminalAt: now,
            version: { increment: 1 },
          },
          include: opportunityInclude,
        });
        return {
          opportunity: viewerProjection(unavailable, options.userId),
          rematchUserIds: [row.userAId, row.userBId],
        };
      }
      const yesUsers = new Set(
        row.decisions
          .filter((decision) => decision.value === "YES")
          .map((decision) => decision.userId),
      );
      if (!(yesUsers.has(row.userAId) && yesUsers.has(row.userBId))) {
        return {
          opportunity: viewerProjection(row, options.userId),
          rematchUserIds: [],
        };
      }

      const [blocked, moderated, intents] = await Promise.all([
        tx.block.findFirst({
          where: {
            OR: [
              { blockerId: row.userAId, blockedId: row.userBId },
              { blockerId: row.userBId, blockedId: row.userAId },
            ],
          },
          select: { id: true },
        }),
        tx.moderationBlock.findFirst({
          where: { userId: { in: [row.userAId, row.userBId] }, isActive: true },
          select: { id: true },
        }),
        tx.weeklyIntent.count({
          where: {
            id: { in: [row.intentAId, row.intentBId] },
            status: "ACTIVE",
            expiresAt: { gt: now },
          },
        }),
      ]);
      if (
        blocked ||
        moderated ||
        intents !== 2 ||
        (scope.existing && scope.existing.status !== ConnectionStatus.ACTIVE)
      ) {
        const unavailable = await tx.mutualOpportunity.update({
          where: { id: row.id },
          data: {
            status: "UNAVAILABLE",
            terminalAt: now,
            version: { increment: 1 },
          },
          include: opportunityInclude,
        });
        return {
          opportunity: viewerProjection(unavailable, options.userId),
          rematchUserIds: [],
        };
      }

      const connection = scope.existing ?? await scope.createActive({
        originCourseId: row.courseId,
      });
      await tx.message.create({
        data: {
          connectionId: connection.id,
          senderId: options.userId,
          body: "",
          type: MessageType.MUTUAL_OPPORTUNITY_CARD,
          mutualOpportunityId: row.id,
        },
      });
      const mutual = await tx.mutualOpportunity.update({
        where: { id: row.id },
        data: {
          status: "MUTUAL",
          connectionId: connection.id,
          activatedAt: now,
          version: { increment: 1 },
        },
        include: opportunityInclude,
      });
      return {
        opportunity: viewerProjection(mutual, options.userId),
        rematchUserIds: [],
      };
    }),
  ).catch((cause) => {
    if (cause instanceof CanonicalConnectionIntegrityError) {
      throw new MutualOpportunityError("CONVERSATION_UNAVAILABLE");
    }
    throw cause;
  });
}

export async function withdrawMutualOpportunityDecision(options: {
  userId: string;
  opportunityId: string;
}) {
  const seed = await prisma.mutualOpportunity.findFirst({
    where: {
      id: options.opportunityId,
      OR: [{ userAId: options.userId }, { userBId: options.userId }],
    },
    select: {
      userAId: true,
      userBId: true,
      intentAId: true,
      intentBId: true,
    },
  });
  if (!seed) throw new MutualOpportunityError("NOT_FOUND");

  return prisma.$transaction(async (tx) =>
    withCanonicalConnectionScope(tx, seed.userAId, seed.userBId, async () => {
      await lockIntentRows(tx, [seed.intentAId, seed.intentBId]);
      const row = await lockedOpportunity(tx, options.opportunityId);
      if (
        !row ||
        row.status !== MutualOpportunityStatus.PENDING ||
        (row.userAId !== options.userId && row.userBId !== options.userId)
      ) {
        throw new MutualOpportunityError("NO_LONGER_AVAILABLE");
      }
      const ownDecision = row.decisions.find(
        (decision) => decision.userId === options.userId,
      );
      if (ownDecision?.value !== MutualOpportunityDecisionValue.YES) {
        throw new MutualOpportunityError("DECISION_FINAL");
      }

      const now = new Date();
      await tx.mutualOpportunityDecision.update({
        where: {
          opportunityId_userId: {
            opportunityId: row.id,
            userId: options.userId,
          },
        },
        data: { value: "WITHDRAWN", version: { increment: 1 } },
      });
      const unavailable = await tx.mutualOpportunity.update({
        where: { id: row.id },
        data: {
          status: "UNAVAILABLE",
          terminalAt: now,
          version: { increment: 1 },
        },
        include: opportunityInclude,
      });
      return {
        opportunity: viewerProjection(unavailable, options.userId),
        rematchUserIds: [row.userAId, row.userBId],
      };
    }),
  );
}
