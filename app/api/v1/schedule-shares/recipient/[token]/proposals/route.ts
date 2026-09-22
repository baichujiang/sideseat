import { requireV1User } from "@/lib/api/v1/auth";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import {
  ScheduleShareServiceError,
  mapScheduleShareError,
  submitScheduleShareRecipientProposal,
} from "@/lib/api/v1/schedule-share-service";
import { getClientIp, maybeHashIp } from "@/lib/schedule-share/rate-limit";
import { createScheduleShareProposalSchema } from "@/lib/schedule-share/validation";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { token } = await params;
  const decoded = decodeURIComponent(token);
  if (!decoded.trim()) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The schedule share token is invalid.",
      status: 422,
      field: "token",
    });
  }

  const parsed = await parseV1Json(request, createScheduleShareProposalSchema);
  if (!parsed.ok) return parsed.response;

  const ipFingerprint = maybeHashIp(getClientIp(request));
  const userAgent = request.headers.get("user-agent") ?? "";

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `native-schedule-share-proposal:${decoded}`,
      requestBody: parsed.data,
      execute: async () => {
        const result = await submitScheduleShareRecipientProposal({
          userId: auth.user.id,
          username: auth.user.username,
          nickname: auth.user.nickname,
          token: decoded,
          title: parsed.data.title,
          note: parsed.data.note,
          location: parsed.data.location,
          startTime: parsed.data.startTime,
          endTime: parsed.data.endTime,
          ipFingerprint,
          userAgent,
        });
        return {
          status: result.updated ? 200 : 201,
          body: result,
        };
      },
    });
  } catch (cause) {
    if (cause instanceof ScheduleShareServiceError) {
      return v1Error(request, mapScheduleShareError(cause));
    }
    console.error(
      "POST /api/v1/schedule-shares/recipient/[token]/proposals",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The proposal could not be submitted.",
      status: 500,
      retryable: true,
    });
  }
}
