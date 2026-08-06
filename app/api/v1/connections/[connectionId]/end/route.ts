import { requireV1User } from "@/lib/api/v1/auth";
import {
  ConnectionActionsError,
  endConnection,
} from "@/lib/api/v1/connection-actions-service";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { v1Error } from "@/lib/api/v1/http";

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

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `native-connection-end:${connectionId}`,
      requestBody: { connectionId },
      execute: async () => ({
        status: 200,
        body: await endConnection({ userId: auth.user.id, connectionId }),
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
    console.error("POST /api/v1/connections/[connectionId]/end", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The conversation could not be ended.",
      status: 500,
      retryable: true,
    });
  }
}
