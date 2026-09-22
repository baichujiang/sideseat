import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { runCourseMutation } from "@/lib/api/v1/course-mutation";
import {
  courseMutationResponse,
  limitCourseWrite,
  requireCourseIdempotencyKey,
} from "@/lib/api/v1/course-route";
import { v1Error } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { isCourseMembershipActive } from "@/lib/courses/active-membership";

export const dynamic = "force-dynamic";

const courseIdSchema = z.string().cuid();

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const courseId = (await params).courseId;
  if (!courseIdSchema.safeParse(courseId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The course identifier is invalid.",
      status: 422,
      field: "courseId",
    });
  }
  const idempotency = requireCourseIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;

  try {
    const limited = await limitCourseWrite(request, auth.user.id);
    if (limited) return limited;
    const result = await runCourseMutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: `native-course-archive-remove:${courseId}`,
      requestHash: hashIdempotencyRequest({ courseId, action: "remove-archived" }),
      execute: async (tx) => {
        const course = await tx.course.findUnique({
          where: { id: courseId },
          select: { id: true },
        });
        if (!course) return null;
        const membership = await tx.userCourse.findUnique({
          where: { userId_courseId: { userId: auth.user.id, courseId } },
          select: { id: true, activeUntil: true },
        });
        if (isCourseMembershipActive(membership)) {
          throw new ArchivedCourseIsActiveError();
        }
        if (membership) {
          await tx.userCourse.delete({ where: { id: membership.id } });
        }
        return {
          status: 200,
          body: {
            courseId,
            enrolled: false,
            changed: Boolean(membership),
          } as Prisma.InputJsonObject,
        };
      },
    });
    return courseMutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof ArchivedCourseIsActiveError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "This course is active and can no longer be removed from the archive.",
        status: 409,
      });
    }
    console.error("DELETE /api/v1/courses/[courseId]/archive", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The archived course could not be removed.",
      status: 500,
      retryable: true,
    });
  }
}

class ArchivedCourseIsActiveError extends Error {}
