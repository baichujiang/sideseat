import "server-only";

import { ConnectionStatus, MessageType } from "@prisma/client";

import { directMessageV1, directMessageV1Include } from "@/lib/api/v1/chat-dto";
import { prisma } from "@/lib/db/prisma";
import { rangeFitsScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";
import { publicErrorForScheduleShareConnection } from "@/lib/schedule-share/connection-errors";
import { submitScheduleSharePlanProposal } from "@/lib/schedule-share/create-plan-from-guest-proposal";
import { buildDefaultScheduleShareCreatePayload } from "@/lib/schedule-share/default-create-payload";
import {
  createScheduleShareLinkForUser,
  type CreateScheduleShareInput,
} from "@/lib/schedule-share/create-schedule-share-link-server";
import { assertScheduleShareChatPreviewAccess } from "@/lib/schedule-share/chat-preview-access";
import { loadInitialViewerProposalForShareLink } from "@/lib/schedule-share/load-initial-viewer-proposal";
import { loadScheduleShareRecipientPage } from "@/lib/schedule-share/load-recipient-page";
import {
  buildOwnerPreviewSnapshotForLink,
  persistScheduleShareLinkUpdate,
} from "@/lib/schedule-share/persist-schedule-share-link";
import {
  PUBLIC_SCHEDULE_LINK_UNAVAILABLE,
  PUBLIC_SCHEDULE_RATE_LIMIT,
  PUBLIC_SCHEDULE_TIME_UNAVAILABLE,
} from "@/lib/schedule-share/public-errors";
import { buildPublicScheduleShareSnapshotForActiveLink } from "@/lib/schedule-share/public-snapshot";
import { scheduleShareProposerDisplayName } from "@/lib/schedule-share/proposer-display-name";
import { scheduleNewDirectChatMessageNotification } from "@/lib/push/notify-user";
import { assertScheduleShareProposalRateLimit } from "@/lib/schedule-share/rate-limit";
import { parseRevealConfigJson } from "@/lib/schedule-share/reveal-config";
import { findScheduleShareLinkByPlainToken } from "@/lib/schedule-share/resolve-link";
import { plainTokenFromScheduleShareRecipientUrl } from "@/lib/schedule-share/share-link-urls";
import { consumeScheduleShareLinkForVisitor } from "@/lib/schedule-share/usage-limit";

export class ScheduleShareServiceError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "FORBIDDEN" | "INVALID_REQUEST" | "CONFLICT" | "RATE_LIMITED",
    readonly messageText: string,
  ) {
    super(messageText);
    this.name = "ScheduleShareServiceError";
  }
}

export async function createStandaloneScheduleShare(options: {
  userId: string;
  appOrigin: string;
  input: CreateScheduleShareInput;
}) {
  try {
    const created = await createScheduleShareLinkForUser(prisma, {
      ownerUserId: options.userId,
      input: options.input,
      appOrigin: options.appOrigin,
    });
    return {
      ...created,
      token: plainTokenFromScheduleShareRecipientUrl(created.shareUrl),
    };
  } catch (cause) {
    if (cause instanceof Error) {
      if (cause.message === "INVALID_CATEGORIES") {
        throw new ScheduleShareServiceError(
          "INVALID_REQUEST",
          "One or more calendar categories are invalid.",
        );
      }
      if (cause.message === "EXPIRY_PAST") {
        throw new ScheduleShareServiceError(
          "INVALID_REQUEST",
          "Expiry must be in the future.",
        );
      }
    }
    throw cause;
  }
}

export async function createAndSendScheduleShare(options: {
  userId: string;
  connectionId: string;
  appOrigin: string;
  input?: CreateScheduleShareInput | null;
}) {
  const connection = await prisma.connection.findFirst({
    where: {
      id: options.connectionId,
      status: ConnectionStatus.ACTIVE,
      OR: [{ userAId: options.userId }, { userBId: options.userId }],
    },
    select: { id: true },
  });
  if (!connection) {
    throw new ScheduleShareServiceError("NOT_FOUND", "Conversation not found.");
  }

  const created = await createStandaloneScheduleShare({
    userId: options.userId,
    appOrigin: options.appOrigin,
    input: options.input ?? buildDefaultScheduleShareCreatePayload(),
  });
  const { shareUrl, linkId, token } = created;

  const message = await prisma.message.create({
    data: {
      connectionId: options.connectionId,
      senderId: options.userId,
      body: shareUrl,
      type: MessageType.SCHEDULE_SHARE_CARD,
    },
    include: directMessageV1Include,
  });

  scheduleNewDirectChatMessageNotification({
    connectionId: options.connectionId,
    senderId: options.userId,
    bodyPreview: "Shared schedule",
  });

  return {
    shareUrl,
    token,
    linkId,
    message: directMessageV1(message),
  };
}

export async function getScheduleShareChatPreview(options: {
  userId: string;
  token: string;
}) {
  const access = await assertScheduleShareChatPreviewAccess(
    prisma,
    options.token,
    options.userId,
  );
  if (!access.ok) {
    if (access.reason === "forbidden") {
      throw new ScheduleShareServiceError(
        "FORBIDDEN",
        "Not allowed to preview this schedule.",
      );
    }
    throw new ScheduleShareServiceError(
      "NOT_FOUND",
      "Schedule link unavailable.",
    );
  }

  const snapshot = await buildPublicScheduleShareSnapshotForActiveLink(
    prisma,
    access.link,
  );

  return {
    snapshot,
    expired: access.expired,
    ownerDisplayLabel: snapshot.ownerDisplayLabel,
    linkId: access.link.id,
    ownedByViewer: access.link.ownerUserId === options.userId,
    updatedAt: access.link.updatedAt.toISOString(),
    isUpdated: isScheduleShareUpdated(access.link),
  };
}

async function requireEditableScheduleShareOwnerLink(options: {
  userId: string;
  linkId: string;
}) {
  const link = await prisma.scheduleShareLink.findFirst({
    where: { id: options.linkId, ownerUserId: options.userId },
    include: { owner: true },
  });
  if (!link) {
    throw new ScheduleShareServiceError("NOT_FOUND", "Schedule link unavailable.");
  }

  const unavailable =
    link.revokedAt !== null ||
    link.expiresAt.getTime() <= Date.now() ||
    (link.usageLimit === "SINGLE_USE" && link.consumedAt !== null);
  if (unavailable) {
    throw new ScheduleShareServiceError(
      "CONFLICT",
      "This schedule share can no longer be edited.",
    );
  }
  return link;
}

function isScheduleShareUpdated(link: { createdAt: Date; updatedAt: Date }) {
  return link.updatedAt.getTime() > link.createdAt.getTime();
}

async function scheduleSharePendingProposalCount(linkId: string) {
  return prisma.planRequest.count({
    where: { scheduleShareLinkId: linkId, status: "PENDING" },
  });
}

async function scheduleShareOwnerPayload(
  link: Awaited<ReturnType<typeof requireEditableScheduleShareOwnerLink>>,
) {
  const [snapshot, pendingProposalCount] = await Promise.all([
    buildOwnerPreviewSnapshotForLink(prisma, link),
    scheduleSharePendingProposalCount(link.id),
  ]);
  return {
    snapshot,
    settings: {
      rangeStart: link.rangeStart.toISOString(),
      rangeEnd: link.rangeEnd.toISOString(),
      revealConfig: parseRevealConfigJson(link.revealConfig),
      allowGuestProposals: link.allowGuestProposals,
      usageLimit: link.usageLimit,
      expiresAt: link.expiresAt.toISOString(),
    },
    linkId: link.id,
    pendingProposalCount,
    updatedAt: link.updatedAt.toISOString(),
    isUpdated: isScheduleShareUpdated(link),
  };
}

export async function getScheduleShareOwner(options: {
  userId: string;
  linkId: string;
}) {
  const link = await requireEditableScheduleShareOwnerLink(options);
  return scheduleShareOwnerPayload(link);
}

export async function updateScheduleShare(options: {
  userId: string;
  linkId: string;
  input: unknown;
}) {
  const link = await requireEditableScheduleShareOwnerLink(options);
  const updated = await persistScheduleShareLinkUpdate(
    prisma,
    link,
    options.userId,
    options.input,
  );
  if (!updated.ok) {
    throw new ScheduleShareServiceError(
      "INVALID_REQUEST",
      updated.error,
    );
  }
  return scheduleShareOwnerPayload(updated.link);
}

export async function revokeScheduleShare(options: { userId: string; linkId: string }) {
  const link = await prisma.scheduleShareLink.findFirst({
    where: { id: options.linkId, ownerUserId: options.userId },
    select: { id: true, revokedAt: true },
  });
  if (!link) {
    throw new ScheduleShareServiceError("NOT_FOUND", "Schedule link unavailable.");
  }

  const revokedAt = link.revokedAt ?? new Date();
  if (!link.revokedAt) {
    await prisma.scheduleShareLink.update({
      where: { id: link.id },
      data: { revokedAt },
    });
  }
  return { linkId: link.id, revokedAt: revokedAt.toISOString() };
}

export async function getScheduleShareRecipientView(options: {
  userId: string;
  token: string;
}) {
  const page = await loadScheduleShareRecipientPage(prisma, options.token, {
    viewerUserId: options.userId,
  });
  if (!page.ok) {
    throw new ScheduleShareServiceError(
      "NOT_FOUND",
      PUBLIC_SCHEDULE_LINK_UNAVAILABLE,
    );
  }

  const proposal = await loadInitialViewerProposalForShareLink(
    prisma,
    page.resolved.link.id,
    options.userId,
  );

  return {
    snapshot: page.snapshot,
    proposal,
    allowGuestProposals: page.resolved.link.allowGuestProposals,
    linkId: page.resolved.link.id,
    ownedByViewer: page.resolved.link.ownerUserId === options.userId,
    updatedAt: page.resolved.link.updatedAt.toISOString(),
    isUpdated: isScheduleShareUpdated(page.resolved.link),
  };
}

export async function getScheduleShareMyProposal(options: {
  userId: string;
  token: string;
}) {
  const resolved = await findScheduleShareLinkByPlainToken(prisma, options.token, {
    viewerUserId: options.userId,
  });
  if (!resolved.ok) {
    throw new ScheduleShareServiceError(
      "NOT_FOUND",
      PUBLIC_SCHEDULE_LINK_UNAVAILABLE,
    );
  }
  const proposal = await loadInitialViewerProposalForShareLink(
    prisma,
    resolved.link.id,
    options.userId,
  );
  return { proposal };
}

export async function submitScheduleShareRecipientProposal(options: {
  userId: string;
  username: string;
  nickname: string | null;
  token: string;
  title: string;
  note?: string | null;
  location?: string | null;
  startTime: string;
  endTime: string;
  ipFingerprint: string;
  userAgent: string;
}) {
  const resolved = await findScheduleShareLinkByPlainToken(prisma, options.token, {
    viewerUserId: options.userId,
  });
  if (!resolved.ok) {
    throw new ScheduleShareServiceError(
      "NOT_FOUND",
      PUBLIC_SCHEDULE_LINK_UNAVAILABLE,
    );
  }

  const link = resolved.link;
  const consumed = await consumeScheduleShareLinkForVisitor(
    prisma,
    link,
    options.userId,
  );
  if (!consumed) {
    throw new ScheduleShareServiceError(
      "NOT_FOUND",
      PUBLIC_SCHEDULE_LINK_UNAVAILABLE,
    );
  }
  if (!link.allowGuestProposals) {
    throw new ScheduleShareServiceError(
      "FORBIDDEN",
      "Guest proposals are disabled for this link.",
    );
  }

  const startTime = new Date(options.startTime);
  const endTime = new Date(options.endTime);
  if (
    startTime.getTime() < link.rangeStart.getTime() ||
    endTime.getTime() > link.rangeEnd.getTime()
  ) {
    throw new ScheduleShareServiceError(
      "INVALID_REQUEST",
      "Proposal times must fall within the shared schedule range.",
    );
  }

  const reveal = parseRevealConfigJson(link.revealConfig);
  const fits = await rangeFitsScheduleShareSnapshot(prisma, {
    ownerUserId: link.ownerUserId,
    rangeStart: link.rangeStart,
    rangeEnd: link.rangeEnd,
    proposalStart: startTime,
    proposalEnd: endTime,
    includedDates: reveal.includedDates,
    availabilityStartMinutes: reveal.availabilityStartMinutes,
    availabilityEndMinutes: reveal.availabilityEndMinutes,
  });
  if (!fits) {
    throw new ScheduleShareServiceError(
      "CONFLICT",
      PUBLIC_SCHEDULE_TIME_UNAVAILABLE,
    );
  }

  const rate = await assertScheduleShareProposalRateLimit(
    prisma,
    link.id,
    options.ipFingerprint,
  );
  if (!rate.ok) {
    throw new ScheduleShareServiceError("RATE_LIMITED", PUBLIC_SCHEDULE_RATE_LIMIT);
  }

  const result = await submitScheduleSharePlanProposal(prisma, {
    scheduleShareLinkId: link.id,
    ownerUserId: link.ownerUserId,
    proposerUserId: options.userId,
    title: options.title.trim(),
    note: options.note?.trim() || null,
    location: options.location?.trim() || null,
    startTime,
    endTime,
    guestDisplayName: scheduleShareProposerDisplayName({
      username: options.username,
      nickname: options.nickname,
    }),
    createdFromIp: options.ipFingerprint,
    userAgent: options.userAgent,
  });

  if (!result.ok) {
    const err = publicErrorForScheduleShareConnection(result.reason);
    if (err.status === 409) {
      throw new ScheduleShareServiceError("CONFLICT", err.message);
    }
    if (err.status === 403) {
      throw new ScheduleShareServiceError("FORBIDDEN", err.message);
    }
    throw new ScheduleShareServiceError("INVALID_REQUEST", err.message);
  }

  return {
    submitted: true as const,
    updated: result.updated,
    proposal: result.proposal,
  };
}

export function mapScheduleShareError(cause: ScheduleShareServiceError): {
  code: "NOT_FOUND" | "CONTENT_RESTRICTED" | "INVALID_REQUEST" | "RATE_LIMITED";
  status: number;
  message: string;
  retryable?: boolean;
} {
  if (cause.code === "NOT_FOUND") {
    return { code: "NOT_FOUND", status: 404, message: cause.messageText };
  }
  if (cause.code === "FORBIDDEN") {
    return {
      code: "CONTENT_RESTRICTED",
      status: 403,
      message: cause.messageText,
    };
  }
  if (cause.code === "CONFLICT") {
    return { code: "INVALID_REQUEST", status: 409, message: cause.messageText };
  }
  if (cause.code === "RATE_LIMITED") {
    return {
      code: "RATE_LIMITED",
      status: 429,
      message: cause.messageText,
      retryable: true,
    };
  }
  return { code: "INVALID_REQUEST", status: 422, message: cause.messageText };
}
