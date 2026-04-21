import {
  ConnectionStatus,
  ContactExchangeStatus,
  CourseIntent,
  DegreeLevel,
  InvitationStatus,
  InvitationType,
  LanguageTag,
  ReportActionType,
  ReportReason,
  ReportStatus,
  StudentVerificationStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db/prisma";

async function main() {
  await prisma.reportAction.deleteMany();
  await prisma.moderationBlock.deleteMany();
  await prisma.report.deleteMany();
  await prisma.block.deleteMany();
  await prisma.contactExchangeRequest.deleteMany();
  await prisma.message.deleteMany();
  await prisma.connection.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.userCourse.deleteMany();
  await prisma.schoolEmailVerification.deleteMany();
  await prisma.session.deleteMany();
  await prisma.course.deleteMany();
  await prisma.user.deleteMany();

  const password = await bcrypt.hash("Password123", 12);

  const [lin, amira, lucas, yuna] = await Promise.all([
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
  ]);

  const [ml, idl, intro] = await Promise.all([
    prisma.course.create({
      data: {
        name: "Machine Learning",
        code: "IN2064",
        school: "TUM",
        semesterLabel: "WS 2026/27",
        location: "MI HS 1",
        schedule: "Tue 14:00",
      },
    }),
    prisma.course.create({
      data: {
        name: "Introduction to Deep Learning",
        code: "IN2346",
        school: "TUM",
        semesterLabel: "WS 2026/27",
        location: "MI HS 2",
        schedule: "Thu 10:00",
      },
    }),
    prisma.course.create({
      data: {
        name: "Einführung in die Informatik 1",
        code: "IN0001",
        school: "TUM",
        semesterLabel: "WS 2026/27",
        location: "MW 2001",
        schedule: "Fri 09:00",
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
    ],
  });

  const acceptedInvitation = await prisma.invitation.create({
    data: {
      senderId: lin.id,
      receiverId: amira.id,
      courseId: ml.id,
      type: InvitationType.STUDY_TOGETHER,
      note: "Want to review the lecture after class this week?",
      status: InvitationStatus.ACCEPTED,
    },
  });

  const pendingInvitation = await prisma.invitation.create({
    data: {
      senderId: lucas.id,
      receiverId: lin.id,
      courseId: ml.id,
      type: InvitationType.GO_TO_CLASS_TOGETHER,
      note: "We seem to have the same Tuesday schedule.",
      status: InvitationStatus.PENDING,
    },
  });

  const connection = await prisma.connection.create({
    data: {
      invitationId: acceptedInvitation.id,
      userAId: lin.id,
      userBId: amira.id,
      status: ConnectionStatus.ACTIVE,
    },
  });

  await prisma.message.createMany({
    data: [
      {
        connectionId: connection.id,
        senderId: lin.id,
        body: "Hi, would you like to study after class on Thursday?",
      },
      {
        connectionId: connection.id,
        senderId: amira.id,
        body: "Yes, that sounds good. The library cafe works for me.",
      },
    ],
  });

  await prisma.contactExchangeRequest.create({
    data: {
      connectionId: connection.id,
      requesterId: lin.id,
      responderId: amira.id,
      status: ContactExchangeStatus.ACCEPTED,
    },
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

  console.log("Seeded users:", {
    lin: lin.email,
    amira: amira.email,
    lucas: lucas.email,
    yuna: yuna.email,
  });
  console.log("Shared login password:", "Password123");
  console.log("Pending invitation:", pendingInvitation.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
