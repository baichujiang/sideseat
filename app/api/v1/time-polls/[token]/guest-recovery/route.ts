import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Success } from "@/lib/api/v1/http";
import { timePollFailure } from "@/lib/api/v1/time-poll-service";
import { requestAppOrigin } from "@/lib/http/request-app-origin";
import { guestParticipantSchema } from "@/lib/time-polls/public-session";
import { issueLegacyGuestRecovery } from "@/lib/time-polls/guest-recovery";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const auth = await requireV1User(request); if (!auth.ok) return auth.response;
  const parsed = await parseV1Json(request, guestParticipantSchema.strict()); if (!parsed.ok) return parsed.response;
  try {
    return v1Success(await issueLegacyGuestRecovery((await context.params).token, auth.user.id, parsed.data.participantId, requestAppOrigin(request)), { request });
  } catch (cause) { return timePollFailure(request, cause); }
}
