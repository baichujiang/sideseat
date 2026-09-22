import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  discoverMutationResponse,
  limitDiscoverWrite,
  requireDiscoverIdempotencyKey,
} from "@/lib/api/v1/discover-route";
import { setNativeDiscoverPostSaved } from "@/lib/api/v1/discover-service";
import { v1Error } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { runV1Mutation } from "@/lib/api/v1/mutation";

export const dynamic = "force-dynamic";

const postIdSchema = z.string().cuid();

async function mutate(request: Request, postId: string, saved: boolean) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  if (!postIdSchema.safeParse(postId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The buddy post identifier is invalid.",
      status: 422,
      field: "postId",
    });
  }
  const idempotency = requireDiscoverIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;

  try {
    const limited = await limitDiscoverWrite(request, auth.user.id);
    if (limited) return limited;
    const result = await runV1Mutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: `native-discover-post-saved:${saved ? "save" : "remove"}:${postId}`,
      requestHash: hashIdempotencyRequest({ postId, saved }),
      execute: async (tx) => {
        const body = await setNativeDiscoverPostSaved({
          userId: auth.user.id,
          postId,
          saved,
          tx,
        });
        if (!body) return null;
        return {
          status: saved ? 201 : 200,
          body: body as Prisma.InputJsonObject,
        };
      },
    });
    return discoverMutationResponse(request, result);
  } catch (cause) {
    console.error(
      `${request.method} /api/v1/discover/posts/[postId]/saved`,
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The saved buddy post could not be changed.",
      status: 500,
      retryable: true,
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  return mutate(request, (await params).postId, true);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  return mutate(request, (await params).postId, false);
}
