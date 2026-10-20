import "server-only";
import { prisma } from "@/lib/db/prisma";
import { TimePollError } from "@/lib/api/v1/time-poll-service";
import { lockPollPlan } from "@/lib/time-polls/planning";
import { guestRecoveryUrl, guestSecret, pendingGuestHash } from "@/lib/time-polls/guest-credentials";

// Only the organizer can reissue access to an unclaimed legacy record. Once the
// guest redeems it, the record is secured and this migration route cannot reset it.
export async function issueLegacyGuestRecovery(token: string, userId: string, participantId: string, origin: string) {
  const secret = guestSecret();
  const guestId = await prisma.$transaction(async tx => {
    const poll = await lockPollPlan(tx, token, userId);
    if (!poll || poll.creatorId !== userId) throw new TimePollError(404, "Plan unavailable.");
    const response = await tx.timePollResponse.findFirst({ where: { id: participantId, pollId: poll.id } });
    const invitation = response ? null : await tx.timePollInvitation.findFirst({ where: { id: participantId, pollId: poll.id } });
    const id = response?.guestId ?? invitation?.guestId;
    const guest = id ? await tx.timePollGuest.findFirst({ where: { id, pollId: poll.id } }) : null;
    if (!guest) throw new TimePollError(404, "Guest response unavailable.");
    if (guest.credentialHash.startsWith("v2:")) throw new TimePollError(409, "This guest already has private access. Ask them to use their personal recovery link.");
    const issued = await tx.timePollGuest.updateMany({ where: { id: guest.id, credentialHash: guest.credentialHash }, data: { credentialHash: pendingGuestHash(secret) } });
    if (!issued.count) throw new TimePollError(409, "This guest already has private access. Ask them to use their personal recovery link.");
    return guest.id;
  });
  return { recoveryUrl: guestRecoveryUrl(token, `${guestId}.${secret}`, origin) };
}
