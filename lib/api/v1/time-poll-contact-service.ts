import "server-only";

import { prisma } from "@/lib/db/prisma";
import { activeDirectConnectionWhere, createDirectMessageRecord, PeerReplyRequiredError } from "@/lib/chat/direct-message-service";
import { scheduleNewDirectChatMessageNotification } from "@/lib/push/notify-user";
import { hasPlanningBlock, lockPollPlan } from "@/lib/time-polls/planning";
import { timePollPhase } from "@/lib/time-polls/lifecycle";
import { getTimePoll, TimePollError } from "@/lib/api/v1/time-poll-service";

/** Uses existing invitation membership and readable TEXT messages; older clients remain usable. */
export async function sharePollWithContacts(token: string, userId: string,
  input: { connectionIds: string[]; version: number }, appOrigin: string) {
  const ids = [...new Set(input.connectionIds)].sort();
  const contacts = await prisma.connection.findMany({
    where: { ...activeDirectConnectionWhere("", userId), id: { in: ids }, friendLink: { is: { status: "ACCEPTED" } } },
    select: { id: true, userAId: true, userBId: true },
  });
  if (contacts.length !== ids.length) throw new TimePollError(404, "One of these contacts is unavailable. Refresh your contacts.");
  const peers = contacts.map(c => c.userAId === userId ? c.userBId : c.userAId);
  const deliveries = await prisma.$transaction(async tx => {
    const poll = await lockPollPlan(tx, token, userId, peers);
    if (!poll || poll.creatorId !== userId) throw new TimePollError(404, "Plan unavailable.");
    const phase = timePollPhase(poll);
    if (!["COLLECTING", "INVITING", "CONFIRMED"].includes(phase)
      || (poll.chosenStart && poll.chosenStart <= new Date())) throw new TimePollError(409, "This plan has ended or expired.");
    if (poll.invitationVersion !== input.version) throw new TimePollError(409, "This plan changed. Reopen it before inviting contacts.");
    const current = await tx.connection.findMany({ where: {
      ...activeDirectConnectionWhere("", userId), id: { in: ids }, friendLink: { is: { status: "ACCEPTED" } },
    }, include: { userA: { select: { id: true, nickname: true, username: true } }, userB: { select: { id: true, nickname: true, username: true } } }, orderBy: { id: "asc" } });
    if (current.length !== ids.length || await hasPlanningBlock(tx, [userId, ...peers])) throw new TimePollError(404, "One of these contacts is unavailable. Refresh your contacts.");
    const members = new Set((phase === "COLLECTING" ? [...poll.responses, ...poll.invitations] : poll.invitations.filter(i => i.selected))
      .filter(person => person.userId !== userId).map(person => person.userId ? `user:${person.userId}` : `guest:${person.guestId}`));
    for (const peerId of peers) members.add(`user:${peerId}`);
    const capacity = phase === "COLLECTING" || poll.planningMode === "FIXED" ? poll.expectedCount ?? 20 : 20;
    if (members.size + 1 > capacity) throw new TimePollError(409, "This plan's participant list is full. Choose fewer contacts.");
    const sent: { connectionId: string; messageId: string }[] = [];
    for (const contact of current) {
      const peer = contact.userAId === userId ? contact.userB : contact.userA;
      // A delivered card is durable membership even before the recipient opens it.
      const previous = poll.invitations.find(i => i.userId === peer.id);
      if (previous) continue;
      await tx.timePollInvitation.create({ data: { pollId: poll.id, userId: peer.id,
        displayName: peer.nickname?.trim() || peer.username, version: poll.invitationVersion,
        selected: phase !== "COLLECTING", status: phase === "COLLECTING" ? "SHARED" : "INVITED" } });
      try {
        const { message } = await createDirectMessageRecord(tx, { connectionId: contact.id, senderId: userId,
          input: { type: "TEXT", body: `📅 ${poll.title}\n${appOrigin}/time-polls/${poll.token}` } });
        sent.push({ connectionId: contact.id, messageId: message.id });
      } catch (cause) {
        if (cause instanceof PeerReplyRequiredError) throw new TimePollError(409, cause.message);
        throw cause;
      }
    }
    if (sent.length) await tx.timePoll.update({ where: { id: poll.id }, data: { updatedAt: new Date() } });
    return sent;
  });
  const poll = await getTimePoll(token, userId, appOrigin);
  for (const delivery of deliveries) scheduleNewDirectChatMessageNotification({ connectionId: delivery.connectionId, senderId: userId,
    bodyPreview: poll.title, kind: "plan_invite", planTitle: poll.title });
  return { poll, deliveries };
}
