import { StudentVerificationStatus } from "@prisma/client";
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
import { getCurrentSemesterLabel } from "@/lib/constants/semester";
import { normalizeSchoolCode } from "@/lib/constants/schools";
import { courseMembershipActiveUntil } from "@/lib/courses/active-membership";
import { normalizeCourseIdentityCode } from "@/lib/courses/course-identity";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  name: z.string().trim().min(2).max(160),
  code: z.string().trim().max(40).optional().default(""),
});

function userSchool(value: string | null) {
  const normalized = normalizeSchoolCode(value);
  if (normalized) return normalized;
  const raw = value?.trim();
  return raw && raw.length <= 80 ? raw : null;
}

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  if (
    !auth.user.verifiedStudent
    || auth.user.studentVerificationStatus !== StudentVerificationStatus.VERIFIED
  ) {
    return v1Error(request, {
      code: "CONTENT_RESTRICTED",
      message: "Verify your school identity before adding a community course.",
      status: 403,
    });
  }
  const school = userSchool(auth.user.school);
  if (!school) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "Add your school to your profile first.",
      status: 422,
      field: "school",
    });
  }
  const idempotency = requireCourseIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "A JSON request body is required.",
      status: 422,
    });
  }
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "Enter a course name and an optional course code.",
      status: 422,
    });
  }
  const code = parsed.data.code
    ? normalizeCourseIdentityCode(parsed.data.code)
    : null;
  if (parsed.data.code && (!code || code.length > 40)) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The course code is invalid.",
      status: 422,
      field: "code",
    });
  }

  const limited = await limitCourseWrite(request, auth.user.id);
  if (limited) return limited;
  const since = new Date(Date.now() - 24 * 60 * 60_000);
  const recentSubmissions = await prisma.course.count({
    where: { submittedById: auth.user.id, createdAt: { gte: since } },
  });
  if (recentSubmissions >= 5) {
    return v1Error(request, {
      code: "RATE_LIMITED",
      message: "You can add up to five new community courses per day.",
      status: 429,
      retryable: true,
    });
  }

  const semesterLabel = getCurrentSemesterLabel();
  try {
    const result = await runCourseMutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: "native-course-manual-create",
      requestHash: hashIdempotencyRequest({ name: parsed.data.name, code, school, semesterLabel }),
      execute: async (tx) => {
        const create = {
          name: parsed.data.name,
          code,
          identityCode: code,
          school,
          semesterLabel,
          submittedById: auth.user.id,
        };
        const course = code
          ? await tx.course.upsert({
              where: { code_school_semesterLabel: { code, school, semesterLabel } },
              create,
              update: {},
            })
          : await tx.course.upsert({
              where: { name_school_semesterLabel: { name: parsed.data.name, school, semesterLabel } },
              create,
              update: {},
            });
        await tx.userCourse.upsert({
          where: { userId_courseId: { userId: auth.user.id, courseId: course.id } },
          create: {
            userId: auth.user.id,
            courseId: course.id,
            activeUntil: courseMembershipActiveUntil(),
          },
          update: { activeUntil: courseMembershipActiveUntil() },
        });
        await tx.savedCourse.deleteMany({
          where: { userId: auth.user.id, courseId: course.id },
        });
        return {
          status: 201,
          body: {
            courseId: course.id,
            name: course.name,
            code: course.code,
            school: course.school,
            semesterLabel: course.semesterLabel,
            communitySubmitted: Boolean(course.submittedById),
          },
        };
      },
    });
    return courseMutationResponse(request, result);
  } catch (cause) {
    console.error("POST /api/v1/courses/manual", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The community course could not be added.",
      status: 500,
      retryable: true,
    });
  }
}
