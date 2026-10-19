import { parseV1Json, v1Success } from "@/lib/api/v1/http";
import { saveTimePollResponse, timePollFailure } from "@/lib/api/v1/time-poll-service";
import { requestAppOrigin } from "@/lib/http/request-app-origin";
import { saveTimePollResponseSchema } from "@/lib/time-polls/domain";
import { guestParticipantSchema, publicPollGuard, publicPollGuest } from "@/lib/time-polls/public-session";
export const dynamic = "force-dynamic";
export async function PUT(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    await publicPollGuard(request, token, true);
    const parsed = await parseV1Json(request, saveTimePollResponseSchema.merge(guestParticipantSchema).strict()); if (!parsed.ok) return parsed.response;
    const guest = await publicPollGuest(token, parsed.data.participantId);
    const data = await saveTimePollResponse(token, { guestId: guest!.id }, { ...parsed.data, displayName: guest!.displayName }, requestAppOrigin(request));
    return v1Success({ ...data, viewerId: guest!.id }, { request });
  } catch (cause) { return timePollFailure(request, cause); }
}
