import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  ConnectionActionsError,
  blockConnectionPeer,
} from "@/lib/api/v1/connection-actions-service";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

const blockBodySchema = z.object({
  blockedId: z.string().cuid().optional(),
  connectionId: z.string().cuid().optional(),
  reason: z.string().max(240).optional().nullable(),
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

  const parsed = await parseV1Json(request, blockBodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `native-connection-block:${connectionId}`,
      requestBody: parsed.data,
      execute: async () => ({
        status: 201,
        body: await blockConnectionPeer({
          userId: auth.user.id,
          connectionId,
          blockedId: parsed.data.blockedId,
          reason: parsed.data.reason,
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
    console.error("POST /api/v1/connections/[connectionId]/block", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The user could not be blocked.",
      status: 500,
      retryable: true,
    });
  }
}
