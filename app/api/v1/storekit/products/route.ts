import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import {
  StoreKitServiceError,
  listStoreKitProducts,
} from "@/lib/api/v1/storekit-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  try {
    return v1Success(listStoreKitProducts(), { request });
  } catch (cause) {
    if (cause instanceof StoreKitServiceError) {
      return v1Error(request, {
        code: cause.code,
        message: cause.messageText,
        status: cause.code === "FEATURE_UNAVAILABLE" ? 503 : 422,
      });
    }
    console.error("GET /api/v1/storekit/products", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "StoreKit products could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
