import "server-only";

import {
  ClassmatePostClosureReason,
  ClassmatePostStatus,
  DiscoverActivityStatus,
  ConnectionStatus,
  Prisma,
  type User,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getClassmatePostDetailForViewer } from "@/lib/queries/classmate-post-detail";
import {
  DiscoverActivitySignupError,
  setDiscoverActivitySignup,
} from "@/lib/discover/discover-activity-signup-service";
import {
  canCancelActivity,
  canClose,
} from "@/lib/discover/discover-activity-state";
import { viewerFromUser } from "@/lib/discover/discover-activity-server";
import type { DiscoverActivityRow } from "@/lib/discover/discover-activity-row";
import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";
import { loadActiveDiscoverActivitiesForCity } from "@/lib/discover/load-active-discover-activities-for-city";
import { loadActiveDiscoverPostsForCity } from "@/lib/discover/load-active-discover-posts";
import {
  discoverActivityForFeedInclude,
  prismaDiscoverActivityToRow,
} from "@/lib/discover/prisma-discover-activity-for-discover";
import {
  classmatePostForDiscoverInclude,
  prismaClassmatePostToDiscoverRow,
} from "@/lib/discover/prisma-classmate-post-for-discover";

function postMatchesQuery(post: DiscoverPostRow, query: string) {
  if (!query) return true;
  return [
    post.title,
    post.body ?? "",
    ...post.tags,
    post.nickname,
    post.tagline ?? "",
    post.major ?? "",
    ...(post.linkedCourses?.flatMap((course) => [
      course.code ?? "",
      course.name,
    ]) ?? []),
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

function activityMatchesQuery(activity: DiscoverActivityRow, query: string) {
  if (!query) return true;
  return [
    activity.title,
    activity.description ?? "",
    activity.location,
    activity.organizerNickname,
  ]
    .join(" ")
    .toLocaleLowerCase()
    .includes(query);
}

export function toNativeDiscoverPost(row: DiscoverPostRow) {
  return {
    id: row.id,
    category: row.category,
    city: row.city,
    title: row.title,
    body: row.body,
    status: row.status,
    closureReason: row.closureReason,
    closedAt: row.closedAt?.toISOString() ?? null,
    tags: row.tags,
    visibility: row.visibility,
    replyPreference: row.replyPreference,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    location: row.location,
    capacity: row.capacity,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    isOwn: row.isOwn,
    savedByViewer: row.savedByViewer ?? false,
    interestedCount: row.interestedCount ?? 0,
    imageUrls: row.imageUrls ?? [],
    linkedCourses: row.linkedCourses ?? [],
    author: {
      id: row.userId,
      displayName: row.nickname,
      tagline: row.tagline,
      avatarUrl: row.avatarUrl,
      major: row.major,
      semester: row.semester,
      studentStatus: row.studentStatus,
      graduationYear: row.graduationYear,
      school: row.school,
      verifiedStudent: row.verifiedStudent,
    },
  };
}

export function toNativeDiscoverActivity(row: DiscoverActivityRow) {
  return {
    id: row.id,
    city: row.city,
    school: row.school,
    title: row.title,
    description: row.description,
    category: row.category,
    startAt: row.startAtISO,
    endAt: row.endAtISO,
    location: row.location,
    capacity: row.capacity,
    status: row.status,
    phase: row.phase,
    goingCount: row.goingCount,
    viewerSignupStatus: row.viewerSignupStatus,
    isOrganizer: row.isOrganizer,
    organizer: {
      id: row.organizerId,
      displayName: row.organizerNickname,
      avatarUrl: row.organizerAvatarUrl,
    },
  };
}

export async function loadNativeDiscoverPostDetail(options: {
  userId: string;
  postId: string;
}) {
  const [detail, saved] = await Promise.all([
    getClassmatePostDetailForViewer(options.postId, options.userId),
    prisma.classmatePostSave.findUnique({
      where: {
        userId_classmatePostId: {
          userId: options.userId,
          classmatePostId: options.postId,
        },
      },
      select: { id: true },
    }),
  ]);
  if (!detail.ok) return null;
  const { post, author, isAuthor, viewerCanMessage } = detail;
  return {
    post: {
      id: post.id,
      category: post.category,
      city: post.city,
      title: post.title,
      body: post.body,
      status: post.status,
      closureReason: post.closureReason,
      closedAt: post.closedAt?.toISOString() ?? null,
      tags: post.tags,
      visibility: post.visibility,
      replyPreference: post.replyPreference,
      startsAt: post.startsAt?.toISOString() ?? null,
      endsAt: post.endsAt?.toISOString() ?? null,
      location: post.location,
      capacity: post.capacity,
      createdAt: post.createdAt.toISOString(),
      expiresAt: post.expiresAt.toISOString(),
      isOwn: isAuthor,
      savedByViewer: Boolean(saved),
      interestedCount: post.interestedCount,
      imageUrls: post.imageUrls,
      linkedCourses: post.linkedCourses,
      author: {
        id: author.id,
        displayName: author.nickname?.trim() || author.username,
        tagline: null,
        avatarUrl: author.avatarUrl,
        major: author.major,
        semester: author.semester,
        studentStatus: author.studentStatus,
        graduationYear: author.graduationYear,
        school: author.school,
        verifiedStudent: author.verifiedStudent,
      },
    },
    viewerCanMessage,
  };
}

export async function setNativeDiscoverPostSaved(options: {
  userId: string;
  postId: string;
  saved: boolean;
  tx: Prisma.TransactionClient;
}) {
  const detail = await getClassmatePostDetailForViewer(
    options.postId,
    options.userId,
  );
  if (!detail.ok) return null;

  if (options.saved) {
    await options.tx.classmatePostSave.upsert({
      where: {
        userId_classmatePostId: {
          userId: options.userId,
          classmatePostId: options.postId,
        },
      },
      create: { userId: options.userId, classmatePostId: options.postId },
      update: {},
    });
  } else {
    await options.tx.classmatePostSave.deleteMany({
      where: { userId: options.userId, classmatePostId: options.postId },
    });
  }

  const interestedCount = await options.tx.classmatePostSave.count({
    where: { classmatePostId: options.postId },
  });
  return {
    postId: options.postId,
    savedByViewer: options.saved,
    interestedCount,
  };
}

export async function loadNativeDiscoverActivityDetail(options: {
  userId: string;
  activityId: string;
}) {
  const now = new Date();
  const activity = await prisma.discoverActivity.findUnique({
    where: { id: options.activityId },
    include: {
      ...discoverActivityForFeedInclude,
      signups: {
        where: { status: "GOING" },
        select: {
          userId: true,
          status: true,
          user: {
            select: {
              id: true,
              nickname: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      },
      calendarEntries: {
        where: { userId: options.userId },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!activity) return null;

  const isOrganizer = activity.organizerId === options.userId;
  const hidden =
    !isOrganizer &&
    (activity.organizer.moderationBlocks.length > 0 ||
      (await prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: options.userId, blockedId: activity.organizerId },
            { blockerId: activity.organizerId, blockedId: options.userId },
          ],
        },
        select: { id: true },
      })));
  if (hidden) return null;

  const row = prismaDiscoverActivityToRow(activity, options.userId, now);
  const viewerHasExistingChat = !isOrganizer
    ? Boolean(
        await prisma.connection.findFirst({
          where: {
            status: ConnectionStatus.ACTIVE,
            OR: [
              { userAId: options.userId, userBId: activity.organizerId },
              { userBId: options.userId, userAId: activity.organizerId },
            ],
          },
          select: { id: true },
        }),
      )
    : false;

  return {
    activity: toNativeDiscoverActivity(row),
    goingAttendees: activity.signups.map((signup) => ({
      userId: signup.user.id,
      displayName: signup.user.nickname?.trim() || signup.user.username,
      avatarUrl: signup.user.avatarUrl,
    })),
    viewerHasExistingChat,
    calendarEntryId: activity.calendarEntries[0]?.id ?? null,
  };
}

export async function setNativeDiscoverActivitySignup(options: {
  user: User;
  activityId: string;
  going: boolean;
  tx: Prisma.TransactionClient;
}) {
  const result = await setDiscoverActivitySignup(
    options.user,
    options.activityId,
    options.going,
    options.tx,
  );
  if (!result.activity) {
    const fresh = await options.tx.discoverActivity.findUnique({
      where: { id: options.activityId },
      include: discoverActivityForFeedInclude,
    });
    if (!fresh) throw new DiscoverActivitySignupError("NOT_FOUND");
    return toNativeDiscoverActivity(
      prismaDiscoverActivityToRow(fresh, options.user.id, new Date()),
    );
  }
  return toNativeDiscoverActivity(result.activity);
}

export class NativeDiscoverActivityStatusError extends Error {
  constructor(readonly code: "NOT_FOUND" | "ORGANIZER_ONLY") {
    super(code);
    this.name = "NativeDiscoverActivityStatusError";
  }
}

export class NativeDiscoverPostStatusError extends Error {
  constructor(readonly code: "NOT_FOUND" | "AUTHOR_ONLY") {
    super(code);
    this.name = "NativeDiscoverPostStatusError";
  }
}

export class NativeDiscoverActivityCalendarError extends Error {
  constructor(readonly code: "NOT_FOUND") {
    super(code);
    this.name = "NativeDiscoverActivityCalendarError";
  }
}

export async function addNativeDiscoverActivityToCalendar(options: {
  userId: string;
  activityId: string;
  tx?: Prisma.TransactionClient;
}): Promise<{ calendarEntryId: string; created: boolean }> {
  const db = options.tx ?? prisma;
  const activity = await db.discoverActivity.findUnique({
    where: { id: options.activityId },
    select: {
      id: true,
      title: true,
      location: true,
      startAt: true,
      endAt: true,
    },
  });
  if (!activity) throw new NativeDiscoverActivityCalendarError("NOT_FOUND");

  const existing = await db.calendarEntry.findFirst({
    where: {
      userId: options.userId,
      discoverActivityId: activity.id,
    },
    select: { id: true },
  });
  if (existing) {
    return { calendarEntryId: existing.id, created: false };
  }

  try {
    const entry = await db.calendarEntry.create({
      data: {
        userId: options.userId,
        discoverActivityId: activity.id,
        title: activity.title,
        location: activity.location,
        startAt: activity.startAt,
        endAt: activity.endAt,
        source: "discover_activity",
      },
      select: { id: true },
    });
    return { calendarEntryId: entry.id, created: true };
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      const raced = await db.calendarEntry.findFirst({
        where: {
          userId: options.userId,
          discoverActivityId: activity.id,
        },
        select: { id: true },
      });
      if (raced) {
        return { calendarEntryId: raced.id, created: false };
      }
    }
    throw cause;
  }
}

export async function setNativeDiscoverActivityStatus(options: {
  user: User;
  activityId: string;
  status: "CLOSED" | "CANCELED";
  tx: Prisma.TransactionClient;
}) {
  await options.tx
    .$executeRaw`SELECT id FROM "DiscoverActivity" WHERE id = ${options.activityId} FOR UPDATE`;
  const activity = await options.tx.discoverActivity.findUnique({
    where: { id: options.activityId },
  });
  if (!activity) throw new NativeDiscoverActivityStatusError("NOT_FOUND");

  const viewer = viewerFromUser(options.user);
  const now = new Date();
  const allowed =
    options.status === "CLOSED"
      ? canClose(viewer, activity, now)
      : canCancelActivity(viewer, activity, now);
  if (!allowed) throw new NativeDiscoverActivityStatusError("ORGANIZER_ONLY");

  const updated = await options.tx.discoverActivity.update({
    where: { id: options.activityId },
    data: {
      status:
        options.status === "CLOSED"
          ? DiscoverActivityStatus.CLOSED
          : DiscoverActivityStatus.CANCELED,
    },
    include: discoverActivityForFeedInclude,
  });

  return toNativeDiscoverActivity(
    prismaDiscoverActivityToRow(updated, options.user.id, now),
  );
}

export async function setNativeDiscoverPostStatus(options: {
  userId: string;
  postId: string;
  status: "CLOSED";
  tx: Prisma.TransactionClient;
}) {
  await options.tx
    .$executeRaw`SELECT id FROM "ClassmatePost" WHERE id = ${options.postId} FOR UPDATE`;
  const post = await options.tx.classmatePost.findUnique({
    where: { id: options.postId },
    include: classmatePostForDiscoverInclude,
  });
  if (!post) throw new NativeDiscoverPostStatusError("NOT_FOUND");
  if (post.userId !== options.userId) {
    throw new NativeDiscoverPostStatusError("AUTHOR_ONLY");
  }

  const updated =
    post.status === ClassmatePostStatus.CLOSED
      ? post
      : await options.tx.classmatePost.update({
          where: { id: options.postId },
          data: {
            status: ClassmatePostStatus.CLOSED,
            closureReason: ClassmatePostClosureReason.AUTHOR_CLOSED,
            closedAt: new Date(),
          },
          include: classmatePostForDiscoverInclude,
        });

  return toNativeDiscoverPost(
    prismaClassmatePostToDiscoverRow(updated, options.userId, {
      savedByViewer: false,
    }),
  );
}

export async function loadNativeOwnedDiscoverItems(userId: string) {
  const now = new Date();
  const [posts, activities] = await Promise.all([
    prisma.classmatePost.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: classmatePostForDiscoverInclude,
    }),
    prisma.discoverActivity.findMany({
      where: { organizerId: userId },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: discoverActivityForFeedInclude,
    }),
  ]);

  return {
    posts: posts.map((post) =>
      toNativeDiscoverPost(
        prismaClassmatePostToDiscoverRow(post, userId, {
          savedByViewer: false,
        }),
      ),
    ),
    activities: activities.map((activity) =>
      toNativeDiscoverActivity(
        prismaDiscoverActivityToRow(activity, userId, now),
      ),
    ),
  };
}

export async function loadNativeDiscoverFeed(options: {
  userId: string;
  city: string;
  query?: string | null;
}) {
  const query = options.query?.trim().toLocaleLowerCase() ?? "";
  const [posts, activities, connections] = await Promise.all([
    loadActiveDiscoverPostsForCity(options.city, options.userId),
    loadActiveDiscoverActivitiesForCity(options.city, options.userId),
    prisma.connection.findMany({
      where: {
        status: ConnectionStatus.ACTIVE,
        OR: [{ userAId: options.userId }, { userBId: options.userId }],
      },
      select: { userAId: true, userBId: true },
    }),
  ]);
  const connectedUserIds = new Set(
    connections.map((connection) =>
      connection.userAId === options.userId
        ? connection.userBId
        : connection.userAId,
    ),
  );

  return {
    city: options.city,
    buddies: posts
      .filter((post) => post.isOwn || !connectedUserIds.has(post.userId))
      .filter((post) => postMatchesQuery(post, query))
      .map(toNativeDiscoverPost),
    activities: activities
      .filter((activity) => activityMatchesQuery(activity, query))
      .map(toNativeDiscoverActivity),
  };
}
