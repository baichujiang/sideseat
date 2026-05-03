import { prisma } from "../lib/db/prisma";
import { getCurrentSemesterLabel } from "../lib/constants/semester";

async function main() {
  const sem = getCurrentSemesterLabel();
  const empty = await prisma.user.findUnique({ where: { username: "empty" } });
  const ml = await prisma.course.findFirst({ where: { code: "IN2064", semesterLabel: sem } });
  if (!empty || !ml) { console.log("missing"); process.exit(1); }
  await prisma.userCourse.upsert({
    where: { userId_courseId: { userId: empty.id, courseId: ml.id } },
    update: {},
    create: { userId: empty.id, courseId: ml.id, intentions: ["STUDY_TOGETHER"] },
  });
  console.log("joined", ml.id);
  await prisma.$disconnect();
}
main();
