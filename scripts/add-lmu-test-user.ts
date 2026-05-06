import bcrypt from "bcryptjs";
import { LanguageProficiency, LanguageTag } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

const demoLangsUpdate = {
  deleteMany: {} as const,
  create: [
    { tag: LanguageTag.ENGLISH, proficiency: LanguageProficiency.FLUENT },
    { tag: LanguageTag.GERMAN, proficiency: LanguageProficiency.FLUENT },
  ],
};
const demoLangsCreate = {
  create: [
    { tag: LanguageTag.ENGLISH, proficiency: LanguageProficiency.FLUENT },
    { tag: LanguageTag.GERMAN, proficiency: LanguageProficiency.FLUENT },
  ],
};

async function main() {
  const hashedPassword = await bcrypt.hash("Password123", 12);

  const user = await prisma.user.upsert({
    where: { username: "lmu-test" },
    update: {
      email: "anna@lmu.de",
      hashedPassword,
      nickname: "Anna",
      school: "LMU",
      degreeLevel: "BACHELOR",
      major: "Informatics",
      semester: 2,
      bio: "LMU test user for school badge preview.",
      avatarUrl: "p12",
      onboardingComplete: true,
      verifiedStudent: true,
      studentVerificationStatus: "VERIFIED",
      emailVerifiedAt: new Date(),
      userLanguages: demoLangsUpdate,
    },
    create: {
      username: "lmu-test",
      email: "anna@lmu.de",
      hashedPassword,
      nickname: "Anna",
      school: "LMU",
      degreeLevel: "BACHELOR",
      major: "Informatics",
      semester: 2,
      bio: "LMU test user for school badge preview.",
      avatarUrl: "p12",
      onboardingComplete: true,
      verifiedStudent: true,
      studentVerificationStatus: "VERIFIED",
      emailVerifiedAt: new Date(),
      userLanguages: demoLangsCreate,
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

  console.log("LMU test user ready:", user);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
