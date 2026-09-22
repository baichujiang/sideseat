import { requireV1User } from "@/lib/api/v1/auth";
import { listPlansForUser } from "@/lib/api/v1/plans-service";
import { v1Error, v1Success } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  try {
    const plans = await listPlansForUser(auth.user.id);
    return v1Success({ plans }, { request });
  } catch (cause) {
    console.error("GET /api/v1/plans", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Plans could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
