import bcrypt from "bcryptjs";
import { prisma } from "../lib/db/prisma";

async function main() {
  const hashed = await bcrypt.hash("password123", 10);
  await prisma.user.upsert({
    where: { username: "empty" },
    update: { hashedPassword: hashed, onboardingComplete: true },
    create: {
      username: "empty",
      hashedPassword: hashed,
      onboardingComplete: true,
      nickname: "Empty User",
      school: "TUM",
      degreeLevel: "MASTER",
      major: "Informatics",
      semester: 1,
      avatarUrl: "/avatars/avatar-03.jpg",
    },
  });
  await prisma.$disconnect();
  console.log("ok");
}
main();
