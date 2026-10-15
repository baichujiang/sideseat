import { parseV1Json, v1Success } from "@/lib/api/v1/http";
import { respondPollInvitation, timePollFailure } from "@/lib/api/v1/time-poll-service";
import { requestAppOrigin } from "@/lib/http/request-app-origin";
import { respondPollInvitationSchema } from "@/lib/time-polls/domain";
import { guestParticipantSchema, publicPollData, publicPollGuard, publicPollGuest } from "@/lib/time-polls/public-session";
export const dynamic = "force-dynamic";
export async function PUT(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    await publicPollGuard(request, token, true);
    const parsed = await parseV1Json(request, respondPollInvitationSchema.merge(guestParticipantSchema).strict()); if (!parsed.ok) return parsed.response;
    const guest = await publicPollGuest(token, parsed.data.participantId);
    await respondPollInvitation(token, { guestId: guest!.id }, parsed.data, requestAppOrigin(request));
    return v1Success(await publicPollData(token, requestAppOrigin(request)), { request });
  } catch (cause) { return timePollFailure(request, cause); }
}
