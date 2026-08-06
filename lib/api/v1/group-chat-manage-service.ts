import "server-only";

import { GROUP_CHAT_MAX_MEMBERS } from "@/lib/group-chats/constants";
import { activeContactPeerIdsForViewer } from "@/lib/group-chats/contact-gate";
import { prisma } from "@/lib/db/prisma";

export class GroupChatManageError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "INVALID_REQUEST" | "CONTENT_RESTRICTED",
    readonly messageText: string,
  ) {
    super(messageText);
    this.name = "GroupChatManageError";
  }
}

export async function createGroupChat(options: {
  userId: string;
  title?: string | null;
  participantIds: string[];
}): Promise<{ groupChatId: string }> {
  const participantIds = [
    ...new Set(options.participantIds.filter((id) => id !== options.userId)),
  ];
  if (participantIds.length < 2) {
    throw new GroupChatManageError(
      "INVALID_REQUEST",
      "Choose at least two contacts.",
    );
  }
  if (participantIds.length + 1 > GROUP_CHAT_MAX_MEMBERS) {
    throw new GroupChatManageError(
      "INVALID_REQUEST",
      `This group can have at most ${GROUP_CHAT_MAX_MEMBERS} members.`,
    );
  }

  const reachable = await activeContactPeerIdsForViewer(
    options.userId,
    participantIds,
  );
  if (participantIds.some((peerId) => !reachable.has(peerId))) {
    throw new GroupChatManageError(
      "CONTENT_RESTRICTED",
      "Only existing contacts can be added to a group chat.",
    );
  }

  const title = options.title?.trim() || null;
  const groupChat = await prisma.groupChat.create({
    data: {
      title,
      createdById: options.userId,
      participants: {
        create: [
          { userId: options.userId, lastReadAt: new Date() },
          ...participantIds.map((participantId) => ({ userId: participantId })),
        ],
      },
    },
    select: { id: true },
  });
  return { groupChatId: groupChat.id };
}

export async function patchGroupChatTitle(options: {
  userId: string;
  groupChatId: string;
  title: string;
}): Promise<{ title: string | null }> {
  const membership = await prisma.groupChatParticipant.findUnique({
    where: {
      groupChatId_userId: {
        groupChatId: options.groupChatId,
        userId: options.userId,
      },
    },
    select: { groupChatId: true },
  });
  if (!membership) throw new GroupChatManageError("NOT_FOUND", "Group not found.");

  const title = options.title.trim() === "" ? null : options.title.trim();
  const updated = await prisma.groupChat.update({
    where: { id: options.groupChatId },
    data: { title },
    select: { title: true },
  });
  return { title: updated.title };
}

export async function addGroupChatParticipants(options: {
  userId: string;
  groupChatId: string;
  participantIds: string[];
}): Promise<{ addedUserIds: string[]; memberCount: number }> {
  const membership = await prisma.groupChatParticipant.findMany({
    where: { groupChatId: options.groupChatId },
    select: { userId: true },
  });
  if (!membership.some((row) => row.userId === options.userId)) {
    throw new GroupChatManageError("NOT_FOUND", "Group not found.");
  }

  const existing = new Set(membership.map((row) => row.userId));
  const toAdd = [
    ...new Set(
      options.participantIds.filter(
        (id) => id !== options.userId && !existing.has(id),
      ),
    ),
  ];
  if (toAdd.length === 0) {
    throw new GroupChatManageError(
      "INVALID_REQUEST",
      "Everyone you selected is already in this group.",
    );
  }
  if (existing.size + toAdd.length > GROUP_CHAT_MAX_MEMBERS) {
    throw new GroupChatManageError(
      "INVALID_REQUEST",
      `This group can have at most ${GROUP_CHAT_MAX_MEMBERS} members.`,
    );
  }

  const reachable = await activeContactPeerIdsForViewer(options.userId, toAdd);
  if (toAdd.some((peerId) => !reachable.has(peerId))) {
    throw new GroupChatManageError(
      "CONTENT_RESTRICTED",
      "Only existing contacts can be added to a group chat.",
    );
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.groupChatParticipant.createMany({
      data: toAdd.map((userId) => ({
        groupChatId: options.groupChatId,
        userId,
      })),
      skipDuplicates: true,
    }),
    prisma.groupChat.update({
      where: { id: options.groupChatId },
      data: { updatedAt: now },
    }),
  ]);

  return {
    addedUserIds: toAdd,
    memberCount: existing.size + toAdd.length,
  };
}
