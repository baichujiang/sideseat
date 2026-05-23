import type { Route } from "next";
import { notFound } from "next/navigation";

import { BuddyRequestDetailShell } from "@/components/discover/buddy-request-detail/buddy-request-detail-shell";
import { BackLink } from "@/components/nav/back-link";
import { DiscoverActivityAddCalendar } from "@/components/discover/discover-activity-detail/discover-activity-add-calendar";
import { DiscoverActivityBottomBar } from "@/components/discover/discover-activity-detail/discover-activity-bottom-bar";
import { DiscoverActivityContent } from "@/components/discover/discover-activity-detail/discover-activity-content";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { deriveActivityPhase } from "@/lib/discover/discover-activity-state";
import {
  discoverActivityForFeedInclude,
  prismaDiscoverActivityToRow,
} from "@/lib/discover/prisma-discover-activity-for-discover";
import { isBlockedBetween } from "@/lib/discover/discover-activity-server";
import { resolveBackHref } from "@/lib/nav/back";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function DiscoverActivityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const locale = await getServerAppLocale();
  const da = getMessages(locale).discoverActivity;
  const sessionUser = await getSessionUser();
  const now = new Date();

  const activity = await prisma.discoverActivity.findUnique({
    where: { id },
    include: discoverActivityForFeedInclude,
  });

  if (!activity) notFound();

  if (sessionUser) {
    const blocked = await isBlockedBetween(sessionUser.id, activity.organizerId);
    if (blocked && sessionUser.id !== activity.organizerId) notFound();
  }

  const row = prismaDiscoverActivityToRow(activity, sessionUser?.id ?? null, now);
  const phase = deriveActivityPhase(activity, now);
  const backHref = resolveBackHref(query.returnTo, "/discover?zone=activities");
  const activityPath = `/discover/activities/${id}?returnTo=${encodeURIComponent(backHref)}`;

  const goingRows = await prisma.discoverActivitySignup.findMany({
    where: { activityId: id, status: "GOING" },
    include: {
      user: { select: { id: true, nickname: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  const goingAttendees = goingRows.map((s) => ({
    userId: s.user.id,
    nickname: s.user.nickname?.trim() || "Student",
    avatarUrl: s.user.avatarUrl,
  }));

  let viewerHasExistingChat = false;
  if (sessionUser && sessionUser.id !== activity.organizerId) {
    const connection = await prisma.connection.findFirst({
      where: {
        status: "ACTIVE",
        OR: [
          { userAId: sessionUser.id, userBId: activity.organizerId },
          { userBId: sessionUser.id, userAId: activity.organizerId },
        ],
      },
      select: { id: true },
    });
    viewerHasExistingChat = Boolean(connection);
  }

  const calendarEntry = sessionUser
    ? await prisma.calendarEntry.findFirst({
        where: { userId: sessionUser.id, discoverActivityId: activity.id },
        select: { id: true },
      })
    : null;

  const variant = !sessionUser
    ? "guest"
    : sessionUser.id === activity.organizerId
      ? "organizer"
      : "peer";

  const signInHref = `/login?returnTo=${encodeURIComponent(activityPath)}` as Route;

  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <BackLink href={backHref as Route} fallback="/discover?zone=activities" label={getMessages(locale).common.back} />
        <h1 className="text-[17px] font-semibold text-foreground">{da.detailScreenTitle}</h1>
      </div>
      <BuddyRequestDetailShell
        bottomBar={
          <DiscoverActivityBottomBar
            activity={row}
            phase={phase}
            variant={variant}
            viewerHasExistingChat={viewerHasExistingChat}
            signInHref={variant === "guest" ? signInHref : undefined}
            activityPath={activityPath}
          />
        }
      >
        <DiscoverActivityContent activity={row} goingAttendees={goingAttendees} />
        {sessionUser && variant === "peer" && (row.viewerSignupStatus === "GOING" || calendarEntry) ? (
          <DiscoverActivityAddCalendar
            activityId={activity.id}
            initialCalendarEntryId={calendarEntry?.id ?? null}
          />
        ) : null}
      </BuddyRequestDetailShell>
    </>
  );
}
