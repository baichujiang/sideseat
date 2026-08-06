import { requireV1User } from "@/lib/api/v1/auth";
import { loadNativeOwnedDiscoverItems } from "@/lib/api/v1/discover-service";
import { v1Error, v1Success } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  try {
    const items = await loadNativeOwnedDiscoverItems(auth.user.id);
    return v1Success(items, { request });
  } catch (cause) {
    console.error("GET /api/v1/me/posts", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Your posts could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
