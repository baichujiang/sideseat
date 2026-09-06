import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { prisma } from "@/lib/db/prisma";
import { eventShareRecipientPayload } from "@/lib/event-share/event-share-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { token } = await params;
  const payload = await eventShareRecipientPayload(prisma, {
    token: safeDecode(token),
    viewerUserId: auth.user.id,
  });
  if (!payload) {
    return v1Error(request, {
      code: "NOT_FOUND",
      message: "This shared event is unavailable or has expired.",
      status: 404,
    });
  }
  return v1Success(payload, { request });
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
