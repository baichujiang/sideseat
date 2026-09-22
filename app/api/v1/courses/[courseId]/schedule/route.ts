import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { runCourseMutation } from "@/lib/api/v1/course-mutation";
import {
  courseMutationResponse,
  limitCourseWrite,
  requireCourseIdempotencyKey,
} from "@/lib/api/v1/course-route";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { courseMembershipActiveUntilForSemester } from "@/lib/courses/active-membership";
import { schoolIdentityChanged } from "@/lib/profile/school-change";

export const dynamic = "force-dynamic";

const courseIdSchema = z.string().cuid();
const requestSchema = z.object({
  variantFingerprint: z.string().trim().min(1).max(500),
});

export async function PATCH(
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
  const idempotency = requireCourseIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;
  const parsed = await parseV1Json(request, requestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const limited = await limitCourseWrite(request, auth.user.id);
    if (limited) return limited;
    const result = await runCourseMutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: `native-course-schedule:${courseId}`,
      requestHash: hashIdempotencyRequest(parsed.data),
      execute: async (tx) => {
        const course = await tx.course.findUnique({
          where: { id: courseId },
          select: { id: true, school: true, semesterLabel: true },
        });
        if (!course) return null;
        if (schoolIdentityChanged(auth.user.school, course.school)) {
          throw new CourseSchoolMismatchError();
        }
        const membership = await tx.userCourse.findUnique({
          where: { userId_courseId: { userId: auth.user.id, courseId } },
          select: { id: true },
        });
        if (!membership) throw new CourseEnrollmentRequiredError();
        const variant = await tx.courseOfficialScheduleVariant.findUnique({
          where: {
            courseId_fingerprint: {
              courseId,
              fingerprint: parsed.data.variantFingerprint,
            },
          },
          include: { sessions: true },
        });
        if (!variant || variant.sessions.length === 0) throw new InvalidCourseScheduleError();
        await tx.courseSession.deleteMany({ where: { userCourseId: membership.id } });
        await tx.courseSession.createMany({
          data: variant.sessions.map((session) => ({
            userCourseId: membership.id,
            weekday: session.weekday,
            startMinute: session.startMinute,
            endMinute: session.endMinute,
            location: session.location,
          })),
        });
        await tx.userCourse.update({
          where: { id: membership.id },
          data: {
            activeUntil: courseMembershipActiveUntilForSemester(
              course.semesterLabel,
            ),
          },
        });
        return {
          status: 200,
          body: {
            courseId,
            variantFingerprint: variant.fingerprint,
            sessionCount: variant.sessions.length,
          } as Prisma.InputJsonObject,
        };
      },
    });
    return courseMutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof CourseSchoolMismatchError) {
      return v1Error(request, {
        code: "CONTENT_RESTRICTED",
        message: "This timetable belongs to another school.",
        status: 403,
      });
    }
    if (cause instanceof CourseEnrollmentRequiredError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "Join the course before choosing a timetable.",
        status: 409,
      });
    }
    if (cause instanceof InvalidCourseScheduleError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "Choose a valid official timetable.",
        status: 422,
        field: "variantFingerprint",
      });
    }
    console.error("PATCH /api/v1/courses/[courseId]/schedule", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The course timetable could not be changed.",
      status: 500,
      retryable: true,
    });
  }
}

class CourseEnrollmentRequiredError extends Error {}
class InvalidCourseScheduleError extends Error {}
class CourseSchoolMismatchError extends Error {}
