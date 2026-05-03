import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { format, formatDistanceToNowStrict } from "date-fns";
import { CalendarClock, ChevronRight } from "lucide-react";
import { ConnectionStatus, PlanRequestStatus, PlanType } from "@prisma/client";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { BackLink } from "@/components/nav/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { cn } from "@/lib/utils";

export default async function InboxPlansPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BackLink href="/inbox" label="Back" />
          <h1 className="text-lg font-semibold">Plans</h1>
        </div>
        <GuestAppCta returnTo="/inbox/plans" />
      </div>
    );
  }
  if (!sessionUser.onboardingComplete) {
    redirect("/onboarding");
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

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 px-0.5">
        <BackLink href="/inbox" label="Back" />
        <div>
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground">Plans</h1>
          <p className="text-[13px] leading-snug text-muted-foreground">
            Pending invites and upcoming times you confirmed in chat
          </p>
        </div>
      </div>

      {!planRequests.length ? (
        <EmptyState
          title="No active plans"
          description="Share availability or propose a time in a direct chat — it will show up here."
        />
      ) : (
        <div className="space-y-5">
          {pending.length > 0 ? (
            <section className="space-y-2">
              <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Pending
              </h2>
              <ul className="overflow-hidden rounded-[1.125rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
                {pending.map((req, i) => (
                  <PlanRequestRow key={req.id} req={req} userId={user.id} isLast={i === pending.length - 1} />
                ))}
              </ul>
            </section>
          ) : null}

          {upcoming.length > 0 ? (
            <section className="space-y-2">
              <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Upcoming
              </h2>
              <ul className="overflow-hidden rounded-[1.125rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
                {upcoming.map((req, i) => (
                  <PlanRequestRow
                    key={req.id}
                    req={req}
                    userId={user.id}
                    isLast={i === upcoming.length - 1}
                    variant="upcoming"
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
}) {
  const href = `/connections/${req.connectionId}?returnTo=%2Finbox%2Fplans` as Route;
  const imReceiver = req.receiverUserId === userId;
  const peer = imReceiver ? req.proposer : req.receiver;
  const statusLine =
    variant === "upcoming"
      ? `${format(req.startTime, "EEE, MMM d")} · ${format(req.startTime, "HH:mm")}–${format(req.endTime, "HH:mm")}`
      : imReceiver
        ? `${peer.nickname ?? "They"} invited you · ${formatDistanceToNowStrict(req.startTime, { addSuffix: true })}`
        : `Waiting on ${peer.nickname ?? "them"} · ${formatDistanceToNowStrict(req.startTime, { addSuffix: true })}`;

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
            {labelPlanType(req.planType)}
            {req.location ? ` · ${req.location}` : ""}
          </p>
          <p className="mt-0.5 text-[12px] font-medium text-foreground/85">{statusLine}</p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/45" strokeWidth={2} />
      </Link>
    </li>
  );
}

function labelPlanType(planType: PlanType) {
  switch (planType) {
    case PlanType.MEAL:
      return "Meal";
    case PlanType.SPORTS:
      return "Sports";
    case PlanType.LANGUAGE:
      return "Language";
    case PlanType.CUSTOM:
      return "Custom";
    default:
      return "Study";
  }
}
