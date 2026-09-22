import { requireAdminUser } from "@/lib/auth/guards";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { prisma } from "@/lib/db/prisma";
import { socialGroupDraftSchema } from "@/lib/validators/social-group";
import {
  SocialGroupError,
  createSmallGroupDraft,
} from "@/lib/v2/social-groups";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";

export const dynamic = "force-dynamic";

function unavailable(request: Request) {
  return v1Error(request, {
    code: "FEATURE_UNAVAILABLE",
    message: "The small-group pilot is disabled.",
    status: 404,
  });
}

export async function GET(request: Request) {
  await requireAdminUser();
  if (!isV2FeatureEnabled("v2SmallGroupPilot")) return unavailable(request);
  const opportunities = await prisma.socialGroupOpportunity.findMany({
    include: {
      candidates: {
        include: {
          user: { select: { id: true, username: true, nickname: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return v1Success({ opportunities }, { request });
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!isV2FeatureEnabled("v2SmallGroupPilot")) return unavailable(request);
  const parsed = await parseV1Json(request, socialGroupDraftSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const opportunity = await createSmallGroupDraft({
      adminUserId: admin.id,
      input: {
        ...parsed.data,
        minimumMembers: parsed.data.minimumMembers ?? 3,
        maximumMembers: parsed.data.maximumMembers ?? 5,
      },
    });
    return v1Success({ opportunity }, { request, status: 201 });
  } catch (cause) {
    if (cause instanceof SocialGroupError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: cause.messageText,
        status: 409,
      });
    }
    console.error("POST /api/admin/social-group-opportunities", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The pilot opportunity could not be created.",
      status: 500,
      retryable: true,
    });
  }
}
