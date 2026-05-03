import { addDays, endOfDay, max, min, startOfDay } from "date-fns";
import { ConnectionStatus } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { availabilityShareSchema } from "@/lib/validators/chat-planning";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { connectionId } = await params;
    const values = await parseJson(request, availabilityShareSchema);

    const connection = await prisma.connection.findFirst({
      where: {
        id: connectionId,
        status: ConnectionStatus.ACTIVE,
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
      select: { id: true },
    });

    if (!connection) {
      return error("Connection not found.", 404);
    }

    let rangeStart: Date;
    let rangeEnd: Date;
    let includedDates: string[] | undefined;

    if (values.includedDates?.length) {
      const unique = [...new Set(values.includedDates)].sort();
      const parsed = unique.map((ds) => new Date(`${ds}T12:00:00`));
      if (parsed.some((d) => Number.isNaN(d.getTime()))) {
        return error("Invalid dates in selection.", 400);
      }
      rangeStart = startOfDay(min(parsed));
      rangeEnd = endOfDay(max(parsed));
      includedDates = unique;
    } else {
      rangeStart = new Date(values.rangeStart!);
      rangeEnd = new Date(values.rangeEnd!);
      includedDates = undefined;
    }

    const expiresAt = values.expiresAt ? new Date(values.expiresAt) : addDays(new Date(), 7);

    const result = await prisma.$transaction(async (tx) => {
      const share = await tx.availabilityShare.create({
        data: {
          ownerUserId: user.id,
          connectionId,
          visibilityMode: values.visibilityMode,
          rangeStart,
          rangeEnd,
          includedDates: includedDates ?? undefined,
          expiresAt,
        },
      });

      const message = await tx.message.create({
        data: {
          connectionId,
          senderId: user.id,
          body: "",
          type: "AVAILABILITY_CARD",
          availabilityShareId: share.id,
        },
      });

      return { share, message };
    });

    return ok(result, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to share availability.");
  }
}
