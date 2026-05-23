import { DiscoverActivityStatus } from "@prisma/client";
import { cookies } from "next/headers";

import { getSessionUser } from "@/lib/auth/session";
import {
  DISCOVER_ACTIVITY_DEFAULT_DURATION_MS,
  MAX_OPEN_DISCOVER_ACTIVITIES_PER_USER,
} from "@/lib/constants/discover-activity";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import { DISCOVER_SERVED_CITY_COOKIE } from "@/lib/discover/discover-city-preference";
import {
  discoverActivityErrorMessage,
  discoverActivityErrorStatus,
} from "@/lib/discover/discover-activity-api-messages";
import { loadActiveDiscoverActivitiesForCity } from "@/lib/discover/load-active-discover-activities-for-city";
import {
  discoverActivityForFeedInclude,
  prismaDiscoverActivityToRow,
} from "@/lib/discover/prisma-discover-activity-for-discover";
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

    const values = parsed.data;
    const startAt = new Date(values.startAt);
    const endAt = new Date(startAt.getTime() + DISCOVER_ACTIVITY_DEFAULT_DURATION_MS);
    const capacity = values.unlimitedCapacity ? null : (values.capacity ?? null);

    const jar = await cookies();
    const cookieCity = jar.get(DISCOVER_SERVED_CITY_COOKIE)?.value;
    const city =
      cookieCity && isDiscoverServedCity(cookieCity) ? cookieCity : DEFAULT_DISCOVER_SERVED_CITY;
    const school = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;

    const now = new Date();
    const openCount = await prisma.discoverActivity.count({
      where: {
        organizerId: user.id,
        status: { in: [DiscoverActivityStatus.OPEN, DiscoverActivityStatus.FULL] },
        startAt: { gt: now },
      },
    });
    if (openCount >= MAX_OPEN_DISCOVER_ACTIVITIES_PER_USER) {
      return error(
        discoverActivityErrorMessage("CREATE_LIMIT"),
        discoverActivityErrorStatus("CREATE_LIMIT"),
        "CREATE_LIMIT",
      );
    }

    const created = await prisma.discoverActivity.create({
      data: {
        organizerId: user.id,
        city,
        school,
        title: values.title.trim(),
        description: values.description.trim(),
        startAt,
        endAt,
        location: values.location.trim(),
        capacity,
        status: DiscoverActivityStatus.OPEN,
      },
      include: discoverActivityForFeedInclude,
    });

    const activity = prismaDiscoverActivityToRow(created, user.id, now);
    return ok({ activity }, { status: 201 });
  } catch (err) {
    console.error("POST /api/discover-activities", err);
    return error("Unable to create activity.", 500);
  }
}
