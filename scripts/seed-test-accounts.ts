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
  FriendLinkStatus,
  LanguageProficiency,
  LanguageTag,
  StudentVerificationStatus,
  StudyPurpose,
  StudyTimeSlot,
  StudyVenue,
} from "@prisma/client";

import { getOrCreateAssistantBotUser } from "@/lib/auth/assistant-bot";
import { nicknameToKey } from "@/lib/auth/nickname-key";
import { hashPassword } from "@/lib/auth/password";
import { getCurrentSemesterLabel } from "@/lib/constants/semester";
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

async function seedDiscoverPostIfMissing(userId: string) {
  const existing = await prisma.classmatePost.findFirst({
    where: { userId, title: { contains: "[test]" } },
  });
  if (existing) return;
  await prisma.classmatePost.create({
    data: {
      userId,
      city: DEFAULT_DISCOVER_SERVED_CITY,
      category: ClassmatePostCategory.STUDY,
      title: "[test] Library study buddy",
      body: "Seeded Discover post for QA. Safe to delete.",
      status: ClassmatePostStatus.ACTIVE,
      expiresAt: daysFromNow(14),
      study: {
        create: {
          purposes: [StudyPurpose.EXAM_PREP],
          timeSlots: [StudyTimeSlot.EVENING],
          venues: [StudyVenue.MAIN_LIBRARY],
        },
      },
    },
  });
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
  await getOrCreateAssistantBotUser();
  await removeLegacyTestAccounts();

  const users = await Promise.all(ACCOUNTS.map(upsertTestUser));
  const byName = Object.fromEntries(users.map((u) => [u.username, u]));
  const u001 = byName.test_001;
  const u002 = byName.test_002;
  const u003 = byName.test_003;

  const mlCourseId = await enrollInMlIfAvailable(u001.id);
  if (mlCourseId) {
    await enrollInMlIfAvailable(u002.id);
    await enrollInMlIfAvailable(u003.id);
  }

  const conn001002 = await findOrCreateConnection(u001.id, u002.id, mlCourseId);
  const conn001003 = await findOrCreateConnection(u001.id, u003.id, mlCourseId);

  await seedDmIfEmpty(conn001002.id, u001.id, u002.id);
  await seedDmIfEmpty(conn001003.id, u003.id, u001.id);

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

  await seedDiscoverPostIfMissing(u001.id);

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
  console.log("  test_001 has one [test] Discover post");
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
