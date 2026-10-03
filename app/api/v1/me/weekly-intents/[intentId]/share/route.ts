import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { enableIntentionShare, IntentShareError } from "@/lib/intent-share/service";
import { publicScheduleShareOrigin } from "@/lib/schedule-share/public-share-origin";
import { prisma } from "@/lib/db/prisma";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ intentId: string }> };
export async function POST(request: Request, { params }: Context) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  try {
    const { intentId } = await params;
    const token = await enableIntentionShare(auth.user.id, intentId);
    const origin = publicScheduleShareOrigin({ requestOrigin: `${new URL(request.url).protocol}//${request.headers.get("host") || new URL(request.url).host}`, configuredOrigin: process.env.NEXT_PUBLIC_APP_URL });
    return v1Success({ url: `${origin}/share/intent/${token}` }, { request });
  } catch (cause) {
    if (cause instanceof IntentShareError) return v1Error(request, { status: cause.status, code: "NOT_FOUND", message: cause.message });
    console.error("Enable intention share", cause);
    return v1Error(request, { status: 500, code: "INTERNAL_ERROR", message: "The share link could not be created." });
  }
}
export async function DELETE(request: Request, { params }: Context) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { intentId } = await params;
  await prisma.weeklyIntent.updateMany({ where: { id: intentId, userId: auth.user.id }, data: { shareToken: null } });
  return v1Success({ disabled: true }, { request });
}
