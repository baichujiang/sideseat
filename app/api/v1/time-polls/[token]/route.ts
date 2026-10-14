import { requireV1User } from "@/lib/api/v1/auth";
import { v1Success } from "@/lib/api/v1/http";
import { deleteTimePoll, getTimePoll, timePollFailure } from "@/lib/api/v1/time-poll-service";
import { requestAppOrigin } from "@/lib/http/request-app-origin";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };
export async function GET(request: Request, context: Context) {
  const auth = await requireV1User(request); if (!auth.ok) return auth.response;
  try { return v1Success(await getTimePoll((await context.params).token, auth.user.id, requestAppOrigin(request)), { request }); }
  catch (cause) { return timePollFailure(request, cause); }
}
export async function DELETE(request: Request, context: Context) {
  const auth = await requireV1User(request); if (!auth.ok) return auth.response;
  try { return v1Success(await deleteTimePoll((await context.params).token, auth.user.id), { request }); }
  catch (cause) { return timePollFailure(request, cause); }
}
