import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import {
  PlansServiceError,
  createDirectPlanRequest,
  mapPlansError,
} from "@/lib/api/v1/plans-service";
import { planRequestCreateSchema } from "@/lib/validators/chat-planning";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { connectionId } = await params;
  const idCheck = requireV1Cuid(request, connectionId, "connectionId");
  if (!idCheck.ok) return idCheck.response;

  const parsed = await parseV1Json(request, planRequestCreateSchema);
  if (!parsed.ok) return parsed.response;

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `native-plan-create:${connectionId}`,
      requestBody: parsed.data,
      execute: async () => {
        const created = await createDirectPlanRequest({
          userId: auth.user.id,
          connectionId,
          title: parsed.data.title,
          location: parsed.data.location,
          message: parsed.data.message,
          startTime: parsed.data.startTime,
          endTime: parsed.data.endTime,
          planType: parsed.data.planType,
          receiverUserId: parsed.data.receiverUserId,
          origin: parsed.data.origin,
        });
        return {
          status: 201,
          body: {
            plan: created.plan,
            messageId: created.messageId,
          },
        };
      },
    });
  } catch (cause) {
    if (cause instanceof PlansServiceError) {
      return v1Error(request, mapPlansError(cause));
    }
    console.error("POST /api/v1/connections/[connectionId]/plans", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The plan could not be created.",
      status: 500,
      retryable: true,
    });
  }
}
