import type { Prisma, PrismaClient, StudentVerificationStatus, UserSchoolVerification } from "@prisma/client";

type VerificationStateLike = Pick<
  UserSchoolVerification,
  | "email"
  | "verifiedStudent"
  | "studentVerificationStatus"
  | "emailVerifiedAt"
  | "studentVerificationNotes"
  | "manualReviewProofUrl"
  | "manualReviewProofFilename"
  | "manualReviewRequestedAt"
>;

type SchoolVerificationStateInput = Partial<VerificationStateLike>;

export function userVerificationFieldsFromState(
  state: VerificationStateLike | null | undefined,
): Prisma.UserUpdateInput {
  return {
    email: state?.email ?? null,
    verifiedStudent: state?.verifiedStudent ?? false,
    studentVerificationStatus: state?.studentVerificationStatus ?? "UNVERIFIED",
    emailVerifiedAt: state?.emailVerifiedAt ?? null,
    studentVerificationNotes: state?.studentVerificationNotes ?? null,
    manualReviewProofUrl: state?.manualReviewProofUrl ?? null,
    manualReviewProofFilename: state?.manualReviewProofFilename ?? null,
    manualReviewRequestedAt: state?.manualReviewRequestedAt ?? null,
  };
}

export async function mirrorSchoolVerificationToUser(
  tx: Prisma.TransactionClient | PrismaClient,
  userId: string,
  school: string,
) {
  const state = await tx.userSchoolVerification.findUnique({
    where: {
      userId_school: {
        userId,
        school,
      },
    },
  });

  await tx.user.update({
    where: { id: userId },
    data: userVerificationFieldsFromState(state),
  });
}

export async function upsertSchoolVerificationState(
  tx: Prisma.TransactionClient | PrismaClient,
  userId: string,
  school: string,
  data: SchoolVerificationStateInput,
) {
  return tx.userSchoolVerification.upsert({
    where: {
      userId_school: {
        userId,
        school,
      },
    },
    create: {
      userId,
      school,
      ...data,
    },
    update: data,
  });
}

export function verificationStatusIsVerified(status: StudentVerificationStatus) {
  return status === "VERIFIED";
}
