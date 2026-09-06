/**
 * Creates exactly two fresh, verified QA-only users for the destructive
 * Mutual Opportunity production smoke. Existing users are never updated.
 *
 * Required:
 *   SIDESEAT_QA_USERS=qa_mutual_<run>_a,qa_mutual_<run>_b
 *   SIDESEAT_QA_PASSWORD=<qa-only password>
 */
import {
  DegreeLevel,
  LanguageProficiency,
  LanguageTag,
  StudentVerificationMethod,
  StudentVerificationStatus,
} from "@prisma/client";

import { nicknameToKey } from "@/lib/auth/nickname-key";
import { hashPassword } from "@/lib/auth/password";
import { getSchoolMatchValues } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";

const usernamePattern = /^qa_mutual_[a-z0-9_]{1,40}$/;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function qaUsernames(): [string, string] {
  const values = requiredEnvironment("SIDESEAT_QA_USERS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    values.length !== 2 ||
    values[0] === values[1] ||
    values.some((value) => !usernamePattern.test(value))
  ) {
    throw new Error(
      "SIDESEAT_QA_USERS must contain two distinct qa_mutual_* usernames.",
    );
  }
  return [values[0]!, values[1]!];
}

async function main() {
  const usernames = qaUsernames();
  const password = requiredEnvironment("SIDESEAT_QA_PASSWORD");
  const hashedPassword = await hashPassword(password);
  const now = new Date();

  const created = await prisma.$transaction(async (tx) => {
    const conflictingPoolMember = await tx.weeklyIntent.findFirst({
      where: {
        status: "ACTIVE",
        expiresAt: { gt: now },
        topic: "STUDY",
        user: {
          school: { in: getSchoolMatchValues("LMU") },
          verifiedStudent: true,
          userLanguages: { some: { tag: LanguageTag.HINDI } },
        },
      },
      select: { user: { select: { username: true } } },
    });
    if (conflictingPoolMember) {
      throw new Error(
        "Refusing to create smoke users while a compatible LMU/HINDI STUDY intent is active.",
      );
    }

    const existing = await tx.user.findMany({
      where: { username: { in: usernames } },
      select: { username: true },
    });
    if (existing.length > 0) {
      throw new Error(
        `Refusing to modify existing QA users: ${existing
          .map((user) => user.username)
          .join(", ")}`,
      );
    }

    return Promise.all(
      usernames.map((username, index) => {
        const nickname = `Mutual QA ${index + 1}`;
        return tx.user.create({
          data: {
            username,
            hashedPassword,
            nickname,
            nicknameKey: nicknameToKey(nickname),
            // The uncommon combination isolates this state-changing smoke from
            // tester and real-user matching pools without changing their data.
            school: "LMU",
            degreeLevel: DegreeLevel.BACHELOR,
            major: "QA",
            semester: 1,
            avatarUrl: index === 0 ? "p02" : "p07",
            bio: "Mutual Opportunity production smoke account",
            onboardingComplete: true,
            productTutorialDismissedAt: now,
            verifiedStudent: true,
            studentVerificationStatus: StudentVerificationStatus.VERIFIED,
            studentVerificationMethod: StudentVerificationMethod.MANUAL_DOCUMENT,
            studentVerifiedAt: now,
            isGuest: false,
            userLanguages: {
              create: [
                {
                  tag: LanguageTag.HINDI,
                  proficiency: LanguageProficiency.FLUENT,
                },
              ],
            },
          },
          select: { username: true },
        });
      }),
    );
  });

  console.log(
    JSON.stringify({
      status: "CREATED",
      users: created.map((user) => user.username),
      existingUsersModified: 0,
    }),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
