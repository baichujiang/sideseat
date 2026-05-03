import bcrypt from "bcryptjs";

import { prisma } from "@/lib/db/prisma";

async function main() {
  const hashedPassword = await bcrypt.hash("Password123", 12);

  const user = await prisma.user.upsert({
    where: { username: "unverified-test" },
    update: {
      email: "mia@testmail.com",
      hashedPassword,
      nickname: "Mia",
      school: "TUM",
      degreeLevel: "BACHELOR",
      major: "Informatics",
      semester: 2,
      bio: "Unverified test user for badge preview.",
      avatarUrl: "p13",
      onboardingComplete: true,
      verifiedStudent: false,
      studentVerificationStatus: "UNVERIFIED",
      emailVerifiedAt: null,
      languages: ["ENGLISH"],
    },
    create: {
      username: "unverified-test",
      email: "mia@testmail.com",
      hashedPassword,
      nickname: "Mia",
      school: "TUM",
      degreeLevel: "BACHELOR",
      major: "Informatics",
      semester: 2,
      bio: "Unverified test user for badge preview.",
      avatarUrl: "p13",
      onboardingComplete: true,
      verifiedStudent: false,
      studentVerificationStatus: "UNVERIFIED",
      emailVerifiedAt: null,
      languages: ["ENGLISH"],
    },
    select: {
      id: true,
      username: true,
      email: true,
      school: true,
      verifiedStudent: true,
      studentVerificationStatus: true,
    },
  });

  console.log("Unverified test user ready:", user);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
