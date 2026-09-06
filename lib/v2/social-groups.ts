import "server-only";

import { toZonedTime } from "date-fns-tz";
import type {
  PlanOutcomeValue,
  PlanType,
  Prisma,
  LanguageTag,
  SocialGroupCandidateStatus,
  SocialIntentTopic,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { notifyUserPush } from "@/lib/push/notify-user";
import type { SocialGroupDraftInput } from "@/lib/validators/social-group";
import type { SocialWindowInput } from "@/lib/validators/social-preferences";
import { isV2SmallGroupPilotUser } from "@/lib/v2/feature-flags";

export class SocialGroupError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_STATE" | "NOT_ENOUGH_CANDIDATES",
    readonly messageText: string,
  ) {
    super(messageText);
    this.name = "SocialGroupError";
  }
}

function startFitsWindows(
  startAt: Date,
  weeklyWindows: Prisma.JsonValue,
  timeZone: string,
) {
  const local = toZonedTime(startAt, timeZone);
  const weekday = local.getDay() === 0 ? 7 : local.getDay();
  const minutes = local.getHours() * 60 + local.getMinutes();
  const windows = weeklyWindows as unknown as SocialWindowInput[];
  return windows.some(
    (window) =>
      window.weekday === weekday &&
      minutes >= window.startMinutes &&
      minutes < window.endMinutes,
  );
}

function planTypeForTopic(topic: SocialIntentTopic): PlanType {
  switch (topic) {
    case "STUDY": return "STUDY";
    case "COFFEE":
    case "FOOD": return "MEAL";
    case "SPORTS": return "SPORTS";
    default: return "CUSTOM";
  }
}

export async function generateSmallGroupCandidates(input: SocialGroupDraftInput) {
  const startAt = new Date(input.startAt);
  const rows = await prisma.user.findMany({
    where: {
      isGuest: false,
      onboardingComplete: true,
      verifiedStudent: true,
      school: input.school,
      moderationBlocks: { none: { isActive: true } },
      socialPreference: {
        is: {
          activeUntil: { gt: new Date() },
          topics: { has: input.topic },
          meetingPreference: { in: ["SMALL_GROUP", "BOTH"] },
        },
      },
    },
    select: {
      id: true,
      username: true,
      nickname: true,
      email: true,
      avatarUrl: true,
      school: true,
      userLanguages: { select: { tag: true } },
      socialPreference: {
        select: {
          weeklyWindows: true,
          timeZone: true,
          meetingPreference: true,
          updatedAt: true,
        },
      },
    },
    take: 200,
  });
  const eligible = rows
    .filter(
      (row) =>
        isV2SmallGroupPilotUser(row) &&
        row.socialPreference &&
        startFitsWindows(
          startAt,
          row.socialPreference.weeklyWindows,
          row.socialPreference.timeZone,
        ),
    )
    .sort(
      (left, right) =>
        (right.socialPreference?.updatedAt.getTime() ?? 0) -
        (left.socialPreference?.updatedAt.getTime() ?? 0),
    );

  const ids = eligible.map((row) => row.id);
  const blocks = ids.length
    ? await prisma.block.findMany({
        where: { blockerId: { in: ids }, blockedId: { in: ids } },
        select: { blockerId: true, blockedId: true },
      })
    : [];
  const blockedPairs = new Set(
    blocks.flatMap((block) => [
      `${block.blockerId}:${block.blockedId}`,
      `${block.blockedId}:${block.blockerId}`,
    ]),
  );

  const selected: typeof eligible = [];
  let commonLanguages = new Set<LanguageTag>();
  for (const candidate of eligible) {
    const languages = new Set(candidate.userLanguages.map((row) => row.tag));
    if (languages.size === 0) continue;
    if (
      selected.some(
        (member) =>
          blockedPairs.has(`${member.id}:${candidate.id}`) ||
          blockedPairs.has(`${candidate.id}:${member.id}`),
      )
    ) continue;
    const nextCommon = selected.length === 0
      ? languages
      : new Set([...commonLanguages].filter((tag) => languages.has(tag)));
    if (nextCommon.size === 0) continue;
    selected.push(candidate);
    commonLanguages = nextCommon;
    if (selected.length === input.maximumMembers) break;
  }

  return selected.map((candidate) => ({
    userId: candidate.id,
    adminDisplayName: candidate.nickname?.trim() || candidate.username,
    adminAvatarUrl: candidate.avatarUrl,
    reasonCodes: ["VERIFIED", "MATCHES_INTEREST", "FITS_SOCIAL_TIME", "SHARED_LANGUAGE"],
    limitedProfile: {
      verifiedStudent: true,
      school: candidate.school,
      sharedLanguages: candidate.userLanguages
        .map((row) => row.tag)
        .filter((tag) => commonLanguages.has(tag)),
      topic: input.topic,
      meetingPreference: candidate.socialPreference?.meetingPreference,
    },
  }));
}

export async function createSmallGroupDraft(options: {
  adminUserId: string;
  input: SocialGroupDraftInput;
}) {
  const candidates = await generateSmallGroupCandidates(options.input);
  if (candidates.length < options.input.minimumMembers) {
    throw new SocialGroupError(
      "NOT_ENOUGH_CANDIDATES",
      "Not enough compatible candidates are available for review.",
    );
  }
  return prisma.socialGroupOpportunity.create({
    data: {
      topic: options.input.topic,
      title: options.input.title,
      description: options.input.description?.trim() || null,
      school: options.input.school,
      city: options.input.city,
      startAt: new Date(options.input.startAt),
      endAt: new Date(options.input.endAt),
      location: options.input.location?.trim() || null,
      minimumMembers: options.input.minimumMembers,
      maximumMembers: options.input.maximumMembers,
      responseDeadline: new Date(options.input.responseDeadline),
      status: "DRAFT",
      approvedById: options.adminUserId,
      candidates: {
        create: candidates.map((candidate) => ({
          userId: candidate.userId,
          reasonCodes: candidate.reasonCodes,
          limitedProfileSnapshot: candidate.limitedProfile,
        })),
      },
    },
    include: {
      candidates: {
        include: {
          user: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
        },
      },
    },
  });
}

export async function approveSmallGroupOpportunity(options: {
  adminUserId: string;
  opportunityId: string;
  candidateUserIds: string[];
}) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "SocialGroupOpportunity" WHERE id = ${options.opportunityId} FOR UPDATE`;
    const opportunity = await tx.socialGroupOpportunity.findUnique({
      where: { id: options.opportunityId },
      include: { candidates: true },
    });
    if (!opportunity) throw new SocialGroupError("NOT_FOUND", "Opportunity not found.");
    if (opportunity.status !== "DRAFT") {
      throw new SocialGroupError("INVALID_STATE", "Only draft opportunities can be approved.");
    }
    const available = new Set(opportunity.candidates.map((candidate) => candidate.userId));
    const selected = [...new Set(options.candidateUserIds)].filter((id) => available.has(id));
    if (
      selected.length < opportunity.minimumMembers ||
      selected.length > opportunity.maximumMembers
    ) {
      throw new SocialGroupError(
        "NOT_ENOUGH_CANDIDATES",
        "Select a valid number of reviewed candidates.",
      );
    }
    await tx.socialGroupCandidate.updateMany({
      where: { opportunityId: opportunity.id },
      data: { status: "CANDIDATE" },
    });
    await tx.socialGroupCandidate.updateMany({
      where: { opportunityId: opportunity.id, userId: { in: selected } },
      data: { status: "INVITED" },
    });
    return tx.socialGroupOpportunity.update({
      where: { id: opportunity.id },
      data: {
        status: "ACTIVE",
        approvedById: options.adminUserId,
        approvedAt: new Date(),
      },
      include: { candidates: true },
    });
  });
}

async function formGroupIfReady(
  tx: Prisma.TransactionClient,
  opportunityId: string,
) {
  await tx.$executeRaw`SELECT id FROM "SocialGroupOpportunity" WHERE id = ${opportunityId} FOR UPDATE`;
  const opportunity = await tx.socialGroupOpportunity.findUnique({
    where: { id: opportunityId },
    include: {
      candidates: {
        where: { status: "INTERESTED" },
        orderBy: [{ respondedAt: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!opportunity || opportunity.status !== "ACTIVE") return null;
  if (opportunity.responseDeadline <= new Date()) {
    await tx.socialGroupOpportunity.update({
      where: { id: opportunity.id },
      data: { status: "EXPIRED" },
    });
    return null;
  }
  if (opportunity.candidates.length < opportunity.minimumMembers) return null;
  const confirmed = opportunity.candidates.slice(0, opportunity.maximumMembers);
  const createdById = opportunity.approvedById ?? confirmed[0]!.userId;
  const group = await tx.groupChat.create({
    data: {
      title: opportunity.title,
      createdById,
      participants: {
        create: confirmed.map((candidate) => ({ userId: candidate.userId })),
      },
    },
  });
  const confirmedIds = confirmed.map((candidate) => candidate.userId);
  await tx.socialGroupCandidate.updateMany({
    where: { opportunityId: opportunity.id, userId: { in: confirmedIds } },
    data: { status: "CONFIRMED" },
  });
  await tx.calendarEntry.createMany({
    data: confirmedIds.map((userId) => ({
      userId,
      title: opportunity.title,
      eventType: planTypeForTopic(opportunity.topic),
      source: "social_group",
      location: opportunity.location,
      note: opportunity.description,
      startAt: opportunity.startAt,
      endAt: opportunity.endAt,
      socialGroupOpportunityId: opportunity.id,
    })),
    skipDuplicates: true,
  });
  await tx.socialGroupOpportunity.update({
    where: { id: opportunity.id },
    data: { status: "CONFIRMED", groupChatId: group.id },
  });
  return { opportunity, groupChatId: group.id, userIds: confirmedIds };
}

export async function respondToSmallGroupOpportunity(options: {
  userId: string;
  opportunityId: string;
  status: Extract<
    SocialGroupCandidateStatus,
    "INTERESTED" | "DECLINED" | "WITHDRAWN"
  >;
}) {
  const result = await prisma.$transaction(async (tx) => {
    const candidate = await tx.socialGroupCandidate.findFirst({
      where: {
        opportunityId: options.opportunityId,
        userId: options.userId,
        opportunity: { status: "ACTIVE", responseDeadline: { gt: new Date() } },
      },
      include: { opportunity: true },
    });
    if (!candidate) {
      throw new SocialGroupError("NOT_FOUND", "This invitation is no longer available.");
    }
    if (candidate.status === "CONFIRMED") {
      throw new SocialGroupError("INVALID_STATE", "The group has already been formed.");
    }
    const updated = await tx.socialGroupCandidate.update({
      where: { id: candidate.id },
      data: { status: options.status, respondedAt: new Date() },
    });
    const formed = options.status === "INTERESTED"
      ? await formGroupIfReady(tx, options.opportunityId)
      : null;
    return { candidate: updated, formed };
  });
  if (result.formed) {
    await Promise.all(
      result.formed.userIds.map((userId) =>
        notifyUserPush(userId, {
          title: "Your small group is ready",
          body: result.formed!.opportunity.title,
          url: `/groups/${result.formed!.groupChatId}`,
          threadId: `group:${result.formed!.groupChatId}`,
          data: {
            kind: "group_message",
            groupChatId: result.formed!.groupChatId,
          },
        }),
      ),
    );
  }
  return {
    status: result.candidate.status,
    groupChatId: result.formed?.groupChatId ?? null,
  };
}

export async function listSmallGroupInvitations(userId: string) {
  const now = new Date();
  const candidates = await prisma.socialGroupCandidate.findMany({
    where: {
      userId,
      status: { in: ["INVITED", "INTERESTED", "CONFIRMED"] },
      opportunity: {
        OR: [
          { status: "ACTIVE", responseDeadline: { gt: now } },
          { status: "CONFIRMED" },
        ],
      },
    },
    include: { opportunity: true },
    orderBy: { createdAt: "desc" },
  });
  return candidates.map((candidate) => ({
    id: candidate.opportunity.id,
    topic: candidate.opportunity.topic,
    title: candidate.opportunity.title,
    description: candidate.opportunity.description,
    startAt: candidate.opportunity.startAt.toISOString(),
    endAt: candidate.opportunity.endAt.toISOString(),
    location: candidate.opportunity.location,
    responseDeadline: candidate.opportunity.responseDeadline.toISOString(),
    status: candidate.opportunity.status,
    responseStatus: candidate.status,
    limitedSignals: candidate.limitedProfileSnapshot,
    groupChatId: candidate.opportunity.groupChatId,
  }));
}

export async function recordSmallGroupOutcome(options: {
  userId: string;
  opportunityId: string;
  value: PlanOutcomeValue;
}) {
  const candidate = await prisma.socialGroupCandidate.findFirst({
    where: {
      userId: options.userId,
      opportunityId: options.opportunityId,
      status: "CONFIRMED",
      opportunity: { status: "CONFIRMED", endAt: { lte: new Date() } },
    },
  });
  if (!candidate) {
    throw new SocialGroupError(
      "INVALID_STATE",
      "Outcome feedback is available after your group plan ends.",
    );
  }
  const response = await prisma.socialGroupOutcomeResponse.upsert({
    where: {
      opportunityId_userId: {
        opportunityId: options.opportunityId,
        userId: options.userId,
      },
    },
    create: {
      opportunityId: options.opportunityId,
      userId: options.userId,
      value: options.value,
    },
    update: { value: options.value },
  });
  return { value: response.value, updatedAt: response.updatedAt.toISOString() };
}

export async function expireSmallGroupOpportunities(now = new Date()) {
  const result = await prisma.socialGroupOpportunity.updateMany({
    where: { status: "ACTIVE", responseDeadline: { lte: now } },
    data: { status: "EXPIRED" },
  });
  return { expired: result.count };
}
