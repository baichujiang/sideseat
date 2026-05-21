import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { assertScheduleShareChatPreviewAccess } from "@/lib/schedule-share/chat-preview-access";
import { buildPublicScheduleShareSnapshotForActiveLink } from "@/lib/schedule-share/public-snapshot";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const auth = await resolveOnboardedUserForApi();
  if (!auth.ok) return error(auth.error, auth.status);

  const { token } = await params;
  const decoded = decodeURIComponent(token);

  const access = await assertScheduleShareChatPreviewAccess(prisma, decoded, auth.user.id);
  if (!access.ok) {
    if (access.reason === "forbidden") return error("Not allowed to preview this schedule.", 403);
    return error("Schedule link unavailable.", 404);
  }

  const snapshot = await buildPublicScheduleShareSnapshotForActiveLink(prisma, access.link);

  return ok({
    snapshot,
    expired: access.expired,
    ownerDisplayLabel: snapshot.ownerDisplayLabel,
  });
}
