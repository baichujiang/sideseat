import { requireV1User } from "@/lib/api/v1/auth";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  if (auth.user.isGuest) {
    return v1Success({ saved: false, reason: "guest" as const }, { request });
  }

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: "native-product-tutorial-dismiss",
      requestBody: { action: "dismiss" },
      execute: async () => {
        const updated = await prisma.user.update({
          where: { id: auth.user.id },
          data: { productTutorialDismissedAt: new Date() },
          select: { productTutorialDismissedAt: true },
        });
        return {
          status: 200,
          body: {
            saved: true as const,
            productTutorialDismissedAt: updated.productTutorialDismissedAt?.toISOString() ?? null,
          },
        };
      },
    });
  } catch (cause) {
    console.error("POST /api/v1/me/product-tutorial/dismiss", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The tutorial preference could not be saved.",
      status: 500,
      retryable: true,
    });
  }
}
