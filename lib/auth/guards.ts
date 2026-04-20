import "server-only";

import { notFound, redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { ConnectionStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { adminEmails } from "@/lib/constants/app";

export async function requireOnboardedUser() {
  const user = await requireUser();

  if (!user.onboardingComplete) {
    redirect("/onboarding");
  }

  return user;
}

export async function requireConnection(connectionId: string) {
  const user = await requireOnboardedUser();
  const connection = await prisma.connection.findFirst({
    where: {
      id: connectionId,
      status: ConnectionStatus.ACTIVE,
      userA: {
        moderationBlocks: {
          none: {
            isActive: true,
          },
        },
      },
      userB: {
        moderationBlocks: {
          none: {
            isActive: true,
          },
        },
      },
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
    include: {
      userA: true,
      userB: true,
      invitation: {
        include: {
          course: true,
        },
      },
      messages: {
        include: {
          sender: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      },
      contactExchangeRequests: {
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!connection) {
    notFound();
  }

  return { connection, user };
}

/** Admin actions require a verified admin email on the account (guest/username-only accounts cannot be admins). */
export async function requireAdminUser(): Promise<User & { email: string }> {
  const user = await requireOnboardedUser();
  const email = user.email?.toLowerCase();

  if (!email || !adminEmails.includes(email)) {
    redirect("/home");
  }

  return { ...user, email };
}
