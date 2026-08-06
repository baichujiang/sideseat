import { getSessionUser } from "@/lib/auth/session";
import { listNativeDeviceSessions } from "@/lib/auth/native-session";
import { v1Error, v1Success } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || user.isGuest) {
    return v1Error(request, {
      code: "AUTHENTICATION_REQUIRED",
      message: "Sign in is required.",
      status: 401,
    });
  }

  try {
    const sessions = await listNativeDeviceSessions(user.id);
    return v1Success({ sessions }, { request });
  } catch (cause) {
    console.error("GET /api/v1/auth/sessions", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Unable to load device sessions.",
      status: 500,
      retryable: true,
    });
  }
}
