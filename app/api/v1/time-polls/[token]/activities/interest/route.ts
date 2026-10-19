import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Success } from "@/lib/api/v1/http";
import { setPollActivityInterest, timePollFailure } from "@/lib/api/v1/time-poll-service";
import { pollActivityInterestSchema } from "@/lib/time-polls/domain";
import { requestAppOrigin } from "@/lib/http/request-app-origin";
export const dynamic = "force-dynamic";
export async function PUT(request: Request, context: { params: Promise<{ token: string }> }) {
  const auth = await requireV1User(request); if (!auth.ok) return auth.response;
  const parsed = await parseV1Json(request, pollActivityInterestSchema); if (!parsed.ok) return parsed.response;
  try { return v1Success(await setPollActivityInterest((await context.params).token, auth.user.id, parsed.data, requestAppOrigin(request)), { request }); }
  catch (cause) { return timePollFailure(request, cause); }
}
