import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { v1Error } from "@/lib/api/v1/http";
import {
  ScheduleShareServiceError,
  createAndSendScheduleShare,
  mapScheduleShareError,
} from "@/lib/api/v1/schedule-share-service";
import { requestAppOrigin } from "@/lib/http/request-app-origin";
import { createScheduleShareSchema } from "@/lib/schedule-share/validation";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { connectionId } = await params;
  const idCheck = requireV1Cuid(request, connectionId, "connectionId");
  if (!idCheck.ok) return idCheck.response;

  let raw: unknown = {};
  try {
    const text = await request.text();
    if (text.trim()) raw = JSON.parse(text);
  } catch {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "Request body must be valid JSON.",
      status: 422,
    });
  }

  const useDefault =
    raw === null ||
    typeof raw !== "object" ||
    Object.keys(raw as object).length === 0;

  let input: ReturnType<typeof createScheduleShareSchema.parse> | null = null;
  if (!useDefault) {
    const parsed = createScheduleShareSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: issue?.message ?? "The schedule share payload is invalid.",
        status: 422,
        field: issue?.path.length ? issue.path.join(".") : undefined,
      });
    }
    input = parsed.data;
  }

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `native-schedule-share:${connectionId}`,
      requestBody: input ?? {},
      execute: async () => ({
        status: 201,
        body: await createAndSendScheduleShare({
          userId: auth.user.id,
          connectionId,
          appOrigin: requestAppOrigin(request),
          input,
        }),
      }),
    });
  } catch (cause) {
    if (cause instanceof ScheduleShareServiceError) {
      return v1Error(request, mapScheduleShareError(cause));
    }
    console.error(
      "POST /api/v1/connections/[connectionId]/schedule-shares",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The schedule could not be shared.",
      status: 500,
      retryable: true,
    });
  }
}
