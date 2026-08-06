import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  ConnectionActionsError,
  mutateContactExchange,
} from "@/lib/api/v1/connection-actions-service";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

const actionSchema = z.object({
  action: z.enum(["request", "accept", "decline", "cancel"]),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { connectionId } = await params;
  const idCheck = requireV1Cuid(request, connectionId, "connectionId");
  if (!idCheck.ok) return idCheck.response;

  const parsed = await parseV1Json(request, actionSchema);
  if (!parsed.ok) return parsed.response;

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `native-contact-exchange:${connectionId}`,
      requestBody: parsed.data,
      execute: async () => ({
        status: 200,
        body: await mutateContactExchange({
          userId: auth.user.id,
          connectionId,
          action: parsed.data.action,
        }),
      }),
    });
  } catch (cause) {
    if (cause instanceof ConnectionActionsError) {
      return v1Error(request, {
        code: cause.code === "NOT_FOUND" ? "NOT_FOUND" : "INVALID_REQUEST",
        message: cause.messageText,
        status: cause.code === "NOT_FOUND" ? 404 : 422,
      });
    }
    console.error("POST /api/v1/connections/[connectionId]/contact-exchange", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The contact exchange could not be updated.",
      status: 500,
      retryable: true,
    });
  }
}
