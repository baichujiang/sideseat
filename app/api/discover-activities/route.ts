import { cookies } from "next/headers";

import { getSessionUser } from "@/lib/auth/session";
import {
  DiscoverActivityCreateError,
  createDiscoverActivityForUser,
} from "@/lib/discover/create-discover-activity";
import { prisma } from "@/lib/db/prisma";
import { DISCOVER_SERVED_CITY_COOKIE } from "@/lib/discover/discover-city-preference";
import {
  discoverActivityErrorMessage,
  discoverActivityErrorStatus,
} from "@/lib/discover/discover-activity-api-messages";
import { loadActiveDiscoverActivitiesForCity } from "@/lib/discover/load-active-discover-activities-for-city";
import { canCreateActivity } from "@/lib/discover/discover-activity-state";
import { viewerFromUser } from "@/lib/discover/discover-activity-server";
import { isDiscoverServedCity } from "@/lib/discover/discover-served-cities";
import { DEFAULT_DISCOVER_SERVED_CITY } from "@/lib/discover/discover-city-name-keys";
import { error, ok, parseBody } from "@/lib/http";
import { createDiscoverActivitySchema } from "@/lib/validators/discover-activity";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cityParam = url.searchParams.get("city");
  const category = url.searchParams.get("category");
  const q = url.searchParams.get("q")?.trim().toLowerCase() ?? "";

  const jar = await cookies();
  const cookieCity = jar.get(DISCOVER_SERVED_CITY_COOKIE)?.value;
  const city =
    cityParam && isDiscoverServedCity(cityParam)
      ? cityParam
      : cookieCity && isDiscoverServedCity(cookieCity)
        ? cookieCity
        : DEFAULT_DISCOVER_SERVED_CITY;

  const sessionUser = await getSessionUser();
  let activities = await loadActiveDiscoverActivitiesForCity(city, sessionUser?.id ?? null);

  if (category) {
    activities = activities.filter((a) => a.category === category);
  }
  if (q.length >= 2) {
    activities = activities.filter((a) => {
      const blob = [a.title, a.description ?? "", a.location, a.organizerNickname].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }

  return ok({ activities });
}

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    const viewer = viewerFromUser(user);
    const createCheck = canCreateActivity(viewer);
    if (!createCheck.ok) {
      return error(
        discoverActivityErrorMessage(createCheck.code),
        discoverActivityErrorStatus(createCheck.code),
        createCheck.code,
      );
    }
    if (!user) {
      return error(discoverActivityErrorMessage("AUTH_REQUIRED"), 401, "AUTH_REQUIRED");
    }

    const body = await request.json().catch(() => null);
    const parsed = parseBody(body, createDiscoverActivitySchema);
    if (!parsed.ok) {
      return error(parsed.error, 400);
    }

    const jar = await cookies();
    const cookieCity = jar.get(DISCOVER_SERVED_CITY_COOKIE)?.value;
    const city =
      cookieCity && isDiscoverServedCity(cookieCity) ? cookieCity : DEFAULT_DISCOVER_SERVED_CITY;
    const activity = await prisma.$transaction((tx) =>
      createDiscoverActivityForUser(user, parsed.data, city, tx),
    );
    return ok({ activity }, { status: 201 });
  } catch (err) {
    if (err instanceof DiscoverActivityCreateError) {
      return error(
        discoverActivityErrorMessage(err.code),
        discoverActivityErrorStatus(err.code),
        err.code,
      );
    }
    console.error("POST /api/discover-activities", err);
    return error("Unable to create activity.", 500);
  }
}
