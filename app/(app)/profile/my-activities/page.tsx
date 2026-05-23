import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DiscoverActivityCard } from "@/components/discover/discover-activity-card";
import {
  discoverActivityForFeedInclude,
  prismaDiscoverActivityToRow,
} from "@/lib/discover/prisma-discover-activity-for-discover";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { MyActivitiesTabs } from "@/components/profile/my-activities-tabs";

export default async function MyActivitiesPage({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const user = await getSessionUser();
  if (!user || user.isGuest) {
    redirect("/login?returnTo=/profile/my-activities");
  }

  const query = (await searchParams) ?? {};
  const tab = query.tab === "joined" ? "joined" : "organized";
  const locale = await getServerAppLocale();
  const da = getMessages(locale).discoverActivity;
  const now = new Date();

  const [organized, joined] = await Promise.all([
    prisma.discoverActivity.findMany({
      where: { organizerId: user.id },
      include: discoverActivityForFeedInclude,
      orderBy: { startAt: "desc" },
      take: 80,
    }),
    prisma.discoverActivity.findMany({
      where: {
        signups: { some: { userId: user.id, status: "GOING" } },
        organizerId: { not: user.id },
      },
      include: discoverActivityForFeedInclude,
      orderBy: { startAt: "desc" },
      take: 80,
    }),
  ]);

  const rows =
    tab === "joined"
      ? joined.map((a) => prismaDiscoverActivityToRow(a, user.id, now))
      : organized.map((a) => prismaDiscoverActivityToRow(a, user.id, now));

  return (
    <div className="-mx-3 space-y-4 px-3 pb-6">
      <header className="space-y-1">
        <Link href={"/profile" as Route} className="text-[13px] font-medium text-classmates-blue">
          ← {getMessages(locale).common.back}
        </Link>
        <h1 className="text-[22px] font-bold text-foreground">{da.myActivitiesTitle}</h1>
      </header>

      <MyActivitiesTabs active={tab} labels={da} />

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-border/70 bg-card/40 px-4 py-8 text-center text-[13px] text-muted-foreground">
          {tab === "joined" ? da.myActivitiesEmptyJoined : da.myActivitiesEmptyOrganized}
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((activity) => (
            <DiscoverActivityCard key={activity.id} activity={activity} />
          ))}
        </div>
      )}
    </div>
  );
}
