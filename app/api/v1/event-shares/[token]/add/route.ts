import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error } from "@/lib/api/v1/http";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { prisma } from "@/lib/db/prisma";
import { importEventShare } from "@/lib/event-share/event-share-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { token } = await params;
  const decoded = safeDecode(token);

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: "native-event-share-import",
      requestBody: { token: decoded },
      execute: async () => {
        const imported = await importEventShare(prisma, {
          token: decoded,
          viewerUserId: auth.user.id,
        });
        if (!imported) throw new EventShareImportUnavailableError();
        return { status: imported.created ? 201 : 200, body: imported };
      },
    });
  } catch (cause) {
    if (cause instanceof EventShareImportUnavailableError) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "This shared event cannot be added.",
        status: 404,
      });
    }
    console.error("POST /api/v1/event-shares/[token]/add", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The shared event could not be added to your calendar.",
      status: 500,
      retryable: true,
    });
  }
}

class EventShareImportUnavailableError extends Error {}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
