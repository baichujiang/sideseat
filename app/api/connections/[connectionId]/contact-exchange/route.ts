import { ContactExchangeStatus, ConnectionStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { CONTACT_EXCHANGE_DECLINE_COOLDOWN_HOURS } from "@/lib/constants/app";
import { prisma } from "@/lib/db/prisma";
import { safeReturnPath } from "@/lib/nav/back";

/**
 * Contact exchange actions on a 1:1 connection. States live on
 * `ContactExchangeRequest` and are reduced into a UI state by
 * `deriveContactExchangeState`.
 *
 *  - `request` → the viewer asks to exchange handles. Rejected if an
 *    ACCEPTED row already exists, a PENDING row already exists in either
 *    direction, or if the last DECLINED/CANCELED row is still within the
 *    cooldown window.
 *  - `accept`  → the responder of the PENDING row flips it to ACCEPTED.
 *                Both sides' handles become visible.
 *  - `decline` → the responder of the PENDING row flips it to DECLINED.
 *                Re-request locked for `CONTACT_EXCHANGE_DECLINE_COOLDOWN_HOURS`.
 *  - `cancel`  → the requester of the PENDING row withdraws it (CANCELED).
 *
 * The form posts carry `action` and we always redirect back to a sensible
 * surface (the chat by default, or whatever `returnTo` the form sends).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const user = await requireOnboardedUser();
  const { connectionId } = await params;
  const formData = await request.formData();
  const action = formData.get("action");
  const returnToRaw = formData.get("returnTo");

  const connection = await prisma.connection.findFirst({
    where: {
      id: connectionId,
      status: ConnectionStatus.ACTIVE,
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
    include: {
      contactExchangeRequests: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!connection) {
    return NextResponse.redirect(new URL("/inbox", request.url));
  }

  const otherUserId =
    connection.userAId === user.id ? connection.userBId : connection.userAId;

  if (action === "request") {
    const alreadyAccepted = connection.contactExchangeRequests.some(
      (r) => r.status === ContactExchangeStatus.ACCEPTED,
    );
    const alreadyPending = connection.contactExchangeRequests.some(
      (r) => r.status === ContactExchangeStatus.PENDING,
    );
    if (!alreadyAccepted && !alreadyPending) {
      const latest = connection.contactExchangeRequests[0];
      const cooldownMs =
        CONTACT_EXCHANGE_DECLINE_COOLDOWN_HOURS * 60 * 60 * 1000;
      const blockedByCooldown =
        latest &&
        (latest.status === ContactExchangeStatus.DECLINED ||
          latest.status === ContactExchangeStatus.CANCELED) &&
        latest.updatedAt.getTime() + cooldownMs > Date.now();

      if (!blockedByCooldown) {
        await prisma.contactExchangeRequest.create({
          data: {
            connectionId,
            requesterId: user.id,
            responderId: otherUserId,
            status: ContactExchangeStatus.PENDING,
          },
        });
      }
    }
  }

  if (action === "accept") {
    await prisma.contactExchangeRequest.updateMany({
      where: {
        connectionId,
        responderId: user.id,
        status: ContactExchangeStatus.PENDING,
      },
      data: { status: ContactExchangeStatus.ACCEPTED },
    });
  }

  if (action === "decline") {
    await prisma.contactExchangeRequest.updateMany({
      where: {
        connectionId,
        responderId: user.id,
        status: ContactExchangeStatus.PENDING,
      },
      data: { status: ContactExchangeStatus.DECLINED },
    });
  }

  if (action === "cancel") {
    await prisma.contactExchangeRequest.updateMany({
      where: {
        connectionId,
        requesterId: user.id,
        status: ContactExchangeStatus.PENDING,
      },
      data: { status: ContactExchangeStatus.CANCELED },
    });
  }

  const returnTo = safeReturnPath(
    typeof returnToRaw === "string" ? returnToRaw : null,
    `/connections/${connectionId}`,
  );

  return NextResponse.redirect(new URL(returnTo, request.url));
}
