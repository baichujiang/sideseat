import { z } from "zod";
import { parseV1Json, v1Success } from "@/lib/api/v1/http";
import { timePollFailure } from "@/lib/api/v1/time-poll-service";
import { requestAppOrigin } from "@/lib/http/request-app-origin";
import { guestCredentialSchema } from "@/lib/time-polls/guest-credentials";
import { guestParticipantSchema, publicPollGuard, publicPollRecoveryLink, recoverPublicPollGuest } from "@/lib/time-polls/public-session";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { token } = await context.params;
    await publicPollGuard(request, token);
    const { participantId } = guestParticipantSchema.parse({ participantId: new URL(request.url).searchParams.get("participantId") });
    return v1Success(await publicPollRecoveryLink(token, participantId, requestAppOrigin(request)), { request });
  } catch (cause) { return timePollFailure(request, cause); }
}
export async function POST(request: Request, context: Context) {
  try {
    const { token } = await context.params;
    await publicPollGuard(request, token, true, true);
    const parsed = await parseV1Json(request, z.object({ credential: guestCredentialSchema }).strict());
    if (!parsed.ok) return parsed.response;
    return v1Success(await recoverPublicPollGuest(token, parsed.data.credential, requestAppOrigin(request)), { request });
  } catch (cause) { return timePollFailure(request, cause); }
}
