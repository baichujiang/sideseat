/**
 * Prints a courseId suitable for E2E_COURSE_ID (first enrollment for user `lin`).
 * Usage: npx tsx scripts/print-e2e-course-id.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.findUnique({
    where: { username: "lin" },
    select: { id: true },
  });
  if (!user) {
    console.error("User `lin` not found — run prisma seed.");
    process.exit(1);
  }
  const row = await prisma.userCourse.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    select: { courseId: true },
  });
  if (!row) {
    console.error("No userCourse for lin.");
    process.exit(1);
  }
  console.log(`export E2E_COURSE_ID=${row.courseId}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
