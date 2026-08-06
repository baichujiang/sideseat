import { getSessionUser } from "@/lib/auth/session";
import { revokeNativeDeviceSession } from "@/lib/auth/native-session";
import { v1Error, v1Success } from "@/lib/api/v1/http";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ familyId: string }> },
) {
  const user = await getSessionUser();
  if (!user || user.isGuest) {
    return v1Error(request, {
      code: "AUTHENTICATION_REQUIRED",
      message: "Sign in is required.",
      status: 401,
    });
  }

  const { familyId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(familyId)) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The device session identifier is invalid.",
      status: 422,
      field: "familyId",
    });
  }

  try {
    const revoked = await revokeNativeDeviceSession(user.id, familyId);
    if (!revoked) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The device session was not found.",
        status: 404,
      });
    }
    return v1Success({ revoked: true }, { request });
  } catch (cause) {
    console.error("DELETE /api/v1/auth/sessions/[familyId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Unable to revoke the device session.",
      status: 500,
      retryable: true,
    });
  }
}
