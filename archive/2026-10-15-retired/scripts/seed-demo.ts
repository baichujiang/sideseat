import { Weekday, type CourseIntent } from "@prisma/client";
import bcrypt from "bcryptjs";

import { prisma } from "../lib/db/prisma";
import { getCurrentSemesterLabel } from "../lib/constants/semester";

const SEMESTER = getCurrentSemesterLabel();

type SessionSpec = { weekday: Weekday; start: number; end: number; location?: string };
type CourseSpec = {
  name: string;
  code: string;
  sessions: SessionSpec[];
  intentions: readonly CourseIntent[];
};

async function ensureUser(opts: {
  username: string;
  password: string;
  nickname: string;
  avatarUrl: string;
  bio?: string;
}) {
  const hashed = await bcrypt.hash(opts.password, 10);
  return prisma.user.upsert({
    where: { username: opts.username },
    update: {
      hashedPassword: hashed,
      onboardingComplete: true,
      nickname: opts.nickname,
      school: "TUM",
      degreeLevel: "MASTER",
      major: "Informatics",
      semester: 3,
      verifiedStudent: true,
      studentVerificationStatus: "VERIFIED",
      avatarUrl: opts.avatarUrl,
      bio: opts.bio ?? null,
    },
    create: {
      username: opts.username,
      hashedPassword: hashed,
      onboardingComplete: true,
      nickname: opts.nickname,
      school: "TUM",
      degreeLevel: "MASTER",
      major: "Informatics",
      semester: 3,
      verifiedStudent: true,
      studentVerificationStatus: "VERIFIED",
      avatarUrl: opts.avatarUrl,
      bio: opts.bio ?? null,
    },
  });
}

async function ensureCourse(spec: { name: string; code: string }) {
  return prisma.course.upsert({
    where: {
      name_school_semesterLabel: {
        name: spec.name,
        school: "TUM",
        semesterLabel: SEMESTER,
      },
    },
    update: { code: spec.code },
    create: {
      name: spec.name,
      code: spec.code,
      school: "TUM",
      semesterLabel: SEMESTER,
    },
  });
}

async function enroll(userId: string, courseId: string, spec: CourseSpec) {
  const membership = await prisma.userCourse.upsert({
    where: { userId_courseId: { userId, courseId } },
    update: { intentions: [...spec.intentions] },
    create: { userId, courseId, intentions: [...spec.intentions] },
  });
  await prisma.courseSession.deleteMany({ where: { userCourseId: membership.id } });
  if (spec.sessions.length) {
    await prisma.courseSession.createMany({
      data: spec.sessions.map((s) => ({
        userCourseId: membership.id,
        weekday: s.weekday,
        startMinute: s.start,
        endMinute: s.end,
        location: s.location ?? null,
      })),
    });
  }
}

async function main() {
  const demo = await ensureUser({
    username: "demo",
    password: "password123",
    nickname: "Demo Student",
    avatarUrl: "/avatars/avatar-01.jpg",
  });
  const alex = await ensureUser({
    username: "alex_tum",
    password: "password123",
    nickname: "Alex",
    avatarUrl: "/avatars/avatar-05.jpg",
    bio: "Coffee fan, always looking for study group.",
  });
  const mia = await ensureUser({
    username: "mia_tum",
    password: "password123",
    nickname: "Mia",
    avatarUrl: "/avatars/avatar-09.jpg",
  });

  const ml = await ensureCourse({ name: "Machine Learning", code: "IN2064" });
  const algo = await ensureCourse({ name: "Algorithms", code: "IN2003" });
  const db = await ensureCourse({ name: "Databases", code: "IN2031" });
  const cv = await ensureCourse({ name: "Computer Vision", code: "IN2375" });

  // Popular ML schedule: 2 users on the same times → variant with count=2
  const mlPopular: CourseSpec = {
    name: "Machine Learning",
    code: "IN2064",
    sessions: [
      { weekday: Weekday.MON, start: 10 * 60, end: 12 * 60, location: "MI HS 1" },
      { weekday: Weekday.WED, start: 14 * 60, end: 16 * 60, location: "MI HS 1" },
    ],
    intentions: ["STUDY_TOGETHER", "EXAM_PREP"] as const,
  };
  // Mia is in a different Übung → same course, different fingerprint
  const mlOffbeat: CourseSpec = {
    ...mlPopular,
    sessions: [
      { weekday: Weekday.MON, start: 10 * 60, end: 12 * 60, location: "MI HS 1" },
      { weekday: Weekday.WED, start: 16 * 60, end: 18 * 60, location: "MI 00.13.009A" },
    ],
  };

  const algoSpec: CourseSpec = {
    name: "Algorithms",
    code: "IN2003",
    sessions: [
      { weekday: Weekday.TUE, start: 8 * 60 + 30, end: 10 * 60, location: "MW 2001" },
      { weekday: Weekday.THU, start: 8 * 60 + 30, end: 10 * 60, location: "MW 2001" },
    ],
    intentions: ["STUDY_TOGETHER"] as const,
  };

  const dbSpec: CourseSpec = {
    name: "Databases",
    code: "IN2031",
    sessions: [{ weekday: Weekday.TUE, start: 14 * 60, end: 16 * 60, location: "HS MI" }],
    intentions: ["GO_TO_CLASS_TOGETHER", "EAT_AFTER_CLASS"] as const,
  };

  const cvSpec: CourseSpec = {
    name: "Computer Vision",
    code: "IN2375",
    sessions: [{ weekday: Weekday.FRI, start: 10 * 60, end: 12 * 60, location: "MI 00.13.009A" }],
    intentions: ["STUDY_TOGETHER"] as const,
  };

  await enroll(demo.id, ml.id, mlPopular);
  await enroll(demo.id, algo.id, algoSpec);
  await enroll(demo.id, db.id, dbSpec);
  await enroll(demo.id, cv.id, cvSpec);

  await enroll(alex.id, ml.id, mlPopular);
  await enroll(alex.id, algo.id, algoSpec);

  await enroll(mia.id, ml.id, mlOffbeat);

  console.log(
    `Seeded demo/alex_tum/mia_tum (password: password123) for ${SEMESTER}. Search "IN2064" or "Machine Learning" in /courses/add to see schedule variants.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
