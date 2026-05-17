import { cookies } from "next/headers";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { DISCOVER_SERVED_CITY_COOKIE } from "@/lib/discover/discover-city-preference";
import { isDiscoverServedCity } from "@/lib/discover/discover-served-cities";
import { error, ok, parseBody } from "@/lib/http";

const bodySchema = z.object({
  city: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    await requireUser();
    const raw = await request.json().catch(() => ({}));
    const parsed = parseBody(raw, bodySchema);
    if (!parsed.ok) {
      return error(parsed.error, 422);
    }
    if (!isDiscoverServedCity(parsed.data.city)) {
      return error("City is not available yet.", 400);
    }

    const jar = await cookies();
    jar.set(DISCOVER_SERVED_CITY_COOKIE, parsed.data.city, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return ok({ city: parsed.data.city });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update city.", 500);
  }
}
