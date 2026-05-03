import bcrypt from "bcryptjs";
import {
  AvailabilityVisibilityMode,
  ConnectionStatus,
  MessageType,
  PlanRequestStatus,
  PlanType,
  StudentVerificationStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

const DEMO_USERNAME = "mila-plan-demo";
const DEMO_EMAIL = "mila.demo@tum.de";
const DEMO_PASSWORD = "Password123";
const DEMO_TEXT_BODY = "[demo] chat planning intro";
const DEMO_AVAILABILITY_BODY = "[demo] availability share";
const DEMO_PLAN_BODY = "[demo] suggest a plan";
const DEMO_PLAN_TITLE = "Study IN2064 together";

function nextSlotDate(daysFromNow: number, hour: number, minute = 0) {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function main() {
  const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 12);

  const lin = await prisma.user.findUnique({
    where: { username: "lin" },
    select: { id: true, username: true, nickname: true },
  });

  if (!lin) {
    throw new Error("Seed user 'lin' not found. Run prisma seed first.");
  }

  const demoUser = await prisma.user.upsert({
    where: { username: DEMO_USERNAME },
    update: {
      email: DEMO_EMAIL,
      hashedPassword,
      nickname: "Mila",
      school: "TUM",
      degreeLevel: "BACHELOR",
      major: "Informatics",
      semester: 2,
      bio: "Happy to plan study sessions and coffee breaks.",
      avatarUrl: "p16",
      onboardingComplete: true,
      verifiedStudent: true,
      studentVerificationStatus: StudentVerificationStatus.VERIFIED,
      emailVerifiedAt: new Date(),
      languages: ["ENGLISH", "GERMAN"],
    },
    create: {
      username: DEMO_USERNAME,
      email: DEMO_EMAIL,
      hashedPassword,
      nickname: "Mila",
      school: "TUM",
      degreeLevel: "BACHELOR",
      major: "Informatics",
      semester: 2,
      bio: "Happy to plan study sessions and coffee breaks.",
      avatarUrl: "p16",
      onboardingComplete: true,
      verifiedStudent: true,
      studentVerificationStatus: StudentVerificationStatus.VERIFIED,
      emailVerifiedAt: new Date(),
      languages: ["ENGLISH", "GERMAN"],
    },
    select: { id: true, username: true, nickname: true },
  });

  const existingConnection = await prisma.connection.findFirst({
    where: {
      status: ConnectionStatus.ACTIVE,
      OR: [
        { userAId: lin.id, userBId: demoUser.id },
        { userAId: demoUser.id, userBId: lin.id },
      ],
    },
    select: { id: true },
  });

  const connection =
    existingConnection ??
    (await prisma.connection.create({
      data: {
        userAId: lin.id,
        userBId: demoUser.id,
        status: ConnectionStatus.ACTIVE,
      },
      select: { id: true },
    }));

  const oldMessages = await prisma.message.findMany({
    where: {
      connectionId: connection.id,
      body: {
        in: [DEMO_TEXT_BODY, DEMO_AVAILABILITY_BODY, DEMO_PLAN_BODY],
      },
    },
    select: {
      id: true,
      availabilityShareId: true,
      planRequestId: true,
    },
  });

  const oldPlanRequestIds = [...new Set(oldMessages.map((m) => m.planRequestId).filter(Boolean))] as string[];
  const oldAvailabilityShareIds = [...new Set(oldMessages.map((m) => m.availabilityShareId).filter(Boolean))] as string[];

  await prisma.message.deleteMany({
    where: {
      id: { in: oldMessages.map((message) => message.id) },
    },
  });

  if (oldPlanRequestIds.length > 0) {
    await prisma.calendarEntryCompanion.deleteMany({
      where: {
        calendarEntry: {
          planRequestId: { in: oldPlanRequestIds },
        },
      },
    });
    await prisma.calendarEntry.deleteMany({
      where: {
        planRequestId: { in: oldPlanRequestIds },
      },
    });
    await prisma.planRequest.deleteMany({
      where: {
        id: { in: oldPlanRequestIds },
      },
    });
  }

  if (oldAvailabilityShareIds.length > 0) {
    await prisma.availabilityShare.deleteMany({
      where: {
        id: { in: oldAvailabilityShareIds },
      },
    });
  }

  const introTime = nextSlotDate(0, 9, 30);
  const shareStart = nextSlotDate(1, 8, 0);
  const shareEnd = nextSlotDate(4, 22, 0);
  const expiresAt = nextSlotDate(7, 23, 0);
  const planStart = nextSlotDate(1, 16, 0);
  const planEnd = nextSlotDate(1, 17, 0);

  const availabilityShare = await prisma.availabilityShare.create({
    data: {
      ownerUserId: demoUser.id,
      connectionId: connection.id,
      visibilityMode: AvailabilityVisibilityMode.FREE_BUSY,
      rangeStart: shareStart,
      rangeEnd: shareEnd,
      expiresAt,
      isRevoked: false,
      createdAt: new Date(introTime.getTime() + 2 * 60 * 1000),
    },
    select: { id: true },
  });

  const planRequest = await prisma.planRequest.create({
    data: {
      connectionId: connection.id,
      proposerUserId: demoUser.id,
      receiverUserId: lin.id,
      planType: PlanType.STUDY,
      title: DEMO_PLAN_TITLE,
      location: "Library",
      message: "Want to review the exercise sheet together?",
      startTime: planStart,
      endTime: planEnd,
      status: PlanRequestStatus.PENDING,
      createdAt: new Date(introTime.getTime() + 4 * 60 * 1000),
    },
    select: { id: true },
  });

  await prisma.message.createMany({
    data: [
      {
        connectionId: connection.id,
        senderId: demoUser.id,
        body: DEMO_TEXT_BODY,
        type: MessageType.TEXT,
        createdAt: introTime,
      },
      {
        connectionId: connection.id,
        senderId: demoUser.id,
        body: DEMO_AVAILABILITY_BODY,
        type: MessageType.AVAILABILITY_CARD,
        availabilityShareId: availabilityShare.id,
        createdAt: new Date(introTime.getTime() + 2 * 60 * 1000),
      },
      {
        connectionId: connection.id,
        senderId: demoUser.id,
        body: DEMO_PLAN_BODY,
        type: MessageType.PLAN_REQUEST_CARD,
        planRequestId: planRequest.id,
        createdAt: new Date(introTime.getTime() + 4 * 60 * 1000),
      },
    ],
  });

  console.log("Chat planning demo ready:");
  console.log({
    loginAs: {
      email: "lin@tum.de",
      password: DEMO_PASSWORD,
    },
    demoSender: {
      username: demoUser.username,
      nickname: demoUser.nickname,
      email: DEMO_EMAIL,
    },
    connectionId: connection.id,
    chatPath: `/connections/${connection.id}`,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
