import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";
import {
  getAvailabilityDaysForUser,
  isAvailabilityShareActive,
  normalizeAvailabilityIncludedDates,
} from "@/lib/queries/chat-planning";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { shareId } = await params;

    const share = await prisma.availabilityShare.findFirst({
      where: {
        id: shareId,
        connection: {
          OR: [{ userAId: user.id }, { userBId: user.id }],
        },
      },
      include: {
        owner: {
          select: { id: true, nickname: true, username: true },
        },
      },
    });

    if (!share) {
      return error("Availability not found.", 404);
    }

    const status = share.isRevoked
      ? "revoked"
      : !isAvailabilityShareActive(share)
        ? "expired"
        : "active";

    const included = normalizeAvailabilityIncludedDates(share.includedDates);

    const days =
      status === "active"
        ? await prisma.$transaction((tx) =>
            getAvailabilityDaysForUser(
              tx,
              share.ownerUserId,
              share.rangeStart,
              share.rangeEnd,
              included,
            ),
          )
        : [];

    return ok({
      id: share.id,
      owner: {
        id: share.owner.id,
        name: share.owner.nickname ?? share.owner.username,
      },
      visibilityMode: share.visibilityMode,
      status,
      rangeStart: share.rangeStart.toISOString(),
      rangeEnd: share.rangeEnd.toISOString(),
      days: days.map((day) => ({
        date: day.date,
        slots: day.slots.map((slot) => ({
          startTime: slot.startTime.toISOString(),
          endTime: slot.endTime.toISOString(),
          status: slot.status,
          canSuggest: slot.canSuggest,
        })),
      })),
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to load availability.");
  }
}
