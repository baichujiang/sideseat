import { z } from "zod";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { disableInvite, getInviteBatch } from "@/lib/membership/admin";
import { authorizeInviteAdmin, inviteAdminFailure } from "@/lib/membership/admin-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ batchId: string }> };
export async function GET(request: Request, context: Context) {
  const auth = await authorizeInviteAdmin(request);
  if (!auth.ok) return auth.response;
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const parsed = z.object({ view: z.enum(["codes", "redemptions", "audit"]).default("codes"), page: z.coerce.number().int().min(1).max(100000).default(1) }).safeParse(query);
  if (!parsed.success) return v1Error(request, { code: "INVALID_REQUEST", message: "查询条件无效。", status: 422 });
  try { return v1Success(await getInviteBatch((await context.params).batchId, parsed.data.view, parsed.data.page), { request }); }
  catch (cause) { return inviteAdminFailure(request, cause); }
}
export async function PATCH(request: Request, context: Context) {
  const auth = await authorizeInviteAdmin(request, true);
  if (!auth.ok) return auth.response;
  const parsed = await parseV1Json(request, z.object({ action: z.literal("DISABLE"), codeId: z.string().min(1).max(100).optional() }).strict());
  if (!parsed.ok) return parsed.response;
  try { return v1Success(await disableInvite(auth.user, (await context.params).batchId, parsed.data.codeId), { request }); }
  catch (cause) { return inviteAdminFailure(request, cause); }
}
