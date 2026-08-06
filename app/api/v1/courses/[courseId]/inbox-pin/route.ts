import { runInboxPreferenceMutation } from "@/lib/api/v1/inbox-preference-route";
import { toggleCourseInboxPin } from "@/lib/api/v1/inbox-preference-service";

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
    logLabel: "POST /api/v1/courses/[courseId]/inbox-pin",
    execute: (userId) => toggleCourseInboxPin({ userId, courseId }),
  });
}
