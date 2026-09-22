import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { loadCourseDetailForNative } from "@/lib/api/v1/course-service";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const courseIdSchema = z.string().cuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { courseId } = await params;
  if (!courseIdSchema.safeParse(courseId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The course identifier is invalid.",
      status: 422,
      field: "courseId",
    });
  }

  try {
    const detail = await loadCourseDetailForNative(prisma, {
      userId: auth.user.id,
      courseId,
    });
    if (!detail) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The course was not found.",
        status: 404,
      });
    }
    return v1Success(detail, { request });
  } catch (cause) {
    console.error("GET /api/v1/courses/[courseId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The course could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
