import { runInboxPreferenceMutation } from "@/lib/api/v1/inbox-preference-route";
import { setCourseInboxHidden } from "@/lib/api/v1/inbox-preference-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const { courseId } = await params;
  return runInboxPreferenceMutation({
    request,
    field: "courseId",
    id: courseId,
    logLabel: "POST /api/v1/courses/[courseId]/inbox-hide",
    execute: (userId) =>
      setCourseInboxHidden({ userId, courseId, hidden: true }),
  });
}
