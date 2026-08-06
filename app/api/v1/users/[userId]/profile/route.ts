import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { loadNativePublicProfile } from "@/lib/api/v1/profile-service";

export const dynamic = "force-dynamic";

const userIdSchema = z.string().cuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { userId } = await params;
  if (!userIdSchema.safeParse(userId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The user identifier is invalid.",
      status: 422,
      field: "userId",
    });
  }

  try {
    const profile = await loadNativePublicProfile({
      viewer: auth.user,
      peerUserId: userId,
    });
    if (!profile) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The profile was not found.",
        status: 404,
      });
    }
    return v1Success(profile, { request });
  } catch (cause) {
    console.error("GET /api/v1/users/[userId]/profile", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The profile could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
