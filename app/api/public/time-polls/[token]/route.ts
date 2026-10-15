import { v1Success } from "@/lib/api/v1/http";
import { timePollFailure } from "@/lib/api/v1/time-poll-service";
import { requestAppOrigin } from "@/lib/http/request-app-origin";
import { publicPollData, publicPollGuard } from "@/lib/time-polls/public-session";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    await publicPollGuard(request, token);
    return v1Success(await publicPollData(token, requestAppOrigin(request)), { request });
  } catch (cause) { return timePollFailure(request, cause); }
}
