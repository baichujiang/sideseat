import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  COURSE_LIST_LIMIT_MAX,
  listCoursesForNative,
} from "@/lib/api/v1/course-service";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const scopeSchema = z.enum(["popular", "enrolled", "saved"]);

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const search = new URL(request.url).searchParams;
  const parsedScope = scopeSchema.safeParse(search.get("scope") ?? "popular");
  if (!parsedScope.success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "scope must be popular, enrolled, or saved.",
      status: 422,
      field: "scope",
    });
  }
  const rawLimit = Number(search.get("limit") ?? "20");
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > COURSE_LIST_LIMIT_MAX) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: `limit must be an integer from 1 to ${COURSE_LIST_LIMIT_MAX}.`,
      status: 422,
      field: "limit",
    });
  }

  try {
    const payload = await listCoursesForNative(prisma, {
      userId: auth.user.id,
      userSchool: auth.user.school,
      scope: parsedScope.data,
      school: search.get("school"),
      query: search.get("q"),
      cursor: search.get("cursor"),
      limit: rawLimit,
    });
    if (!payload) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "The course cursor is invalid.",
        status: 422,
        field: "cursor",
      });
    }
    return v1Success(payload, { request });
  } catch (cause) {
    console.error("GET /api/v1/courses", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Courses could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
