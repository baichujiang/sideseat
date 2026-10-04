import { after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { getSessionUser, createSession } from "@/lib/auth/session";
import { v1Success, v1Error, parseV1Json } from "@/lib/api/v1/http";
import { consumeV1RateLimit, getV1ClientIp, rateLimitSubject } from "@/lib/api/v1/rate-limit";
import { readIdempotencyKey } from "@/lib/api/v1/idempotency";
import { loginUsernameField, LOGIN_USERNAME_MESSAGES_EN } from "@/lib/validators/auth";
import { createShareGuest, publicIntention, sharedConversation, sendShareMessage, registerShareGuest, IntentShareError } from "@/lib/intent-share/service";
import { notifyUserPush, scheduleNewDirectChatMessageNotification } from "@/lib/push/notify-user";
import { sharedTimeSelectionSchema } from "@/lib/intent-share/time-selection";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ token: string }> };
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("START") }),
  z.object({ action: z.literal("SEND"), body: z.string().trim().min(1).max(500), selectedTime: sharedTimeSelectionSchema.optional() }),
  z.object({ action: z.literal("REGISTER"), username: loginUsernameField(LOGIN_USERNAME_MESSAGES_EN), password: z.string().min(8).max(72) }),
]);
function failure(request: Request, cause: unknown) {
  if (cause instanceof IntentShareError) return v1Error(request, { status: cause.status,
    code: cause.status === 404 ? "NOT_FOUND" : "STATE_CONFLICT", message: cause.message,
    ...(cause.code === "SHARED_TIME_CHANGED" ? { field: "selectedTime" } : {}) });
  console.error("Intent share", cause);
  return v1Error(request, { status: 500, code: "INTERNAL_ERROR", message: "Please try again in a moment.", retryable: true });
}
export async function GET(request: Request, context: Context) {
  try {
    const { token } = await context.params;
    const user = await getSessionUser();
    const conversation = await sharedConversation(token, user?.id);
    return v1Success({ ...conversation, intention: await publicIntention(token, user?.id), isGuest: !user || user.isGuest, username: user && !user.isGuest ? user.username : null }, { request });
  } catch (cause) { return failure(request, cause); }
}
export async function POST(request: Request, context: Context) {
  // Only this same-origin webpage uses guest cookies; native sharing has its own authenticated endpoint.
  const origin = request.headers.get("origin");
  let sameOrigin = false;
  try { sameOrigin = !!origin && new URL(origin).host === request.headers.get("host"); } catch { /* Invalid Origin. */ }
  if (!sameOrigin) {
    return v1Error(request, { status: 403, code: "INVALID_REQUEST", message: "Open the shared page to continue." });
  }
  const parsed = await parseV1Json(request, input);
  if (!parsed.ok) return parsed.response;
  try {
    const { token } = await context.params;
    let user = await getSessionUser();
    if (!await publicIntention(token, user?.id)) throw new IntentShareError(404, "This shared intention is no longer available.");
    const rate = await consumeV1RateLimit({ scope: "intent-share-write", subject: rateLimitSubject(getV1ClientIp(request)), limit: 40, windowMs: 60_000 });
    if (!rate.allowed) return v1Error(request, { status: 429, code: "RATE_LIMITED", message: "Please wait a minute before trying again." });
    const value = parsed.data;
    if (value.action === "START") {
      if (!user) {
        const guests = await consumeV1RateLimit({ scope: "intent-share-guest", subject: rateLimitSubject(getV1ClientIp(request)), limit: 10, windowMs: 3600_000 });
        if (!guests.allowed) throw new IntentShareError(429, "Please try again later.");
        user = await createShareGuest();
        await createSession(user.id);
      }
      return v1Success({ isGuest: user.isGuest, username: user.isGuest ? null : user.username }, { request });
    }
    if (!user) throw new IntentShareError(401, "Reopen contact to start your conversation.");
    if (value.action === "REGISTER") {
      const result = await registerShareGuest(user.id, value.username, value.password);
      // Rotate the anonymous session on upgrade, preserving the user and every message.
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await createSession(user.id);
      return v1Success({ ...result, isGuest: false }, { request });
    }
    const key = readIdempotencyKey(request);
    if (!key) throw new IntentShareError(422, "A message identifier is required.");
    const result = await sendShareMessage(token, user.id, value.body, key, value.selectedTime);
    const senderId = user.id;
    if ("opportunityId" in result && result.opportunityId) {
      const opportunityId = result.opportunityId, recipientId = result.recipientId;
      after(async () => { await notifyUserPush(recipientId, { title: "New message request", body: "Someone contacted you about your shared intention.",
        url: "/inbox", threadId: `opportunity-request:${opportunityId}`, data: { kind: "message_request", opportunityId } }); });
    } else if ("connectionId" in result && result.connectionId) {
      scheduleNewDirectChatMessageNotification({ connectionId: result.connectionId, senderId, bodyPreview: value.body });
    }
    return v1Success({ sent: true }, { request });
  } catch (cause) { return failure(request, cause); }
}
