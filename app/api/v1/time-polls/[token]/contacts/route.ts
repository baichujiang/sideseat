import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json } from "@/lib/api/v1/http";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { timePollFailure } from "@/lib/api/v1/time-poll-service";
import { sharePollWithContacts } from "@/lib/api/v1/time-poll-contact-service";
import { sharePollContactsSchema } from "@/lib/time-polls/domain";
import { requestAppOrigin } from "@/lib/http/request-app-origin";

export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  const auth = await requireV1User(request); if (!auth.ok) return auth.response;
  const parsed = await parseV1Json(request, sharePollContactsSchema); if (!parsed.ok) return parsed.response;
  const { token } = await context.params;
  try {
    return await runIdempotentV1Mutation({ request, actorId: auth.user.id, scope: `plan-contacts:${token}`,
      requestBody: parsed.data, execute: async () => ({ status: 201,
        body: await sharePollWithContacts(token, auth.user.id, parsed.data, requestAppOrigin(request)) }) });
  } catch (cause) { return timePollFailure(request, cause); }
}
