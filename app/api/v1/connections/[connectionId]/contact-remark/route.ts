import { requireV1User } from "@/lib/api/v1/auth";
import {
  ConnectionActionsError,
  patchContactRemark,
} from "@/lib/api/v1/connection-actions-service";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { patchContactRemarkSchema } from "@/lib/validators/connection";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { connectionId } = await params;
  const idCheck = requireV1Cuid(request, connectionId, "connectionId");
  if (!idCheck.ok) return idCheck.response;

  const parsed = await parseV1Json(request, patchContactRemarkSchema);
  if (!parsed.ok) return parsed.response;

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `native-connection-remark:${connectionId}`,
      requestBody: parsed.data,
      execute: async () => ({
        status: 200,
        body: await patchContactRemark({
          userId: auth.user.id,
          connectionId,
          remark: parsed.data.remark,
        }),
      }),
    });
  } catch (cause) {
    if (cause instanceof ConnectionActionsError) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: cause.messageText,
        status: 404,
      });
    }
    console.error("PATCH /api/v1/connections/[connectionId]/contact-remark", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The remark could not be saved.",
      status: 500,
      retryable: true,
    });
  }
}
