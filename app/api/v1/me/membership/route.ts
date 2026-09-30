import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { getMembership } from "@/lib/membership/service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  try {
    return v1Success(await getMembership(auth.user.id), { request });
  } catch (cause) {
    console.error("GET /api/v1/me/membership", cause);
    return v1Error(request, { code: "INTERNAL_ERROR", message: "Membership could not be loaded. Please try again.", status: 500, retryable: true });
  }
}
