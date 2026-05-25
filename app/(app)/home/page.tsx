import { ScheduleSurface } from "@/components/home/schedule-surface";
import { HomeScheduleClient } from "@/components/home/home-schedule-client";
import { TabKeepAliveSnapshot } from "@/components/layout/tab-keep-alive";
import { getClassScheduleDateRange } from "@/lib/constants/vorlesungszeit";
import { getSessionUser } from "@/lib/auth/session";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

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

  return (
    <TabKeepAliveSnapshot tab="home">
      <HomeScheduleClient
        userId={sessionUser.id}
        nowISO={now.toISOString()}
        semesterStartISO={semesterRange.start.toISOString()}
        semesterEndISO={semesterRange.end.toISOString()}
        homeGreeting={{ nickname: sessionUser.nickname, avatarUrl: sessionUser.avatarUrl }}
        naturalScheduleEnabled
      />
    </TabKeepAliveSnapshot>
  );
}
