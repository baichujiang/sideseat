import { addDays, subDays } from "date-fns";

import { ScheduleSurface } from "@/components/home/schedule-surface";
import { HomeScheduleClient } from "@/components/home/home-schedule-client";
import { TabKeepAliveSnapshot } from "@/components/layout/tab-keep-alive";
import { getClassScheduleDateRange } from "@/lib/constants/vorlesungszeit";
import { getSessionUser } from "@/lib/auth/session";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import {
  HOME_SCHEDULE_INITIAL_WINDOW_FUTURE_DAYS,
  HOME_SCHEDULE_INITIAL_WINDOW_PAST_DAYS,
} from "@/lib/home/home-schedule-constants";
import { loadHomeSchedulePayload } from "@/lib/home/load-home-schedule-payload";
import { prisma } from "@/lib/db/prisma";

export default async function HomePage() {
  const sessionUser = await getSessionUser();
  await getServerAppLocale();
  const now = new Date();
  const semesterRange = getClassScheduleDateRange({
    school: sessionUser?.school ?? null,
    now,
  });

  if (!sessionUser || sessionUser.isGuest) {
    return (
      <TabKeepAliveSnapshot tab="home">
        <ScheduleSurface
          classBlocks={[]}
          studyEntries={[]}
          companionOptions={[]}
          initialCalendarCategories={[]}
          nowISO={now.toISOString()}
          semesterStartISO={semesterRange.start.toISOString()}
          semesterEndISO={semesterRange.end.toISOString()}
          homeGreeting={{
            nickname: sessionUser?.nickname ?? null,
            avatarUrl: sessionUser?.avatarUrl ?? null,
            guestReturnTo: "/home",
          }}
        />
      </TabKeepAliveSnapshot>
    );
  }

  const initialWindowStart = subDays(now, HOME_SCHEDULE_INITIAL_WINDOW_PAST_DAYS);
  const initialWindowEnd = addDays(now, HOME_SCHEDULE_INITIAL_WINDOW_FUTURE_DAYS);
  const initialSchedulePayload = await loadHomeSchedulePayload({
    prisma,
    userId: sessionUser.id,
    windowStart: initialWindowStart,
    windowEnd: initialWindowEnd,
  }).catch((cause) => {
    console.error("Failed to load initial Home schedule payload", cause);
    return null;
  });

  return (
    <TabKeepAliveSnapshot tab="home">
      <HomeScheduleClient
        userId={sessionUser.id}
        nowISO={now.toISOString()}
        semesterStartISO={semesterRange.start.toISOString()}
        semesterEndISO={semesterRange.end.toISOString()}
        initialPayload={initialSchedulePayload ?? undefined}
        initialWindowStartISO={initialWindowStart.toISOString()}
        initialWindowEndISO={initialWindowEnd.toISOString()}
        homeGreeting={{ nickname: sessionUser.nickname, avatarUrl: sessionUser.avatarUrl }}
        naturalScheduleEnabled
      />
    </TabKeepAliveSnapshot>
  );
}
