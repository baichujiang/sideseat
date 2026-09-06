import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { searchCalendarEntriesForUser } from "@/lib/api/v1/calendar-search-service";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const searchQuerySchema = z.string().trim().min(1).max(80);

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const query = searchQuerySchema.safeParse(
    new URL(request.url).searchParams.get("q") ?? "",
  );
  if (!query.success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "Search must contain between 1 and 80 characters.",
      field: "q",
      status: 422,
    });
  }

  try {
    const results = await searchCalendarEntriesForUser(prisma, {
      userId: auth.user.id,
      query: query.data,
    });
    return v1Success({ results }, { request });
  } catch (cause) {
    console.error("GET /api/v1/calendar/search", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Calendar search could not be completed.",
      status: 500,
      retryable: true,
    });
  }
}
