import {
  ConnectionStatus,
  ContactExchangeStatus,
  CourseIntent,
  DegreeLevel,
  FriendLinkStatus,
  LanguageTag,
  ReportActionType,
  ReportReason,
  ReportStatus,
  StudentVerificationStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

import { getCurrentSemesterLabel } from "@/lib/constants/semester";
import { prisma } from "@/lib/db/prisma";

const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000);
const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);
const daysAgo = (d: number) => new Date(Date.now() - d * 24 * 60 * 60 * 1000);

async function main() {
  await prisma.reportAction.deleteMany();
  await prisma.moderationBlock.deleteMany();
  await prisma.report.deleteMany();
  await prisma.block.deleteMany();
  await prisma.contactExchangeRequest.deleteMany();
  await prisma.message.deleteMany();
  await prisma.courseRoomMessage.deleteMany();
  await prisma.friendLink.deleteMany();
  await prisma.connection.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.userCourse.deleteMany();
  await prisma.schoolEmailVerification.deleteMany();
  await prisma.session.deleteMany();
  await prisma.course.deleteMany();
  await prisma.user.deleteMany();

  const password = await bcrypt.hash("Password123", 12);

  const [
    lin,
    amira,
    lucas,
    yuna,
    kai,
    lena,
    sofia,
    jonas,
    elena,
    marco,
    nina,
  ] = await Promise.all([
    prisma.user.create({
      data: {
        username: "lin",
        email: "lin@tum.de",
        hashedPassword: password,
        avatarUrl: "p02",
        nickname: "Lin",
        school: "TUM",
        degreeLevel: DegreeLevel.BACHELOR,
        major: "Informatics",
        semester: 2,
        bio: "New in Munich and looking for calm study partners.",
        languages: [LanguageTag.CHINESE, LanguageTag.ENGLISH, LanguageTag.GERMAN],
        onboardingComplete: true,
        verifiedStudent: true,
        studentVerificationStatus: StudentVerificationStatus.VERIFIED,
        emailVerifiedAt: new Date(),
        contactInfoOptIn: true,
        telegramHandle: "@lin_ml",
      },
    }),
    prisma.user.create({
      data: {
        username: "amira",
        email: "amira@tum.de",
        hashedPassword: password,
        avatarUrl: "p07",
        nickname: "Amira",
        school: "TUM",
        degreeLevel: DegreeLevel.BACHELOR,
        major: "Informatics",
        semester: 2,
        bio: "Usually free after class for coffee and review sessions.",
        languages: [LanguageTag.ENGLISH, LanguageTag.GERMAN],
        onboardingComplete: true,
        verifiedStudent: true,
        studentVerificationStatus: StudentVerificationStatus.VERIFIED,
        emailVerifiedAt: new Date(),
        contactInfoOptIn: true,
        whatsappHandle: "+49 111 222333",
      },
    }),
    prisma.user.create({
      data: {
        username: "lucas",
        email: "lucas@tum.de",
        hashedPassword: password,
        avatarUrl: "p14",
        nickname: "Lucas",
        school: "TUM",
        degreeLevel: DegreeLevel.BACHELOR,
        major: "Informatics",
        semester: 2,
        bio: "Happy to walk to class together if schedules line up.",
        languages: [LanguageTag.ENGLISH, LanguageTag.GERMAN, LanguageTag.SPANISH],
        onboardingComplete: true,
        verifiedStudent: true,
        studentVerificationStatus: StudentVerificationStatus.VERIFIED,
        emailVerifiedAt: new Date(),
      },
    }),
    prisma.user.create({
      data: {
        username: "yuna",
        email: null,
        hashedPassword: password,
        avatarUrl: "p19",
        nickname: "Yuna",
        school: "TUM",
        degreeLevel: DegreeLevel.BACHELOR,
        major: "Informatics",
        semester: 3,
        bio: "Prefer low-pressure intros before sharing contact info.",
        languages: [LanguageTag.ENGLISH, LanguageTag.GERMAN],
        onboardingComplete: true,
        studentVerificationStatus: StudentVerificationStatus.MANUAL_REVIEW_REQUIRED,
        studentVerificationNotes:
          "Public domain submitted for school verification. Needs admin approval.",
      },
    }),
    prisma.user.create({
      data: {
        username: "kai",
        email: "kai@tum.de",
        hashedPassword: password,
        avatarUrl: "p03",
        nickname: "Kai",
        school: "TUM",
        degreeLevel: DegreeLevel.BACHELOR,
        major: "Informatics",
        semester: 2,
        bio: "Into paper discussions and whiteboard sessions.",
        languages: [LanguageTag.GERMAN, LanguageTag.ENGLISH],
        onboardingComplete: true,
        verifiedStudent: true,
        studentVerificationStatus: StudentVerificationStatus.VERIFIED,
        emailVerifiedAt: new Date(),
      },
    }),
    prisma.user.create({
      data: {
        username: "lena",
        email: "lena@tum.de",
        hashedPassword: password,
        avatarUrl: "p04",
        nickname: "Lena",
        school: "TUM",
        degreeLevel: DegreeLevel.BACHELOR,
        major: "Informatics",
        semester: 2,
        bio: "Quiet but reliable for exam prep.",
        languages: [LanguageTag.GERMAN, LanguageTag.ENGLISH],
        onboardingComplete: true,
        verifiedStudent: true,
        studentVerificationStatus: StudentVerificationStatus.VERIFIED,
        emailVerifiedAt: new Date(),
      },
    }),
    prisma.user.create({
      data: {
        username: "sofia",
        email: "sofia@tum.de",
        hashedPassword: password,
        avatarUrl: "p05",
        nickname: "Sofia",
        school: "TUM",
        degreeLevel: DegreeLevel.BACHELOR,
        major: "Informatics",
        semester: 2,
        bio: "Coffee after ML lecture is a ritual.",
        languages: [LanguageTag.ENGLISH, LanguageTag.SPANISH],
        onboardingComplete: true,
        verifiedStudent: true,
        studentVerificationStatus: StudentVerificationStatus.VERIFIED,
        emailVerifiedAt: new Date(),
      },
    }),
    prisma.user.create({
      data: {
        username: "jonas",
        email: "jonas@tum.de",
        hashedPassword: password,
        avatarUrl: "p08",
        nickname: "Jonas",
        school: "TUM",
        degreeLevel: DegreeLevel.BACHELOR,
        major: "Informatics",
        semester: 2,
        bio: "Shares notes in the group drive.",
        languages: [LanguageTag.GERMAN, LanguageTag.ENGLISH],
        onboardingComplete: true,
        verifiedStudent: true,
        studentVerificationStatus: StudentVerificationStatus.VERIFIED,
        emailVerifiedAt: new Date(),
      },
    }),
    prisma.user.create({
      data: {
        username: "elena",
        email: "elena@tum.de",
        hashedPassword: password,
        avatarUrl: "p09",
        nickname: "Elena",
        school: "TUM",
        degreeLevel: DegreeLevel.BACHELOR,
        major: "Informatics",
        semester: 2,
        bio: "Mostly async, prefers email.",
        languages: [LanguageTag.ENGLISH, LanguageTag.GERMAN],
        onboardingComplete: true,
        verifiedStudent: true,
        studentVerificationStatus: StudentVerificationStatus.VERIFIED,
        emailVerifiedAt: new Date(),
      },
    }),
    prisma.user.create({
      data: {
        username: "marco",
        email: "marco@tum.de",
        hashedPassword: password,
        avatarUrl: "p10",
        nickname: "Marco",
        school: "TUM",
        degreeLevel: DegreeLevel.BACHELOR,
        major: "Informatics",
        semester: 2,
        bio: "Just matched — say hi anytime.",
        languages: [LanguageTag.ENGLISH, LanguageTag.GERMAN, LanguageTag.SPANISH],
        onboardingComplete: true,
        verifiedStudent: true,
        studentVerificationStatus: StudentVerificationStatus.VERIFIED,
        emailVerifiedAt: new Date(),
      },
    }),
    prisma.user.create({
      data: {
        username: "nina",
        email: "nina@tum.de",
        hashedPassword: password,
        avatarUrl: "p11",
        nickname: "Nina",
        school: "TUM",
        degreeLevel: DegreeLevel.BACHELOR,
        major: "Informatics",
        semester: 2,
        bio: "Weekend study blocks at the library.",
        languages: [LanguageTag.GERMAN, LanguageTag.ENGLISH],
        onboardingComplete: true,
        verifiedStudent: true,
        studentVerificationStatus: StudentVerificationStatus.VERIFIED,
        emailVerifiedAt: new Date(),
      },
    }),
  ]);

  const [ml, idl, intro] = await Promise.all([
    prisma.course.create({
      data: {
        name: "Machine Learning",
        code: "IN2064",
        school: "TUM",
        semesterLabel: getCurrentSemesterLabel(),
      },
    }),
    prisma.course.create({
      data: {
        name: "Introduction to Deep Learning",
        code: "IN2346",
        school: "TUM",
        semesterLabel: getCurrentSemesterLabel(),
      },
    }),
    prisma.course.create({
      data: {
        name: "Einführung in die Informatik 1",
        code: "IN0001",
        school: "TUM",
        semesterLabel: getCurrentSemesterLabel(),
      },
    }),
  ]);

  await prisma.userCourse.createMany({
    data: [
      {
        userId: lin.id,
        courseId: ml.id,
        intentions: [CourseIntent.STUDY_TOGETHER, CourseIntent.EXAM_PREP],
      },
      {
        userId: lin.id,
        courseId: idl.id,
        intentions: [CourseIntent.GO_TO_CLASS_TOGETHER],
      },
      {
        userId: amira.id,
        courseId: ml.id,
        intentions: [CourseIntent.STUDY_TOGETHER, CourseIntent.EAT_AFTER_CLASS],
      },
      {
        userId: lucas.id,
        courseId: ml.id,
        intentions: [CourseIntent.GO_TO_CLASS_TOGETHER],
      },
      {
        userId: lucas.id,
        courseId: intro.id,
        intentions: [CourseIntent.EAT_AFTER_CLASS],
      },
      {
        userId: yuna.id,
        courseId: idl.id,
        intentions: [CourseIntent.STUDY_TOGETHER],
      },
      { userId: kai.id, courseId: ml.id, intentions: [CourseIntent.STUDY_TOGETHER, CourseIntent.EXAM_PREP] },
      { userId: lena.id, courseId: ml.id, intentions: [CourseIntent.GO_TO_CLASS_TOGETHER] },
      { userId: sofia.id, courseId: ml.id, intentions: [CourseIntent.EAT_AFTER_CLASS, CourseIntent.STUDY_TOGETHER] },
      { userId: jonas.id, courseId: ml.id, intentions: [CourseIntent.STUDY_TOGETHER] },
      { userId: elena.id, courseId: idl.id, intentions: [CourseIntent.STUDY_TOGETHER] },
      { userId: marco.id, courseId: ml.id, intentions: [CourseIntent.STUDY_TOGETHER] },
      { userId: nina.id, courseId: ml.id, intentions: [CourseIntent.EXAM_PREP] },
    ],
  });

  // --- Connections + messages (order / unread / empty-chat previews) ---
  //
  // No more legacy invitations in fresh seeds — the first-message flow creates
  // Connections directly with an `originCourseId`. Older rows in production
  // keep their `invitationId` backfill; the migration copies the courseId over.

  const connAmira = await prisma.connection.create({
    data: {
      userAId: lin.id,
      userBId: amira.id,
      status: ConnectionStatus.ACTIVE,
      originCourseId: ml.id,
      updatedAt: minutesAgo(12),
    },
  });

  const connJonas = await prisma.connection.create({
    data: {
      userAId: lin.id,
      userBId: jonas.id,
      status: ConnectionStatus.ACTIVE,
      originCourseId: ml.id,
      updatedAt: hoursAgo(1),
    },
  });

  const connNina = await prisma.connection.create({
    data: {
      userAId: lin.id,
      userBId: nina.id,
      status: ConnectionStatus.ACTIVE,
      originCourseId: ml.id,
      updatedAt: daysAgo(2),
    },
  });

  const connSofia = await prisma.connection.create({
    data: {
      userAId: lin.id,
      userBId: sofia.id,
      status: ConnectionStatus.ACTIVE,
      originCourseId: ml.id,
      updatedAt: daysAgo(1),
    },
  });

  const connMarco = await prisma.connection.create({
    data: {
      userAId: lin.id,
      userBId: marco.id,
      status: ConnectionStatus.ACTIVE,
      originCourseId: ml.id,
      updatedAt: daysAgo(3),
    },
  });

  await prisma.message.createMany({
    data: [
      {
        connectionId: connAmira.id,
        senderId: lin.id,
        body: "Hi, would you like to study after class on Thursday?",
        createdAt: daysAgo(2),
      },
      {
        connectionId: connAmira.id,
        senderId: amira.id,
        body: "Yes, that sounds good. The library cafe works for me.",
        createdAt: daysAgo(1),
      },
      {
        connectionId: connAmira.id,
        senderId: lin.id,
        body: "Perfect — I’ll grab a table near the window.",
        createdAt: hoursAgo(5),
      },
      {
        connectionId: connAmira.id,
        senderId: amira.id,
        body: "Running 10 min late — save me a seat?",
        createdAt: minutesAgo(12),
      },
    ],
  });

  await prisma.message.createMany({
    data: [
      {
        connectionId: connJonas.id,
        senderId: jonas.id,
        body: "Slides for lecture 7 are in the shared folder.",
        createdAt: daysAgo(1),
      },
      {
        connectionId: connJonas.id,
        senderId: lin.id,
        body: "Thanks — I’ll review before tutorial.",
        createdAt: hoursAgo(3),
      },
      {
        connectionId: connJonas.id,
        senderId: jonas.id,
        body: "Can we do 15 min before class tomorrow to align?",
        createdAt: hoursAgo(1),
      },
    ],
  });

  await prisma.message.createMany({
    data: [
      {
        connectionId: connNina.id,
        senderId: nina.id,
        body: "Here’s the exercise sheet link.",
        createdAt: daysAgo(3),
      },
      {
        connectionId: connNina.id,
        senderId: lin.id,
        body: "Got it, thanks!",
        createdAt: daysAgo(2),
      },
    ],
  });

  await prisma.message.createMany({
    data: [
      {
        connectionId: connSofia.id,
        senderId: lin.id,
        body: "Still on for coffee after ML?",
        createdAt: daysAgo(2),
      },
      {
        connectionId: connSofia.id,
        senderId: sofia.id,
        body: "Yes — same spot as last time.",
        createdAt: daysAgo(1),
      },
    ],
  });

  // connMarco: no messages → inbox shows “Say hi” / course fallback

  await prisma.courseRoomMessage.createMany({
    data: [
      {
        courseId: ml.id,
        senderId: jonas.id,
        body: "Office hours moved to Thursday 14:00 this week — FYI.",
        createdAt: hoursAgo(4),
      },
      {
        courseId: ml.id,
        senderId: nina.id,
        body: "Anyone want to form a study group for problem set 5?",
        createdAt: hoursAgo(2),
      },
      {
        courseId: ml.id,
        senderId: lin.id,
        body: "I'm in — same library spot as last time works for me.",
        createdAt: hoursAgo(1),
      },
      {
        courseId: idl.id,
        senderId: yuna.id,
        body: "Does anyone have notes from the tutorial we missed?",
        createdAt: daysAgo(3),
      },
    ],
  });

  await prisma.contactExchangeRequest.create({
    data: {
      connectionId: connAmira.id,
      requesterId: lin.id,
      responderId: amira.id,
      status: ContactExchangeStatus.ACCEPTED,
    },
  });

  await prisma.friendLink.createMany({
    data: [
      {
        connectionId: connAmira.id,
        requesterId: lin.id,
        responderId: amira.id,
        status: FriendLinkStatus.ACCEPTED,
      },
      {
        connectionId: connSofia.id,
        requesterId: lin.id,
        responderId: sofia.id,
        status: FriendLinkStatus.ACCEPTED,
      },
      {
        connectionId: connJonas.id,
        requesterId: jonas.id,
        responderId: lin.id,
        status: FriendLinkStatus.ACCEPTED,
      },
      {
        connectionId: connMarco.id,
        requesterId: lin.id,
        responderId: marco.id,
        status: FriendLinkStatus.PENDING,
      },
    ],
  });

  const report = await prisma.report.create({
    data: {
      reporterId: lin.id,
      reportedUserId: lucas.id,
      reason: ReportReason.REPEATED_UNWANTED_CONTACT,
      status: ReportStatus.OPEN,
      details: "Sending repeated invitations after I already ignored one.",
    },
  });

  await prisma.reportAction.create({
    data: {
      reportId: report.id,
      actionType: ReportActionType.NOTES_UPDATED,
      actorEmail: "lin@example.com",
      fromStatus: ReportStatus.OPEN,
      toStatus: ReportStatus.OPEN,
      noteSnapshot: "Initial report submitted by the reporting student.",
    },
  });

  console.log("Inbox demo login: lin@tum.de / Password123");
  console.log(
    "Messages: 5 DMs + 2 course chats (Machine Learning, Introduction to Deep Learning)",
  );
  console.log("Chats: 5 (Amira unread, Jonas unread, Nina read, Sofia read, Marco empty)");
  console.log("Contacts: 3 accepted (Amira, Sofia, Jonas); Marco has pending friend request from Lin");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
