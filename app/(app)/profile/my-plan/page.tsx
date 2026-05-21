import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CalendarClock, ChevronRight } from "lucide-react";
import { ConnectionStatus, PlanRequestStatus, PlanType } from "@prisma/client";

import { ScheduleShareLinksPanel } from "@/components/schedule-share/schedule-share-links-panel";
import { GuestAppCta } from "@/components/app/guest-app-cta";
import { BackLink } from "@/components/nav/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { resolveBackHref } from "@/lib/nav/back";
import { cn } from "@/lib/utils";

export default async function ProfileMyPlanPage({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const sessionUser = await getSessionUser();
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  const query = (await searchParams) ?? {};
  const backHref = resolveBackHref(query.returnTo, "/profile") as Route;
  const planPageReturnTo = encodeURIComponent(
    query.returnTo
      ? `/profile/my-plan?returnTo=${encodeURIComponent(query.returnTo)}`
      : "/profile/my-plan",
  );

  if (!sessionUser) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BackLink returnTo={query.returnTo} fallback="/profile" label={ui.common.back} />
          <h1 className="page-screen-title">{ui.profile.myPlanPageTitle}</h1>
        </div>
        <GuestAppCta returnTo="/profile/my-plan" />
      </div>
    );
  }
  const user = sessionUser;
  const now = new Date();

  const planRequests = await prisma.planRequest.findMany({
    where: {
      connection: {
        status: ConnectionStatus.ACTIVE,
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
      AND: [
        { OR: [{ proposerUserId: user.id }, { receiverUserId: user.id }] },
        {
          OR: [
            { status: PlanRequestStatus.PENDING },
            { status: PlanRequestStatus.ACCEPTED, endTime: { gt: now } },
          ],
        },
      ],
    },
    include: {
      proposer: { select: { id: true, nickname: true } },
      receiver: { select: { id: true, nickname: true } },
    },
    orderBy: { startTime: "asc" },
  });

  const pending = planRequests
    .filter((r) => r.status === PlanRequestStatus.PENDING)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  const upcoming = planRequests
    .filter((r) => r.status === PlanRequestStatus.ACCEPTED)
    .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  const shareLinks = await prisma.scheduleShareLink.findMany({
    where: {
      ownerUserId: user.id,
      revokedAt: null,
      expiresAt: { gt: now },
      OR: [{ usageLimit: "UNLIMITED" }, { usageLimit: "SINGLE_USE", consumedAt: null }],
    },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      rangeStart: true,
      rangeEnd: true,
      expiresAt: true,
      revokedAt: true,
      consumedAt: true,
      usageLimit: true,
      createdAt: true,
    },
  });

  const shareLinkItems = shareLinks.map((link) => ({
    id: link.id,
    rangeStart: link.rangeStart.toISOString(),
    rangeEnd: link.rangeEnd.toISOString(),
    expiresAt: link.expiresAt.toISOString(),
    revokedAt: link.revokedAt?.toISOString() ?? null,
    consumedAt: link.consumedAt?.toISOString() ?? null,
    usageLimit: link.usageLimit,
    createdAt: link.createdAt.toISOString(),
  }));

  const hasPlans = planRequests.length > 0;
  const hasActiveShareLinks = shareLinkItems.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 px-0.5">
        <BackLink returnTo={query.returnTo} fallback="/profile" label={ui.common.back} />
        <div>
          <h1 className="page-screen-title">{ui.profile.myPlanPageTitle}</h1>
          <p className="text-[13px] leading-snug text-muted-foreground">{ui.profile.myPlanPageSubtitle}</p>
        </div>
      </div>

      <ScheduleShareLinksPanel links={shareLinkItems} />

      {!hasPlans && !hasActiveShareLinks ? (
        <EmptyState title={ui.profile.myPlanEmptyTitle} description={ui.profile.myPlanEmptyDesc} />
      ) : !hasPlans ? null : (
        <div className="space-y-5">
          {pending.length > 0 ? (
            <section className="space-y-2">
              <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {ui.profile.myPlanPendingHeading}
              </h2>
              <ul className="overflow-hidden rounded-[1.125rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
                {pending.map((req, i) => (
                  <PlanRequestRow
                    key={req.id}
                    req={req}
                    userId={user.id}
                    isLast={i === pending.length - 1}
                    planLabels={ui.profile}
                    planPageReturnTo={planPageReturnTo}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {upcoming.length > 0 ? (
            <section className="space-y-2">
              <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {ui.profile.myPlanUpcomingHeading}
              </h2>
              <ul className="overflow-hidden rounded-[1.125rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
                {upcoming.map((req, i) => (
                  <PlanRequestRow
                    key={req.id}
                    req={req}
                    userId={user.id}
                    isLast={i === upcoming.length - 1}
                    variant="upcoming"
                    planLabels={ui.profile}
                    planPageReturnTo={planPageReturnTo}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}


function PlanRequestRow({
  req,
  userId,
  isLast,
  variant = "pending",
  planLabels,
  planPageReturnTo,
}: {
  req: {
    id: string;
    connectionId: string;
    planType: PlanType;
    title: string;
    location: string | null;
    startTime: Date;
    endTime: Date;
    status: PlanRequestStatus;
    proposerUserId: string;
    receiverUserId: string;
    proposer: { id: string; nickname: string | null };
    receiver: { id: string; nickname: string | null };
  };
  userId: string;
  isLast: boolean;
  variant?: "pending" | "upcoming";
  planLabels: ReturnType<typeof getMessages>["profile"];
  planPageReturnTo: string;
}) {
  const href = `/connections/${req.connectionId}?returnTo=${planPageReturnTo}` as Route;
  const imReceiver = req.receiverUserId === userId;
  const peer = imReceiver ? req.proposer : req.receiver;
  const peerName = peer.nickname?.trim() || planLabels.myPlanPeerFallback;
  const when = formatDistanceToNowStrict(req.startTime, { addSuffix: true });
  const statusLine =
    variant === "upcoming"
      ? `${format(req.startTime, "EEE, MMM d")} · ${format(req.startTime, "HH:mm")}–${format(req.endTime, "HH:mm")}`
      : imReceiver
        ? `${formatMessage(planLabels.myPlanStatusInvitedYou, { name: peerName })} · ${when}`
        : `${formatMessage(planLabels.myPlanStatusWaitingOn, { name: peerName })} · ${when}`;

  return (
    <li className={cn(!isLast && "border-b border-border/50")}>
      <Link
        href={href}
        className="flex min-h-[4.25rem] items-center gap-3.5 px-4 py-3.5 transition-colors active:bg-muted/50 [@media(hover:hover)]:hover:bg-muted/45"
      >
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
            variant === "upcoming"
              ? "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300"
              : "bg-amber-500/12 text-amber-800 dark:text-amber-200",
          )}
        >
          <CalendarClock className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-foreground">{req.title}</p>
          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
            {labelPlanType(req.planType, planLabels)}
            {req.location ? ` · ${req.location}` : ""}
          </p>
          <p className="mt-0.5 text-[12px] font-medium text-foreground/85">{statusLine}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/45" strokeWidth={2} />
      </Link>
    </li>
  );
}

function labelPlanType(planType: PlanType, planLabels: ReturnType<typeof getMessages>["profile"]) {
  switch (planType) {
    case PlanType.MEAL:
      return planLabels.myPlanTypeMeal;
    case PlanType.SPORTS:
      return planLabels.myPlanTypeSports;
    case PlanType.LANGUAGE:
      return planLabels.myPlanTypeLanguage;
    case PlanType.CUSTOM:
      return planLabels.myPlanTypeCustom;
    default:
      return planLabels.myPlanTypeStudy;
  }
}
