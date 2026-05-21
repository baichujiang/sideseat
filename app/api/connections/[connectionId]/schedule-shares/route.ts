import { ConnectionStatus, MessageType } from "@prisma/client";

import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { buildDefaultScheduleShareCreatePayload } from "@/lib/schedule-share/default-create-payload";
import { createScheduleShareLinkForUser } from "@/lib/schedule-share/create-schedule-share-link-server";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { requestAppOrigin } from "@/lib/http/request-app-origin";
import { notifyNewDirectChatMessage } from "@/lib/push/notify-user";
import { createScheduleShareSchema } from "@/lib/schedule-share/validation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const auth = await resolveOnboardedUserForApi();
  if (!auth.ok) return error(auth.error, auth.status);

  try {
    const { connectionId } = await params;

    const connection = await prisma.connection.findFirst({
      where: {
        id: connectionId,
        status: ConnectionStatus.ACTIVE,
        OR: [{ userAId: auth.user.id }, { userBId: auth.user.id }],
      },
      select: { id: true },
    });
    if (!connection) {
      return error("Connection not found.", 404);
    }

    let raw: unknown = {};
    try {
      const text = await request.text();
      if (text.trim()) raw = JSON.parse(text);
    } catch {
      return error("Invalid JSON body.", 400);
    }

    const useDefault =
      raw === null ||
      typeof raw !== "object" ||
      Object.keys(raw as object).length === 0;

    const parsed = useDefault
      ? { ok: true as const, data: buildDefaultScheduleShareCreatePayload() }
      : parseBody(raw, createScheduleShareSchema);

    if (!parsed.ok) return error(parsed.error, 400);

    const origin = requestAppOrigin(request);
    let shareUrl: string;
    try {
      const created = await createScheduleShareLinkForUser(prisma, {
        ownerUserId: auth.user.id,
        input: parsed.data,
        appOrigin: origin,
      });
      shareUrl = created.shareUrl;
    } catch (cause) {
      if (cause instanceof Error) {
        if (cause.message === "INVALID_CATEGORIES") {
          return error("One or more calendar categories are invalid.", 400);
        }
        if (cause.message === "EXPIRY_PAST") {
          return error("Expiry must be in the future.", 400);
        }
      }
      throw cause;
    }

    const message = await prisma.message.create({
      data: {
        connectionId,
        senderId: auth.user.id,
        body: shareUrl,
        type: MessageType.SCHEDULE_SHARE_CARD,
      },
    });

    void notifyNewDirectChatMessage({
      connectionId,
      senderId: auth.user.id,
      bodyPreview: "Shared schedule",
    }).catch(() => {});

    return ok({ shareUrl, message }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Could not share schedule in chat.", 500);
  }
}
