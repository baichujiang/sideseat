import "server-only";
import type { Prisma } from "@prisma/client";
import { userConnectionSafetyLocks } from "@/lib/v2/action-coordination/db-locks";

/** All plan writes take member safety locks before the plan row, matching Block. */
export async function lockPollPlan(tx: Prisma.TransactionClient, token: string, actorId: string | null, extraUserIds: string[] = []) {
  const snapshot = await tx.timePoll.findUnique({ where: { token }, include: { invitations: true, responses: true } });
  if (!snapshot) return null;
  await userConnectionSafetyLocks(tx, [actorId, snapshot.creatorId, ...snapshot.invitations.map((i) => i.userId), ...snapshot.responses.map((r) => r.userId), ...extraUserIds].filter((id): id is string => id !== null));
  await tx.$queryRaw`SELECT "id" FROM "TimePoll" WHERE "id" = ${snapshot.id} FOR UPDATE`;
  return tx.timePoll.findUnique({ where: { id: snapshot.id }, include: { invitations: true, responses: true } });
}

export async function hasPlanningBlock(tx: Prisma.TransactionClient, userIds: string[]) {
  return Boolean(await tx.block.findFirst({ where: { blockerId: { in: userIds }, blockedId: { in: userIds } }, select: { id: true } }));
}

export async function cancelPollPlansForUsers(tx: Prisma.TransactionClient, userIds: string[], requireAll = false) {
  const rows = await tx.timePoll.findMany({
    where: { phase: { in: ["INVITING", "CONFIRMED"] },
      ...(requireAll ? { AND: userIds.map((userId) => ({ invitations: { some: { userId, selected: true } } })) }
        : { invitations: { some: { userId: { in: userIds }, selected: true } } }) },
    select: { id: true }, orderBy: { id: "asc" },
  });
  for (const row of rows) {
    await tx.$queryRaw`SELECT "id" FROM "TimePoll" WHERE "id" = ${row.id} FOR UPDATE`;
    await tx.timePoll.update({ where: { id: row.id }, data: { phase: "CANCELLED", canceledAt: new Date() } });
    await tx.calendarEntry.deleteMany({ where: { timePollId: row.id } });
  }
}
