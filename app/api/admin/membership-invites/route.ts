import { z } from "zod";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { createInviteBatch, createInviteBatchSchema, listInviteBatches } from "@/lib/membership/admin";
import { authorizeInviteAdmin, inviteAdminFailure } from "@/lib/membership/admin-http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const auth = await authorizeInviteAdmin(request);
  if (!auth.ok) return auth.response;
  const page = z.coerce.number().int().min(1).max(100000).safeParse(new URL(request.url).searchParams.get("page") ?? 1);
  if (!page.success) return v1Error(request, { code: "INVALID_REQUEST", message: "页码无效。", status: 422 });
  try { return v1Success(await listInviteBatches(page.data), { request }); }
  catch (cause) { return inviteAdminFailure(request, cause); }
}
export async function POST(request: Request) {
  const auth = await authorizeInviteAdmin(request, true);
  if (!auth.ok) return auth.response;
  const parsed = await parseV1Json(request, createInviteBatchSchema);
  if (!parsed.ok) return parsed.response;
  try { return v1Success(await createInviteBatch(auth.user, parsed.data), { request, status: 201 }); }
  catch (cause) { return inviteAdminFailure(request, cause); }
}
