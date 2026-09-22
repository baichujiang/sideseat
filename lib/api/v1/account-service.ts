import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  deleteVerificationProofsForUser,
  isVerificationProofStorageConfigured,
} from "@/lib/media/verification-proof-storage";

export class AccountServiceError extends Error {
  constructor(
    readonly code: "INVALID_REQUEST" | "NOT_FOUND",
    readonly messageText: string,
  ) {
    super(messageText);
    this.name = "AccountServiceError";
  }
}

export async function deleteAccount(options: {
  userId: string;
  username: string;
  confirmUsername: string;
}) {
  if (options.confirmUsername.trim() !== options.username) {
    throw new AccountServiceError(
      "INVALID_REQUEST",
      "Type your exact username to confirm deletion.",
    );
  }

  const verificationProofs = await prisma.userSchoolVerification.findMany({
    where: { userId: options.userId, manualReviewProofUrl: { not: null } },
    select: { manualReviewProofUrl: true },
  });
  const knownProofUrls = verificationProofs.map((row) => row.manualReviewProofUrl);
  if (isVerificationProofStorageConfigured() || knownProofUrls.length > 0) {
    await deleteVerificationProofsForUser(options.userId, knownProofUrls);
  }

  try {
    await prisma.user.delete({ where: { id: options.userId } });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2025") {
      return { deleted: true as const };
    }
    throw cause;
  }

  return { deleted: true as const };
}
