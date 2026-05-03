import type { NextRequest } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { ok } from "@/lib/http";
import { getDiscoverPeople } from "@/lib/queries/discovery";

export async function GET(request: NextRequest) {
  const user = await requireOnboardedUser();
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const people = await getDiscoverPeople(user.id, q ? { courseQuery: q } : undefined);
  return ok(people);
}
