import { prisma } from "../lib/db/prisma";
import { getCurrentSemesterLabel } from "../lib/constants/semester";

async function main() {
  const current = getCurrentSemesterLabel();
  const res = await prisma.course.deleteMany({
    where: { semesterLabel: { not: current } },
  });
  console.log(`Kept semester ${current}; deleted ${res.count} old courses`);
  await prisma.$disconnect();
}
main();
