import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { consumeV1RateLimit, rateLimitHeaders, rateLimitSubject } from "@/lib/api/v1/rate-limit";
import { redeemMembershipSchema } from "@/lib/membership/invite-code";
import { MembershipCodeError, redeemMembershipCode } from "@/lib/membership/service";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  try {
    const rate = await consumeV1RateLimit({ scope: "membership-redeem", subject: rateLimitSubject(auth.user.id), limit: 10, windowMs: 600_000 });
    if (!rate.allowed) return v1Error(request, { code: "RATE_LIMITED", message: "Too many redemption attempts. Please try again later.", status: 429, retryable: true, headers: rateLimitHeaders(rate) });
    const parsed = await parseV1Json(request, redeemMembershipSchema);
    if (!parsed.ok) return parsed.response;
    return v1Success(await redeemMembershipCode(auth.user.id, parsed.data.code), { request });
  } catch (cause) {
    if (cause instanceof MembershipCodeError) return v1Error(request, { code: "INVALID_REQUEST", message: cause.message, status: 422, field: "code" });
    // Never log invitation-code request bodies.
    return v1Error(request, { code: "INTERNAL_ERROR", message: "The invitation code could not be redeemed. Please try again.", status: 500, retryable: true });
  }
}
