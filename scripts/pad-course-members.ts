import { Weekday } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/db/prisma";
import { getCurrentSemesterLabel } from "../lib/constants/semester";

const SEMESTER = getCurrentSemesterLabel();

async function ensure(username: string, nickname: string, major: string, sem: number, avatar: string, bio?: string) {
  const hashed = await bcrypt.hash("password123", 10);
  return prisma.user.upsert({
    where: { username },
    update: { hashedPassword: hashed, onboardingComplete: true, nickname, school: "TUM", degreeLevel: "MASTER", major, semester: sem, verifiedStudent: true, studentVerificationStatus: "VERIFIED", avatarUrl: avatar, bio: bio ?? null },
    create: { username, hashedPassword: hashed, onboardingComplete: true, nickname, school: "TUM", degreeLevel: "MASTER", major, semester: sem, verifiedStudent: true, studentVerificationStatus: "VERIFIED", avatarUrl: avatar, bio: bio ?? null },
  });
}

async function main() {
  const ml = await prisma.course.findFirst({ where: { code: "IN2064", semesterLabel: SEMESTER } });
  if (!ml) { console.log("no ML course"); process.exit(1); }

  const people = [
    { u: "liu", n: "Liu", m: "Informatics", s: 3, a: "/avatars/avatar-02.jpg", b: "Coffee + whiteboards.", intents: ["STUDY_TOGETHER", "EXAM_PREP"] as const },
    { u: "sara", n: "Sara", m: "Data Engineering", s: 2, a: "/avatars/avatar-04.jpg", b: "Usually in MI library.", intents: ["STUDY_TOGETHER", "EAT_AFTER_CLASS"] as const },
    { u: "ben", n: "Ben", m: "Informatics", s: 4, a: "/avatars/avatar-06.jpg", b: undefined, intents: ["GO_TO_CLASS_TOGETHER"] as const },
    { u: "noor", n: "Noor", m: "Mathematics", s: 1, a: "/avatars/avatar-07.jpg", b: "First ML course, nervous!", intents: ["STUDY_TOGETHER"] as const },
    { u: "tobi", n: "Tobi", m: "Robotics, Cognition and Intelligence", s: 3, a: "/avatars/avatar-08.jpg", b: undefined, intents: ["EXAM_PREP", "STUDY_TOGETHER"] as const },
    { u: "yuki", n: "Yuki", m: "Informatics", s: 2, a: "/avatars/avatar-10.jpg", b: "Looking for weekly study crew.", intents: ["STUDY_TOGETHER", "EAT_AFTER_CLASS"] as const },
    { u: "raj", n: "Raj", m: "Data Engineering", s: 3, a: "/avatars/avatar-11.jpg", b: undefined, intents: ["EXAM_PREP"] as const },
    { u: "eva", n: "Eva", m: "Informatics", s: 5, a: "/avatars/avatar-12.jpg", b: "Can share past exams.", intents: ["EXAM_PREP", "STUDY_TOGETHER"] as const },
  ];

  for (const p of people) {
    const u = await ensure(p.u, p.n, p.m, p.s, p.a, p.b);
    const m = await prisma.userCourse.upsert({
      where: { userId_courseId: { userId: u.id, courseId: ml.id } },
      update: { intentions: [...p.intents] },
      create: { userId: u.id, courseId: ml.id, intentions: [...p.intents] },
    });
    await prisma.courseSession.deleteMany({ where: { userCourseId: m.id } });
    // Half share demo's schedule, half different, to test overlap badge variety
    const useDemoTimes = Math.random() < 0.5;
    await prisma.courseSession.createMany({
      data: useDemoTimes
        ? [
            { userCourseId: m.id, weekday: Weekday.MON, startMinute: 600, endMinute: 720, location: "MI HS 1" },
            { userCourseId: m.id, weekday: Weekday.WED, startMinute: 840, endMinute: 960, location: "MI HS 1" },
          ]
        : [
            { userCourseId: m.id, weekday: Weekday.MON, startMinute: 600, endMinute: 720, location: "MI HS 1" },
            { userCourseId: m.id, weekday: Weekday.WED, startMinute: 960, endMinute: 1080, location: "MI 00.13.009A" },
          ],
    });
  }
  console.log(`Added ${people.length} members to ML`);
  await prisma.$disconnect();
}
main();
