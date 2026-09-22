import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { runCourseMutation } from "@/lib/api/v1/course-mutation";
import {
  courseMutationResponse,
  limitCourseWrite,
  requireCourseIdempotencyKey,
} from "@/lib/api/v1/course-route";
import {
  confirmCourseSemesterReview,
  CourseSemesterReviewError,
  loadCourseSemesterReview,
} from "@/lib/api/v1/course-service";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const reviewSchema = z.object({
  courseIds: z.array(z.string().cuid()).max(100),
});

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  try {
    const review = await loadCourseSemesterReview(prisma, {
      userId: auth.user.id,
    });
    return v1Success(review, { request });
  } catch (cause) {
    console.error("GET /api/v1/courses/semester-review", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The semester course review could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const idempotency = requireCourseIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;
  const parsed = await parseV1Json(request, reviewSchema);
  if (!parsed.ok) return parsed.response;
  const values = reviewSchema.parse(parsed.data);

  try {
    const limited = await limitCourseWrite(request, auth.user.id);
    if (limited) return limited;
    const result = await runCourseMutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: "native-course-semester-review",
      requestHash: hashIdempotencyRequest(values),
      execute: async (tx) => ({
        status: 200,
        body: (await confirmCourseSemesterReview(tx, {
          userId: auth.user.id,
          courseIds: values.courseIds,
        })) as Prisma.InputJsonObject,
      }),
    });
    return courseMutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof CourseSemesterReviewError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "Only courses awaiting semester review can be selected.",
        status: 422,
        field: "courseIds",
      });
    }
    console.error("POST /api/v1/courses/semester-review", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The semester course review could not be saved.",
      status: 500,
      retryable: true,
    });
  }
}
