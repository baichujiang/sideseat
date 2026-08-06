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
import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";

export const dynamic = "force-dynamic";

const courseIdSchema = z.string().cuid();

async function mutate(
  request: Request,
  courseId: string,
  action: "save" | "remove",
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
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
      scope: `native-course-saved:${action}:${courseId}`,
      requestHash: hashIdempotencyRequest({ courseId, action }),
      execute: async (tx) => {
        const course = await tx.course.findUnique({ where: { id: courseId }, select: { id: true } });
        if (!course) return null;
        if (action === "save") {
          const enrolled = await tx.userCourse.findFirst({
            where: {
              userId: auth.user.id,
              courseId,
              ...activeCourseMembershipWhere(),
            },
            select: { id: true },
          });
          if (enrolled) throw new CourseAlreadyEnrolledError();
          await tx.savedCourse.upsert({
            where: { userId_courseId: { userId: auth.user.id, courseId } },
            create: { userId: auth.user.id, courseId },
            update: {},
          });
        } else {
          await tx.savedCourse.deleteMany({ where: { userId: auth.user.id, courseId } });
        }
        return {
          status: action === "save" ? 201 : 200,
          body: { courseId, saved: action === "save" } as Prisma.InputJsonObject,
        };
      },
    });
    return courseMutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof CourseAlreadyEnrolledError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "An enrolled course cannot also be saved.",
        status: 409,
      });
    }
    console.error(`${request.method} /api/v1/courses/[courseId]/saved`, cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The saved course could not be changed.",
      status: 500,
      retryable: true,
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  return mutate(request, (await params).courseId, "save");
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  return mutate(request, (await params).courseId, "remove");
}

class CourseAlreadyEnrolledError extends Error {}
