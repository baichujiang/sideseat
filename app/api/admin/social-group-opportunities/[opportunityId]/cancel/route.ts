import { requireAdminUser } from "@/lib/auth/guards";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { prisma } from "@/lib/db/prisma";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  await requireAdminUser();
  if (!isV2FeatureEnabled("v2SmallGroupPilot")) {
    return v1Error(request, {
      code: "FEATURE_UNAVAILABLE",
      message: "The small-group pilot is disabled.",
      status: 404,
    });
  }
  const { opportunityId } = await params;
  try {
    const updated = await prisma.socialGroupOpportunity.updateMany({
      where: {
        id: opportunityId,
        status: { in: ["DRAFT", "ACTIVE"] },
      },
      data: { status: "CANCELED" },
    });
    if (!updated.count) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "An active opportunity was not found.",
        status: 404,
      });
    }
    return v1Success({ canceled: true }, { request });
  } catch (cause) {
    console.error("POST /api/admin/social-group-opportunities/[id]/cancel", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The opportunity could not be canceled.",
      status: 500,
      retryable: true,
    });
  }
}
