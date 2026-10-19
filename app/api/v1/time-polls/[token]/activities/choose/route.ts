import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Success } from "@/lib/api/v1/http";
import { choosePollActivity, timePollFailure } from "@/lib/api/v1/time-poll-service";
import { choosePollActivitySchema } from "@/lib/time-polls/domain";
import { requestAppOrigin } from "@/lib/http/request-app-origin";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const auth = await requireV1User(request); if (!auth.ok) return auth.response;
  const parsed = await parseV1Json(request, choosePollActivitySchema); if (!parsed.ok) return parsed.response;
  try { return v1Success(await choosePollActivity((await context.params).token, auth.user.id, parsed.data.ideaId, requestAppOrigin(request)), { request }); }
  catch (cause) { return timePollFailure(request, cause); }
}
