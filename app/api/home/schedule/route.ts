import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";
import { loadHomeSchedulePayload } from "@/lib/home/load-home-schedule-payload";

function parseWindowParam(value: string | null, label: string): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function GET(request: Request) {
  try {
    const auth = await resolveOnboardedUserForApi();
    if (!auth.ok) return error(auth.error, auth.status);

    const { searchParams } = new URL(request.url);
    const windowStart = parseWindowParam(searchParams.get("windowStart"), "windowStart");
    const windowEnd = parseWindowParam(searchParams.get("windowEnd"), "windowEnd");
    if (!windowStart || !windowEnd) {
      return error("windowStart and windowEnd query params are required (ISO dates).");
    }
    if (windowStart > windowEnd) {
      return error("windowStart must be before windowEnd.");
    }

    const payload = await loadHomeSchedulePayload({
      prisma,
      userId: auth.user.id,
      windowStart,
      windowEnd,
    });

    return ok(payload);
  } catch (cause) {
    console.error(cause);
    return error("Could not load schedule.", 500);
  }
}
