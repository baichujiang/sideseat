/**
 * Idempotent production-safe Discover showcase data.
 *
 * This script never wipes shared data. It only manages three reserved,
 * non-login showcase users and one post owned by the showcase host.
 *
 *   node --env-file=.env --import tsx scripts/seed-discover-showcase.ts
 */
import { randomBytes } from "node:crypto";

import {
  ClassmatePostCategory,
  ClassmatePostReplyPreference,
  ClassmatePostStatus,
  ClassmatePostVisibility,
  DegreeLevel,
  LanguageProficiency,
  LanguageTag,
  PrismaClient,
  StudentStatus,
  StudentVerificationStatus,
  UserGender,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const HOST_USERNAME = "sideseat_showcase_host";
const VIEWER_A_USERNAME = "sideseat_showcase_viewer_a";
const VIEWER_B_USERNAME = "sideseat_showcase_viewer_b";
const SHOWCASE_TITLE = "示例 · 图书馆自习 + 课后咖啡";

const imageUrls = [
  "https://picsum.photos/seed/sideseat-library-friends/800/600",
  "https://picsum.photos/seed/classlink-dev-study-1/800/600",
  "https://picsum.photos/seed/classlink-seed-lang-3/800/600",
];

type ShowcaseUser = {
  username: string;
  nickname: string;
  school: string;
  major: string;
  semester: number;
  bio: string;
  gender: UserGender;
  languages: Array<{
    tag: LanguageTag;
    proficiency: LanguageProficiency;
  }>;
};

async function upsertShowcaseUser(spec: ShowcaseUser) {
  // A new random password hash on every run keeps these display-only users
  // impossible to access with a stable credential.
  const hashedPassword = await bcrypt.hash(randomBytes(48).toString("hex"), 12);
  const profile = {
    email: null,
    phone: null,
    hashedPassword,
    nickname: spec.nickname,
    nicknameKey: spec.nickname.trim().toLocaleLowerCase(),
    gender: spec.gender,
    school: spec.school,
    studentStatus: StudentStatus.CURRENT_STUDENT,
    degreeLevel: DegreeLevel.MASTER,
    major: spec.major,
    semester: spec.semester,
    avatarUrl: null,
    bio: spec.bio,
    onboardingComplete: true,
    verifiedStudent: true,
    studentVerificationStatus: StudentVerificationStatus.VERIFIED,
    studentVerifiedAt: new Date(),
    emailVerifiedAt: null,
    isGuest: false,
    hideFromDiscovery: true,
    hideFromRecommendations: true,
    discoverByCourse: false,
    discoverByMajor: false,
    discoverBySemester: false,
    allowInvitationNotes: false,
    contactInfoOptIn: false,
  };

  const user = await prisma.user.upsert({
    where: { username: spec.username },
    update: profile,
    create: {
      username: spec.username,
      ...profile,
    },
  });

  await prisma.$transaction([
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.userLanguage.deleteMany({ where: { userId: user.id } }),
    prisma.userLanguage.createMany({
      data: spec.languages.map((language) => ({
        userId: user.id,
        ...language,
      })),
    }),
  ]);

  return user;
}

async function ensureQuestion(options: {
  postId: string;
  userId: string;
  body: string;
  replyUserId: string;
  replyBody: string;
  minutesAgo: number;
}) {
  const question = await prisma.classmatePostComment.findFirst({
    where: {
      postId: options.postId,
      userId: options.userId,
      parentId: null,
      body: options.body,
    },
    select: { id: true, reply: { select: { id: true } } },
  });
  const createdAt = new Date(Date.now() - options.minutesAgo * 60_000);
  const thread = question ?? await prisma.classmatePostComment.create({
    data: {
      postId: options.postId,
      userId: options.userId,
      body: options.body,
      createdAt,
    },
    select: { id: true, reply: { select: { id: true } } },
  });

  if (!thread.reply) {
    await prisma.classmatePostComment.create({
      data: {
        postId: options.postId,
        userId: options.replyUserId,
        parentId: thread.id,
        body: options.replyBody,
        createdAt: new Date(createdAt.getTime() + 15 * 60_000),
      },
    });
  }
}

async function main() {
  const [host, viewerA, viewerB] = await Promise.all([
    upsertShowcaseUser({
      username: HOST_USERNAME,
      nickname: "SideSeat 示例用户",
      school: "TUM",
      major: "Informatics",
      semester: 3,
      bio: "官方界面示例资料，不对应真实用户或真实邀约。",
      gender: UserGender.PRIVATE,
      languages: [
        { tag: LanguageTag.CHINESE, proficiency: LanguageProficiency.NATIVE },
        { tag: LanguageTag.ENGLISH, proficiency: LanguageProficiency.FLUENT },
      ],
    }),
    upsertShowcaseUser({
      username: VIEWER_A_USERNAME,
      nickname: "示例访客 Mia",
      school: "LMU",
      major: "Management",
      semester: 2,
      bio: "SideSeat 评论区展示账号。",
      gender: UserGender.FEMALE,
      languages: [
        { tag: LanguageTag.ENGLISH, proficiency: LanguageProficiency.FLUENT },
        { tag: LanguageTag.GERMAN, proficiency: LanguageProficiency.CONVERSATIONAL },
      ],
    }),
    upsertShowcaseUser({
      username: VIEWER_B_USERNAME,
      nickname: "示例访客 Leo",
      school: "TUM",
      major: "Electrical Engineering",
      semester: 4,
      bio: "SideSeat 评论区展示账号。",
      gender: UserGender.MALE,
      languages: [
        { tag: LanguageTag.CHINESE, proficiency: LanguageProficiency.FLUENT },
        { tag: LanguageTag.GERMAN, proficiency: LanguageProficiency.FLUENT },
      ],
    }),
  ]);

  const existing = await prisma.classmatePost.findFirst({
    where: { userId: host.id },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const postData = {
    city: "Munich",
    category: ClassmatePostCategory.OTHER,
    title: SHOWCASE_TITLE,
    body:
      "这是一条由 SideSeat 创建的界面示例帖，不对应真实邀约。想找 2–3 位同学组成轻松但稳定的自习小组：平日傍晚在 TUM 主校区图书馆各自专注，结束后可以去附近喝杯咖啡。专业不限，中英都可以，第一次来也不用有压力。",
    status: ClassmatePostStatus.ACTIVE,
    closureReason: null,
    closedAt: null,
    tags: ["自习", "图书馆", "咖啡", "新朋友"],
    visibility: ClassmatePostVisibility.CITY_INTERNATIONALS,
    replyPreference: ClassmatePostReplyPreference.DIRECT_MESSAGE,
    startsAt: null,
    endsAt: null,
    location: "TUM Main Campus Library",
    capacity: 4,
    expiresAt: new Date("2099-12-31T23:59:59.000Z"),
  };

  const post = existing
    ? await prisma.classmatePost.update({
        where: { id: existing.id },
        data: postData,
      })
    : await prisma.classmatePost.create({
        data: {
          userId: host.id,
          ...postData,
        },
      });

  await prisma.$transaction([
    prisma.classmatePostImage.deleteMany({ where: { postId: post.id } }),
    prisma.classmatePostImage.createMany({
      data: imageUrls.map((url, sortOrder) => ({
        postId: post.id,
        url,
        sortOrder,
      })),
    }),
    prisma.classmatePostSave.upsert({
      where: {
        userId_classmatePostId: {
          userId: viewerA.id,
          classmatePostId: post.id,
        },
      },
      create: { userId: viewerA.id, classmatePostId: post.id },
      update: {},
    }),
    prisma.classmatePostSave.upsert({
      where: {
        userId_classmatePostId: {
          userId: viewerB.id,
          classmatePostId: post.id,
        },
      },
      create: { userId: viewerB.id, classmatePostId: post.id },
      update: {},
    }),
  ]);

  await ensureQuestion({
    postId: post.id,
    userId: viewerA.id,
    body: "时间是固定的吗？我周三下课比较晚。",
    replyUserId: host.id,
    replyBody: "不固定，可以每周在评论里确认；第一次先约 18:30 也可以。",
    minutesAgo: 95,
  });
  await ensureQuestion({
    postId: post.id,
    userId: viewerB.id,
    body: "可以只来喝咖啡认识一下吗？",
    replyUserId: host.id,
    replyBody: "当然可以，自习和咖啡都可以单独参加。",
    minutesAgo: 50,
  });

  const result = await prisma.classmatePost.findUniqueOrThrow({
    where: { id: post.id },
    select: {
      id: true,
      title: true,
      city: true,
      visibility: true,
      expiresAt: true,
      user: { select: { username: true, nickname: true } },
      _count: { select: { images: true, saves: true, comments: true } },
    },
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
