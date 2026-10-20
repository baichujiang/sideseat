import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Success } from "@/lib/api/v1/http";
import { timePollFailure, updateTimePollDetails } from "@/lib/api/v1/time-poll-service";
import { requestAppOrigin } from "@/lib/http/request-app-origin";
import { updateTimePollDetailsSchema } from "@/lib/time-polls/domain";

export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ token: string }> }) {
  const auth = await requireV1User(request); if (!auth.ok) return auth.response;
  const parsed = await parseV1Json(request, updateTimePollDetailsSchema); if (!parsed.ok) return parsed.response;
  try {
    return v1Success(await updateTimePollDetails((await context.params).token, auth.user.id, parsed.data, requestAppOrigin(request)), { request });
  } catch (cause) { return timePollFailure(request, cause); }
}
