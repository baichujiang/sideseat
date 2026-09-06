import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error } from "@/lib/api/v1/http";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import {
  CalendarSubscriptionNotFoundError,
  revokeCalendarSubscription,
} from "@/lib/calendar/calendar-subscription-service";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ linkId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { linkId } = await params;
  const idCheck = requireV1Cuid(request, linkId, "linkId");
  if (!idCheck.ok) return idCheck.response;

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `native-calendar-subscription-revoke:${linkId}`,
      requestBody: { linkId },
      execute: async () => ({
        status: 200,
        body: await revokeCalendarSubscription(prisma, {
          ownerUserId: auth.user.id,
          linkId,
        }),
      }),
    });
  } catch (cause) {
    if (cause instanceof CalendarSubscriptionNotFoundError) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: cause.message,
        status: 404,
      });
    }
    console.error("DELETE /api/v1/calendar/subscriptions/[linkId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The calendar connection could not be revoked.",
      status: 500,
      retryable: true,
    });
  }
}
