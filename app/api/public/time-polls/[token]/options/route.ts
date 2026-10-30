import { parseV1Json, v1Success } from "@/lib/api/v1/http";
import { suggestPollOption, timePollFailure, TimePollError } from "@/lib/api/v1/time-poll-service";
import { suggestPollOptionSchema } from "@/lib/time-polls/domain";
import { guestParticipantSchema, publicPollData, publicPollGuard, publicPollGuest } from "@/lib/time-polls/public-session";
import { requestAppOrigin } from "@/lib/http/request-app-origin";

export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params; await publicPollGuard(request, token, true);
    const parsed = await parseV1Json(request, suggestPollOptionSchema.merge(guestParticipantSchema).strict()); if (!parsed.ok) return parsed.response;
    const { participantId, ...input } = parsed.data;
    const guest = await publicPollGuest(token, participantId);
    if (!guest) throw new TimePollError(401, "Enter your name before suggesting an option.");
    await suggestPollOption(token, { guestId: guest.id }, input, requestAppOrigin(request));
    return v1Success(await publicPollData(token, requestAppOrigin(request)), { request });
  } catch (cause) { return timePollFailure(request, cause); }
}
