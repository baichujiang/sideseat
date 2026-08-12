/**
 * Idempotent test accounts for manual QA — does NOT wipe courses or catalog data.
 *
 *   npm run seed:test-accounts
 *
 * All accounts share password: Password123
 */
import {
  ClassmatePostCategory,
  ClassmatePostStatus,
  ConnectionStatus,
  CourseIntent,
  DegreeLevel,
  DiscoverActivitySignupStatus,
  DiscoverActivityStatus,
  FriendLinkStatus,
  LanguageProficiency,
  LanguageTag,
  StudentVerificationStatus,
  Weekday,
} from "@prisma/client";

import { nicknameToKey } from "@/lib/auth/nickname-key";
import { hashPassword } from "@/lib/auth/password";
import { getCurrentSemesterLabel } from "@/lib/constants/semester";
import { DISCOVER_ACTIVITY_DEFAULT_DURATION_MS } from "@/lib/constants/discover-activity";
import { DEFAULT_DISCOVER_SERVED_CITY } from "@/lib/discover/discover-city-name-keys";
import { prisma } from "@/lib/db/prisma";

const PASSWORD = "Password123";

/** Previous seed names — removed on re-run so emails/usernames stay unique. */
const LEGACY_USERNAMES = [
  "test_lin",
  "test_amira",
  "test_lucas",
  "test_pending",
  "test_review",
  "test_phone",
] as const;

const LEGACY_EMAILS = [
  "test-lin@tum.de",
  "test-amira@tum.de",
  "test-lucas@tum.de",
  "test-pending@tum.de",
] as const;

type AccountSpec = {
  username: string;
  email: string | null;
  phone?: string | null;
  nickname: string;
  avatarUrl: string;
  bio: string;
  verifiedStudent: boolean;
  studentVerificationStatus: StudentVerificationStatus;
  emailVerifiedAt?: Date | null;
};

const ACCOUNTS: AccountSpec[] = [
  {
    username: "test_001",
    email: "test-001@tum.de",
    nickname: "Test 001",
    avatarUrl: "p02",
    bio: "主测试号 · 已认证",
    verifiedStudent: true,
    studentVerificationStatus: StudentVerificationStatus.VERIFIED,
    emailVerifiedAt: new Date(),
  },
  {
    username: "test_002",
    email: "test-002@tum.de",
    nickname: "Test 002",
    avatarUrl: "p07",
    bio: "聊天 / 联系人测试",
    verifiedStudent: true,
    studentVerificationStatus: StudentVerificationStatus.VERIFIED,
    emailVerifiedAt: new Date(),
  },
  {
    username: "test_003",
    email: "test-003@tum.de",
    nickname: "Test 003",
    avatarUrl: "p14",
    bio: "待处理好友请求",
    verifiedStudent: true,
    studentVerificationStatus: StudentVerificationStatus.VERIFIED,
    emailVerifiedAt: new Date(),
  },
  {
    username: "test_004",
    email: "test-004@tum.de",
    nickname: "Test 004",
    avatarUrl: "p19",
    bio: "学校邮箱未认证",
    verifiedStudent: false,
    studentVerificationStatus: StudentVerificationStatus.EMAIL_PENDING,
    emailVerifiedAt: null,
  },
  {
    username: "test_005",
    email: null,
    nickname: "Test 005",
    avatarUrl: "p03",
    bio: "人工学籍审核队列",
    verifiedStudent: false,
    studentVerificationStatus: StudentVerificationStatus.MANUAL_REVIEW_REQUIRED,
    emailVerifiedAt: null,
  },
  {
    username: "test_006",
    email: null,
    phone: "+4915200000999",
    nickname: "Test 006",
    avatarUrl: "p05",
    bio: "手机号登录测试",
    verifiedStudent: true,
    studentVerificationStatus: StudentVerificationStatus.VERIFIED,
    emailVerifiedAt: null,
  },
];

function daysFromNow(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function minutesAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60 * 1000);
}

function hoursFromNow(hours: number) {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

type SeededFindBuddyPostSpec = {
  username: string;
  title: string;
  body: string;
  expiresInDays: number;
  createdAt: Date;
};

const SEEDED_FIND_BUDDY_POSTS: SeededFindBuddyPostSpec[] = [
  {
    username: "test_001",
    title: "Looking for a quiet library study buddy",
    body: "I am reviewing algorithms most weekday evenings at the main library. Would be great to sit together, do focused blocks, and compare notes during breaks.",
    expiresInDays: 14,
    createdAt: hoursAgo(3),
  },
  {
    username: "test_002",
    title: "Garching lunch or coffee after lecture",
    body: "Usually around MI on Tuesday and Thursday. Happy to grab Mensa lunch, coffee, or just walk around campus and meet new classmates.",
    expiresInDays: 10,
    createdAt: hoursAgo(7),
  },
  {
    username: "test_003",
    title: "Chinese / English language exchange",
    body: "Looking for someone to practice casual English conversation with. I can help with Chinese in return. Coffee near Innenstadt or a short online call both work.",
    expiresInDays: 21,
    createdAt: hoursAgo(12),
  },
  {
    username: "test_006",
    title: "Gym partner near Olympiapark",
    body: "Trying to get back into a regular gym routine two evenings a week. Beginner friendly; mainly weights and a bit of cardio, no pressure.",
    expiresInDays: 18,
    createdAt: hoursAgo(20),
  },
  {
    username: "test_001",
    title: "IN2064 exam prep group",
    body: "Want to form a small Machine Learning exam prep group for problem sheets and old questions. Weekend mornings or Sunday afternoon would be ideal.",
    expiresInDays: 16,
    createdAt: hoursAgo(28),
  },
  {
    username: "test_002",
    title: "Weekend museum or Isar walk",
    body: "Planning something low-key this weekend: Deutsches Museum, English Garden, or a walk by the Isar. Nice chance to meet people outside class.",
    expiresInDays: 12,
    createdAt: hoursAgo(36),
  },
];

async function upsertTestUser(spec: AccountSpec) {
  const hashedPassword = await hashPassword(PASSWORD);
  const shared = {
    hashedPassword,
    nickname: spec.nickname,
    nicknameKey: nicknameToKey(spec.nickname),
    avatarUrl: spec.avatarUrl,
    bio: spec.bio,
    school: "TUM",
    degreeLevel: DegreeLevel.BACHELOR,
    major: "Informatics",
    semester: 2,
    onboardingComplete: true,
    verifiedStudent: spec.verifiedStudent,
    studentVerificationStatus: spec.studentVerificationStatus,
    emailVerifiedAt: spec.emailVerifiedAt ?? null,
    isGuest: false,
    email: spec.email,
    phone: spec.phone ?? null,
  };

  const user = await prisma.user.upsert({
    where: { username: spec.username },
    update: shared,
    create: {
      username: spec.username,
      ...shared,
      userLanguages: {
        create: [
          { tag: LanguageTag.ENGLISH, proficiency: LanguageProficiency.FLUENT },
          { tag: LanguageTag.GERMAN, proficiency: LanguageProficiency.CONVERSATIONAL },
        ],
      },
    },
  });

  if (spec.username === "test_005") {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        studentVerificationNotes:
          "Seeded for admin manual-review testing. Approve or reject in moderation tools.",
      },
    });
  }

  return user;
}

async function findOrCreateConnection(
  userAId: string,
  userBId: string,
  originCourseId: string | null,
) {
  const existing = await prisma.connection.findFirst({
    where: {
      status: ConnectionStatus.ACTIVE,
      OR: [
        { userAId, userBId },
        { userAId: userBId, userBId: userAId },
      ],
    },
  });
  if (existing) return existing;
  return prisma.connection.create({
    data: {
      userAId,
      userBId,
      status: ConnectionStatus.ACTIVE,
      originCourseId,
      updatedAt: minutesAgo(5),
    },
  });
}

async function seedDmIfEmpty(
  connectionId: string,
  senderId: string,
  receiverId: string,
) {
  const count = await prisma.message.count({ where: { connectionId } });
  if (count > 0) return;
  await prisma.message.createMany({
    data: [
      {
        connectionId,
        senderId,
        body: "Hi — this is seeded test chat data.",
        createdAt: hoursAgo(6),
      },
      {
        connectionId,
        senderId: receiverId,
        body: "Got it. Reply works for inbox unread tests.",
        createdAt: minutesAgo(8),
      },
    ],
  });
}

async function seedFriendLinkIfMissing(
  connectionId: string,
  requesterId: string,
  responderId: string,
  status: FriendLinkStatus,
) {
  const existing = await prisma.friendLink.findFirst({
    where: { connectionId, requesterId, responderId },
  });
  if (existing) return;
  await prisma.friendLink.create({
    data: { connectionId, requesterId, responderId, status },
  });
}

async function enrollInMlIfAvailable(userId: string) {
  const semester = getCurrentSemesterLabel();
  const course = await prisma.course.findFirst({
    where: { code: "IN2064", school: "TUM", semesterLabel: semester },
    select: { id: true },
  });
  if (!course) return null;
  await prisma.userCourse.upsert({
    where: { userId_courseId: { userId, courseId: course.id } },
    update: { intentions: [CourseIntent.STUDY_TOGETHER, CourseIntent.EXAM_PREP] },
    create: {
      userId,
      courseId: course.id,
      intentions: [CourseIntent.STUDY_TOGETHER, CourseIntent.EXAM_PREP],
    },
  });
  return course.id;
}

async function seedMlOfficialSchedule(courseId: string) {
  const fingerprint = "test-fixture:in2064:lecture-and-tutorial";
  const variant = await prisma.courseOfficialScheduleVariant.upsert({
    where: { courseId_fingerprint: { courseId, fingerprint } },
    update: {
      label: "Lecture + tutorial",
      externalKey: "test-fixture-in2064",
      syncedAt: new Date(),
    },
    create: {
      courseId,
      label: "Lecture + tutorial",
      fingerprint,
      externalKey: "test-fixture-in2064",
    },
  });

  await prisma.courseOfficialScheduleSession.deleteMany({
    where: { variantId: variant.id },
  });
  await prisma.courseOfficialScheduleSession.createMany({
    data: [
      {
        variantId: variant.id,
        weekday: Weekday.MON,
        startMinute: 10 * 60,
        endMinute: 12 * 60,
        location: "MI HS 1",
      },
      {
        variantId: variant.id,
        weekday: Weekday.WED,
        startMinute: 14 * 60,
        endMinute: 16 * 60,
        location: "MI 00.13.009A",
      },
    ],
  });
  await prisma.course.update({
    where: { id: courseId },
    data: { officialScheduleSyncedAt: new Date() },
  });
}

async function resetLiveUITestArtifacts() {
  // API rate-limit counters live in PostgreSQL, so restarting Next.js is not
  // enough to isolate repeated local regression runs.
  const rateLimits = await prisma.apiRateLimitCounter.deleteMany();
  const plans = await prisma.planRequest.findMany({
    where: { title: { startsWith: "[live-ui]" } },
    select: { id: true },
  });
  const planIds = plans.map((plan) => plan.id);
  if (planIds.length > 0) {
    await prisma.calendarEntry.deleteMany({
      where: { planRequestId: { in: planIds } },
    });
    await prisma.message.deleteMany({
      where: { planRequestId: { in: planIds } },
    });
    await prisma.planRequest.deleteMany({
      where: { id: { in: planIds } },
    });
  }

  const [messages, posts] = await Promise.all([
    prisma.message.deleteMany({
      where: { body: { startsWith: "[live-ui]" } },
    }),
    prisma.classmatePost.deleteMany({
      where: { title: { startsWith: "[live-ui]" } },
    }),
  ]);
  const [groups, feedback] = await Promise.all([
    prisma.groupChat.deleteMany({
      where: { title: { startsWith: "[live-ui]" } },
    }),
    prisma.productFeedback.deleteMany({
      where: { title: { startsWith: "[live-ui]" } },
    }),
  ]);
  const calendarEntries = await prisma.calendarEntry.deleteMany({
    where: { title: { startsWith: "Native live event " } },
  });
  const calendarCategories = await prisma.userCalendarCategory.deleteMany({
    where: { name: { startsWith: "Native live calendar " } },
  });
  const signupAccounts = await prisma.user.deleteMany({
    where: { username: { startsWith: "liveui_" } },
  });
  const removed =
    planIds.length +
    messages.count +
    posts.count +
    groups.count +
    feedback.count +
    calendarEntries.count +
    calendarCategories.count +
    signupAccounts.count;
  if (removed > 0) {
    console.log(`  Live UI cleanup: removed ${removed} prior artifact(s)`);
  }
  if (rateLimits.count > 0) {
    console.log(`  Test rate limits: reset ${rateLimits.count} counter(s)`);
  }
}

async function seedDiscoverActivitiesIfMissing(organizerId: string, participantId: string) {
  const marker = "[test]";
  const existing = await prisma.discoverActivity.findFirst({
    where: { title: { contains: marker } },
  });
  if (existing) {
    await prisma.discoverActivity.updateMany({
      where: { title: { contains: marker }, description: null },
      data: {
        description:
          "Seeded test activity — add your own events from Discover → Organize an activity.",
      },
    });
    console.log(`  Discover activities: already seeded (${existing.id}); backfilled missing descriptions`);
    return;
  }

  const city = DEFAULT_DISCOVER_SERVED_CITY;
  const school = "TUM";

  const studyStart = hoursFromNow(72);
  const studyEnd = new Date(studyStart.getTime() + DISCOVER_ACTIVITY_DEFAULT_DURATION_MS);
  const studyActivity = await prisma.discoverActivity.create({
    data: {
      organizerId,
      city,
      school,
      title: `${marker} Garching library study group`,
      description:
        "Bring your laptop and course notes. We will work through problem sets together for 2 hours, then optional coffee break. Meet at the main entrance.",
      startAt: studyStart,
      endAt: studyEnd,
      location: "Garching Forschungszentrum · Main library",
      capacity: 8,
      status: DiscoverActivityStatus.OPEN,
    },
  });

  const socialStart = hoursFromNow(120);
  const socialEnd = new Date(socialStart.getTime() + DISCOVER_ACTIVITY_DEFAULT_DURATION_MS);
  await prisma.discoverActivity.create({
    data: {
      organizerId: participantId,
      city,
      school,
      title: `${marker} Coffee & campus walk`,
      description:
        "Casual meetup for new classmates. No agenda — just coffee near Stammstrecke and a short walk around campus. Everyone welcome.",
      startAt: socialStart,
      endAt: socialEnd,
      location: "Stammstrecke · Arcisstraße café",
      capacity: null,
      status: DiscoverActivityStatus.OPEN,
    },
  });

  await prisma.discoverActivitySignup.create({
    data: {
      activityId: studyActivity.id,
      userId: participantId,
      status: DiscoverActivitySignupStatus.GOING,
    },
  });

  console.log("  Discover activities: created 2 sample events + 1 RSVP");
  console.log(`    • ${studyActivity.title}`);
  console.log(`      id: ${studyActivity.id}`);
  console.log(`      organizer: test_001 · 1 going (test_003)`);
  console.log(`    • ${marker} Coffee & campus walk (test_002)`);
}

async function seedDiscoverFindBuddyPosts(usersByUsername: Record<string, { id: string }>) {
  const legacy = await prisma.classmatePost.deleteMany({
    where: {
      title: "[test] Library study buddy",
      body: "Seeded Discover post for QA. Safe to delete.",
    },
  });
  if (legacy.count > 0) {
    console.log(`  Discover posts: removed ${legacy.count} legacy placeholder post(s)`);
  }

  let created = 0;
  let updated = 0;

  for (const spec of SEEDED_FIND_BUDDY_POSTS) {
    const author = usersByUsername[spec.username];
    if (!author) continue;

    const data = {
      userId: author.id,
      city: DEFAULT_DISCOVER_SERVED_CITY,
      category: ClassmatePostCategory.OTHER,
      title: spec.title,
      body: spec.body,
      status: ClassmatePostStatus.ACTIVE,
      expiresAt: daysFromNow(spec.expiresInDays),
      createdAt: spec.createdAt,
    };

    const existing = await prisma.classmatePost.findFirst({
      where: {
        userId: author.id,
        category: ClassmatePostCategory.OTHER,
        title: spec.title,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.classmatePost.update({
        where: { id: existing.id },
        data,
      });
      updated += 1;
    } else {
      await prisma.classmatePost.create({ data });
      created += 1;
    }
  }

  console.log(
    `  Discover posts: created ${created}, updated ${updated} realistic find-buddy posts`,
  );
}

async function removeLegacyTestAccounts() {
  const removed = await prisma.user.deleteMany({
    where: {
      OR: [
        { username: { in: [...LEGACY_USERNAMES] } },
        { email: { in: [...LEGACY_EMAILS] } },
      ],
    },
  });
  if (removed.count > 0) {
    console.log(`Removed ${removed.count} legacy test account(s) (test_lin, …).`);
  }
}

async function main() {
  await removeLegacyTestAccounts();

  const users = await Promise.all(ACCOUNTS.map(upsertTestUser));
  const byName = Object.fromEntries(users.map((u) => [u.username, u]));
  const u001 = byName.test_001;
  const u002 = byName.test_002;
  const u003 = byName.test_003;

  await resetLiveUITestArtifacts();

  const mlCourseId = await enrollInMlIfAvailable(u001.id);
  if (mlCourseId) {
    await seedMlOfficialSchedule(mlCourseId);
    await enrollInMlIfAvailable(u002.id);
    await enrollInMlIfAvailable(u003.id);
  }

  const conn001002 = await findOrCreateConnection(u001.id, u002.id, mlCourseId);
  const conn001003 = await findOrCreateConnection(u001.id, u003.id, mlCourseId);

  await seedDmIfEmpty(conn001002.id, u001.id, u002.id);
  await seedDmIfEmpty(conn001003.id, u003.id, u001.id);
  const readAt = new Date();
  await prisma.connection.update({
    where: { id: conn001002.id },
    data: { readByAAt: readAt, readByBAt: readAt },
  });
  await prisma.connection.update({
    where: { id: conn001003.id },
    data: { readByAAt: readAt, readByBAt: readAt },
  });

  await seedFriendLinkIfMissing(
    conn001002.id,
    u001.id,
    u002.id,
    FriendLinkStatus.ACCEPTED,
  );
  await seedFriendLinkIfMissing(
    conn001003.id,
    u001.id,
    u003.id,
    FriendLinkStatus.PENDING,
  );

  await seedDiscoverFindBuddyPosts(byName);
  await seedDiscoverActivitiesIfMissing(u001.id, u003.id);

  const semester = getCurrentSemesterLabel();
  console.log("\n=== SideSeat test accounts (idempotent) ===\n");
  console.log(`Password for all: ${PASSWORD}\n`);
  for (const spec of ACCOUNTS) {
    const login = spec.email ?? spec.phone ?? spec.username;
    console.log(`  ${spec.nickname}`);
    console.log(`    login: ${login}`);
    console.log(`    user:  ${spec.username}`);
    console.log(`    status: ${spec.studentVerificationStatus}`);
    console.log("");
  }
  console.log("Relationships:");
  console.log("  test_001 ↔ test_002: DM + accepted friend");
  console.log("  test_001 ↔ test_003: DM + pending friend (from 001)");
  if (mlCourseId) {
    console.log(`  test_001–003 enrolled in IN2064 (${semester})`);
  } else {
    console.log(`  IN2064 not in DB for ${semester} — skipped course enroll`);
  }
  console.log("  test_001 / test_002 / test_003 / test_006: realistic Discover find-buddy posts");
  console.log("  test_001 / test_002: [test] Discover activities (see log above)");
  console.log("\nRe-run anytime: npm run seed:test-accounts\n");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
