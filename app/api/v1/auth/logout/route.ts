import { revokeNativeSession } from "@/lib/auth/native-session";
import { nativeLogoutRequestSchema } from "@/lib/api/v1/auth-schemas";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";

export async function POST(request: Request) {
  const parsed = await parseV1Json(request, nativeLogoutRequestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await revokeNativeSession(parsed.data.refreshToken, parsed.data.pushToken);
    return v1Success({ revoked: true }, { request });
  } catch (cause) {
    console.error("POST /api/v1/auth/logout", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Unable to end the session.",
      status: 500,
      retryable: true,
    });
  }
}
