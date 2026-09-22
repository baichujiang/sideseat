import { CourseIntent, Prisma } from "@prisma/client";
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
import {
  activeCourseMembershipWhere,
  courseMembershipActiveUntilForSemester,
  isCourseMembershipActive,
} from "@/lib/courses/active-membership";
import { sameCourseIdentityWhere } from "@/lib/courses/course-identity";
import { schoolIdentityChanged } from "@/lib/profile/school-change";

export const dynamic = "force-dynamic";

const courseIdSchema = z.string().cuid();

async function mutate(
  request: Request,
  courseId: string,
  action: "enroll" | "leave",
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
      scope: `native-course-enrollment:${action}:${courseId}`,
      requestHash: hashIdempotencyRequest({ courseId, action }),
      execute: async (tx) => {
        const course = await tx.course.findUnique({
          where: { id: courseId },
          select: { id: true, school: true, code: true, semesterLabel: true },
        });
        if (!course) return null;
        if (
          action === "enroll" &&
          schoolIdentityChanged(auth.user.school, course.school)
        ) {
          throw new CourseSchoolMismatchError();
        }
        if (action === "enroll") {
          const activeEquivalent = await tx.userCourse.findFirst({
            where: {
              userId: auth.user.id,
              courseId: { not: course.id },
              ...activeCourseMembershipWhere(),
              course: sameCourseIdentityWhere(course),
            },
            select: { id: true },
          });
          if (activeEquivalent) throw new ActiveEquivalentCourseError();
        }
        const existing = await tx.userCourse.findUnique({
          where: { userId_courseId: { userId: auth.user.id, courseId } },
          select: { id: true, activeUntil: true },
        });
        if (action === "enroll") {
          const activeUntil = courseMembershipActiveUntilForSemester(
            course.semesterLabel,
          );
          if (!existing) {
            await tx.userCourse.create({
              data: {
                userId: auth.user.id,
                courseId,
                intentions: [CourseIntent.STUDY_TOGETHER],
                activeUntil,
              },
            });
          } else {
            await tx.userCourse.update({
              where: { id: existing.id },
              data: { activeUntil },
            });
          }
          await tx.savedCourse.deleteMany({ where: { userId: auth.user.id, courseId } });
        } else if (existing) {
          await tx.userCourse.delete({ where: { id: existing.id } });
        }
        return {
          status: 200,
          body: {
            courseId,
            enrolled: action === "enroll",
            changed:
              action === "enroll"
                ? !isCourseMembershipActive(existing)
                : Boolean(existing),
          } as Prisma.InputJsonObject,
        };
      },
    });
    return courseMutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof CourseSchoolMismatchError) {
      return v1Error(request, {
        code: "CONTENT_RESTRICTED",
        message: "You can only join courses from your current school.",
        status: 403,
      });
    }
    if (cause instanceof ActiveEquivalentCourseError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "A current version of this course is already active.",
        status: 409,
      });
    }
    console.error(`${request.method} /api/v1/courses/[courseId]/enrollment`, cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The course enrollment could not be changed.",
      status: 500,
      retryable: true,
    });
  }
}

class CourseSchoolMismatchError extends Error {}
class ActiveEquivalentCourseError extends Error {}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  return mutate(request, (await params).courseId, "enroll");
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  return mutate(request, (await params).courseId, "leave");
}
