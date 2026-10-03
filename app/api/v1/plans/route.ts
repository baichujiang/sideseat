import { requireV1User } from "@/lib/api/v1/auth";
import { listPlansForUser, listCurrentConnectionPlans, PlansServiceError, mapPlansError } from "@/lib/api/v1/plans-service";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { v1Error, v1Success } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const query = new URL(request.url).searchParams;
  const connectionId = query.get("connectionId");
  const cursor = query.get("cursor");
  for (const [field, value] of [["connectionId", connectionId], ["cursor", cursor]] as const) {
    if (value !== null) {
      const check = requireV1Cuid(request, value, field);
      if (!check.ok) return check.response;
    }
  }
  if (cursor && !connectionId) return v1Error(request, {
    code: "INVALID_REQUEST", message: "A cursor requires a connectionId.", status: 422, field: "connectionId",
  });

  try {
    if (connectionId) {
      return v1Success(await listCurrentConnectionPlans(auth.user.id, connectionId, cursor ?? undefined), { request });
    }
    const plans = await listPlansForUser(auth.user.id);
    return v1Success({ plans }, { request });
  } catch (cause) {
    if (cause instanceof PlansServiceError) return v1Error(request, mapPlansError(cause));
    console.error("GET /api/v1/plans", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Plans could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
