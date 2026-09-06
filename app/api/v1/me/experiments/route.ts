import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { evaluateActionCoordinationCapability } from "@/lib/v2/action-coordination/capability";
import {
  getActionToPlanAssignment,
  getCreatorGatedActionToPlanAssignment,
} from "@/lib/v2/experiments";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  try {
    const capability = evaluateActionCoordinationCapability(request.headers);
    const legacyAssignment = await getActionToPlanAssignment(auth.user);
    const creatorGatedAssignment =
      await getCreatorGatedActionToPlanAssignment(auth.user, capability);
    const experiments = [legacyAssignment];
    if (
      creatorGatedAssignment.persisted &&
      creatorGatedAssignment.assignedAt !== null
    ) {
      experiments.push({
        key: creatorGatedAssignment.key,
        eligible: creatorGatedAssignment.eligible,
        variant: creatorGatedAssignment.variant,
        assignedAt: creatorGatedAssignment.assignedAt,
        features: legacyAssignment.features,
      });
    }
    return v1Success({ experiments }, { request });
  } catch (cause) {
    console.error("GET /api/v1/me/experiments", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Experiment assignment could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
