import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { matchCoursesForNative } from "@/lib/api/v1/course-service";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  school: z.string().trim().min(1).max(80).nullable().optional(),
  terms: z.array(z.string().trim().min(2).max(120)).min(1).max(16),
});

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const parsed = await parseV1Json(request, requestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    return v1Success(
      await matchCoursesForNative(prisma, {
        userId: auth.user.id,
        userSchool: auth.user.school,
        school: parsed.data.school,
        terms: parsed.data.terms,
      }),
      { request },
    );
  } catch (cause) {
    console.error("POST /api/v1/courses/match", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Courses could not be matched.",
      status: 500,
      retryable: true,
    });
  }
}
