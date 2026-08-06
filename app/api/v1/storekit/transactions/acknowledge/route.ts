import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import {
  StoreKitServiceError,
  acknowledgeStoreKitTransaction,
} from "@/lib/api/v1/storekit-service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  signedTransaction: z.string().trim().min(16).max(16_384),
});

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseV1Json(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: "native-storekit-acknowledge",
      requestBody: parsed.data,
      execute: async () => ({
        status: 200,
        body: await acknowledgeStoreKitTransaction({
          userId: auth.user.id,
          signedTransaction: parsed.data.signedTransaction,
        }),
      }),
    });
  } catch (cause) {
    if (cause instanceof StoreKitServiceError) {
      const status =
        cause.code === "FEATURE_UNAVAILABLE"
          ? 503
          : cause.code === "CONTENT_RESTRICTED"
            ? 403
            : cause.code === "NOT_FOUND"
              ? 404
              : 422;
      return v1Error(request, {
        code: cause.code,
        message: cause.messageText,
        status,
      });
    }
    console.error("POST /api/v1/storekit/transactions/acknowledge", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The StoreKit transaction could not be acknowledged.",
      status: 500,
      retryable: true,
    });
  }
}
