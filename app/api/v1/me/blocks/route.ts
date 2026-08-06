import { requireV1User } from "@/lib/api/v1/auth";
import { listBlockedUsersForUser } from "@/lib/api/v1/blocks-service";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  try {
    const blocks = await listBlockedUsersForUser(prisma, auth.user.id);
    return v1Success({ blocks }, { request });
  } catch (cause) {
    console.error("GET /api/v1/me/blocks", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Blocked users could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
