import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { notifyUserPush } from "@/lib/push/notify-user";

/** Snapshot recipients at publication; pending/declined people never receive this alert. */
export function schedulePublishedPollNotification(token: string, recipientIds: string[]) {
  after(async () => {
    const poll = await prisma.timePoll.findUnique({ where: { token }, select: {
      title: true, phase: true, creatorId: true,
      invitations: { where: { userId: { in: recipientIds }, selected: true, status: "ACCEPTED" }, select: { userId: true } },
    } });
    if (poll?.phase !== "CONFIRMED") return;
    await Promise.all(poll.invitations.map(async person => {
      if (!person.userId) return;
      const blocked = await prisma.block.findFirst({ where: { OR: [
        { blockerId: poll.creatorId, blockedId: person.userId }, { blockerId: person.userId, blockedId: poll.creatorId },
      ] }, select: { id: true } });
      if (blocked) return;
      await notifyUserPush(person.userId, {
        title: "Your plan is confirmed", body: poll.title, url: `/time-polls/${token}`,
        threadId: `time-poll:${token}`, category: "PLAN_UPDATE", data: { kind: "time_poll_confirmed", timePollToken: token },
      });
    }));
  });
}
