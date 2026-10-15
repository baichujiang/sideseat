import { parseV1Json, v1Success } from "@/lib/api/v1/http";
import { renameTimePollParticipant, timePollFailure } from "@/lib/api/v1/time-poll-service";
import { requestAppOrigin } from "@/lib/http/request-app-origin";
import { timePollDisplayNameSchema } from "@/lib/time-polls/domain";
import { guestParticipantSchema, joinPublicPoll, pollParticipantCookie, pollParticipantCookieOptions, publicPollData, publicPollGuard, publicPollGuest } from "@/lib/time-polls/public-session";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };
export async function POST(request: Request, context: Context) {
  try {
    const { token } = await context.params;
    await publicPollGuard(request, token, true, true);
    const parsed = await parseV1Json(request, timePollDisplayNameSchema); if (!parsed.ok) return parsed.response;
    const joined = await joinPublicPoll(token, parsed.data.displayName, requestAppOrigin(request));
    const response = v1Success(joined.data, { request });
    response.cookies.set(pollParticipantCookie, joined.participantId, pollParticipantCookieOptions(token));
    return response;
  } catch (cause) { return timePollFailure(request, cause); }
}
export async function PATCH(request: Request, context: Context) {
  try {
    const { token } = await context.params;
    await publicPollGuard(request, token, true);
    const parsed = await parseV1Json(request, timePollDisplayNameSchema.merge(guestParticipantSchema).strict()); if (!parsed.ok) return parsed.response;
    const guest = await publicPollGuest(token, parsed.data.participantId);
    await renameTimePollParticipant(token, { guestId: guest!.id }, parsed.data.displayName, requestAppOrigin(request));
    return v1Success(await publicPollData(token, requestAppOrigin(request)), { request });
  } catch (cause) { return timePollFailure(request, cause); }
}
