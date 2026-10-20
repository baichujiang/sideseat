import { z } from "zod";
import { ReportReason } from "@prisma/client";
import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { MutualOpportunityError, performOpportunitySafetyAction } from "@/lib/v2/mutual-opportunities";
export const dynamic = "force-dynamic";
const body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("BLOCK") }),
  z.object({ action: z.literal("REPORT"), reason: z.nativeEnum(ReportReason), details: z.string().max(500).optional() }),
]);
export async function POST(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  const auth = await requireV1User(request); if (!auth.ok) return auth.response;
  const { opportunityId } = await params;
  const id = requireV1Cuid(request, opportunityId, "opportunityId"); if (!id.ok) return id.response;
  const parsed = await parseV1Json(request, body); if (!parsed.ok) return parsed.response;
  try {
    return await runIdempotentV1Mutation({ request, actorId: auth.user.id, scope: `opportunity-safety:${opportunityId}`,
      requestBody: parsed.data, execute: async () => ({ status: 201,
        body: await performOpportunitySafetyAction({ userId: auth.user.id, opportunityId, ...parsed.data }) }) });
  } catch (cause) {
    if (cause instanceof MutualOpportunityError) return v1Error(request, { code: "NOT_FOUND", message: "Intention not found.", status: 404 });
    console.error("Opportunity safety action", cause);
    return v1Error(request, { code: "INTERNAL_ERROR", message: "The safety action could not be completed.", status: 500, retryable: true });
  }
}
