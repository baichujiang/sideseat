import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { queueAccountMediaDeletion, processMediaDeletionJobs } from "@/lib/media/lifecycle";

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

  return eraseAccountRecords(options.userId);
}

export async function eraseAccountRecords(userId: string) {
  try {
    const urls = await prisma.$transaction(async tx => {
      const urls = await queueAccountMediaDeletion(tx, userId);
      await tx.user.delete({ where: { id: userId } });
      return urls;
    });
    // The account deletion has committed. A worker outage must not turn it into
    // an apparent failed deletion; the transaction already persisted retries.
    await processMediaDeletionJobs({ urls, limit: 100 }).catch(cause => {
      console.error("Account media cleanup deferred to cron", { error: cause instanceof Error ? cause.name : "UnknownError" });
    });
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2025") {
      return { deleted: true as const };
    }
    throw cause;
  }

  return { deleted: true as const };
}
