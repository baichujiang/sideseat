import type { User } from "@prisma/client";

import { selfNotesDisplayTitle } from "@/lib/connections/self-notes-title";
import { courseChatHeadline } from "@/lib/courses/course-code-label";
import { groupChatDisplayTitle } from "@/lib/group-chats/title";
import type { InboxMerged } from "@/lib/queries/inbox-merge";
import { isConnectionPinned } from "@/lib/queries/inbox-order";

type InboxAuthor = Pick<User, "id" | "username" | "nickname" | "avatarUrl">;

function inboxAuthor(user: InboxAuthor) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
  };
}

export function inboxConversationV1(item: InboxMerged, viewerId: string) {
  if (item.kind === "direct") {
    const { connection } = item;
    const selfNotes = connection.userAId === connection.userBId;
    const peer = connection.userAId === viewerId ? connection.userB : connection.userA;
    const remark =
      connection.userAId === viewerId
        ? connection.contactRemarkByA
        : connection.contactRemarkByB;
    const last = connection.messages[0];

    return {
      kind: "DIRECT" as const,
      id: connection.id,
      displayName: selfNotes
        ? selfNotesDisplayTitle(peer, remark)
        : remark?.trim() || peer.nickname?.trim() || peer.username,
      avatarUrl: peer.avatarUrl,
      participantAvatars: [peer.avatarUrl].filter((value): value is string => Boolean(value)),
      unreadCount: item.unreadCount,
      pinned: isConnectionPinned(connection, viewerId),
      lastActivityAt: item.sortAt.toISOString(),
      peer: inboxAuthor(peer),
      isSelfNotes: selfNotes,
      course: null,
      group: null,
      lastMessage: last
        ? {
            id: last.id,
            sender: inboxAuthor(last.sender),
            type: last.type,
            body: last.deletedAt ? null : last.body,
            imageUrl: last.deletedAt ? null : last.imageUrl,
            deletedAt: last.deletedAt?.toISOString() ?? null,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
    };
  }

  if (item.kind === "course") {
    const last = item.last;
    return {
      kind: "COURSE" as const,
      id: item.course.id,
      displayName: courseChatHeadline(item.course.name, item.course.code),
      avatarUrl: null,
      participantAvatars: [],
      unreadCount: item.unreadCount,
      pinned: Boolean(item.userCourse.inboxPinnedAt),
      lastActivityAt: item.sortAt.toISOString(),
      peer: null,
      isSelfNotes: false,
      course: {
        id: item.course.id,
        name: item.course.name,
        code: item.course.code,
        school: item.course.school,
        semesterLabel: item.course.semesterLabel,
      },
      group: null,
      lastMessage: last
        ? {
            id: last.id,
            sender: inboxAuthor(last.sender),
            type: "TEXT" as const,
            body: last.deletedAt ? null : last.body,
            imageUrl: null,
            deletedAt: last.deletedAt?.toISOString() ?? null,
            createdAt: last.createdAt.toISOString(),
          }
        : null,
    };
  }

  const last = item.last;
  const participants = item.groupChat.participants.map((participant) => participant.user);
  return {
    kind: "GROUP" as const,
    id: item.groupChat.id,
    displayName: groupChatDisplayTitle(item.groupChat.title, participants, viewerId),
    avatarUrl: null,
    participantAvatars: participants
      .filter((participant) => participant.id !== viewerId)
      .map((participant) => participant.avatarUrl)
      .filter((value): value is string => Boolean(value))
      .slice(0, 9),
    unreadCount: item.unreadCount,
    pinned: Boolean(item.inboxPinnedAt),
    lastActivityAt: item.sortAt.toISOString(),
    peer: null,
    isSelfNotes: false,
    course: null,
    group: {
      id: item.groupChat.id,
      participantCount: participants.length,
      participants: participants.map(inboxAuthor),
    },
    lastMessage: last
      ? {
          id: last.id,
          sender: inboxAuthor(last.sender),
          // Group messages are text-only today; keep explicit TEXT for the inbox contract.
          type: "TEXT" as const,
          body: last.deletedAt ? null : last.body,
          imageUrl: null,
          deletedAt: last.deletedAt?.toISOString() ?? null,
          createdAt: last.createdAt.toISOString(),
        }
      : null,
  };
}
