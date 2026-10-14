import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Success } from "@/lib/api/v1/http";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { createTimePoll, listTimePolls, timePollFailure } from "@/lib/api/v1/time-poll-service";
import { requestAppOrigin } from "@/lib/http/request-app-origin";
import { createTimePollSchema } from "@/lib/time-polls/domain";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request); if (!auth.ok) return auth.response;
  try { return v1Success(await listTimePolls(auth.user.id, requestAppOrigin(request)), { request }); }
  catch (cause) { return timePollFailure(request, cause); }
}

export async function POST(request: Request) {
  const auth = await requireV1User(request); if (!auth.ok) return auth.response;
  const parsed = await parseV1Json(request, createTimePollSchema); if (!parsed.ok) return parsed.response;
  try {
    return await runIdempotentV1Mutation({
      request, actorId: auth.user.id, scope: "native-time-poll", requestBody: parsed.data,
      execute: async () => ({ status: 201, body: await createTimePoll(auth.user.id, parsed.data, requestAppOrigin(request)) }),
    });
  } catch (cause) { return timePollFailure(request, cause); }
}
