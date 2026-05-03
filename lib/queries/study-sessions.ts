import { Prisma } from "@prisma/client";

import { calendarTitleForActivity, type ActivityTypeValue } from "@/lib/constants/activities";

/**
 * Materialize CalendarEntry rows for both participants of a 1:1 proposal.
 * Safe to call multiple times — `(userId, proposalId)` is unique.
 *
 * The title embeds the other side's nickname so the row reads nicely in
 * the calendar ("Lunch w/ Lin", "Study w/ Lin") without needing a join at
 * render time.
 */
export async function materializeCalendarEntries(
  tx: Prisma.TransactionClient,
  args: {
    proposalId: string;
    activityType: ActivityTypeValue;
    startAt: Date;
    endAt: Date;
    location: string | null;
    userAId: string;
    userBId: string;
    userANickname: string | null;
    userBNickname: string | null;
  },
): Promise<void> {
  const { proposalId, activityType, startAt, endAt, location } = args;

  await tx.calendarEntry.createMany({
    data: [
      {
        userId: args.userAId,
        proposalId,
        title: calendarTitleForActivity(activityType, args.userBNickname),
        location: location ?? null,
        startAt,
        endAt,
      },
      {
        userId: args.userBId,
        proposalId,
        title: calendarTitleForActivity(activityType, args.userANickname),
        location: location ?? null,
        startAt,
        endAt,
      },
    ],
    skipDuplicates: true,
  });
}
