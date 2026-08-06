import { requireV1User } from "@/lib/api/v1/auth";
import { unblockUserForActor } from "@/lib/api/v1/blocks-service";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { v1Error } from "@/lib/api/v1/http";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ blockedId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { blockedId } = await params;

  if (!blockedId || blockedId.length > 128) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "A valid blockedId is required.",
      status: 422,
      field: "blockedId",
    });
  }

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `native-me-blocks-delete:${blockedId}`,
      requestBody: { blockedId, action: "delete" },
      execute: async () => {
        const result = await unblockUserForActor({
          db: prisma,
          blockerId: auth.user.id,
          blockedId,
        });
        if (!result) {
          const error = new Error("NOT_FOUND");
          (error as Error & { code?: string }).code = "NOT_FOUND";
          throw error;
        }
        return { status: 200, body: result };
      },
    });
  } catch (cause) {
    if (
      cause instanceof Error &&
      ((cause as Error & { code?: string }).code === "NOT_FOUND" || cause.message === "NOT_FOUND")
    ) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "That blocked user was not found.",
        status: 404,
      });
    }
    console.error("DELETE /api/v1/me/blocks/[blockedId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The user could not be unblocked.",
      status: 500,
      retryable: true,
    });
  }
}
