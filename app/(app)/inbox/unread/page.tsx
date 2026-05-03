import { redirect } from "next/navigation";
import { formatDistanceToNowStrict } from "date-fns";
import { CalendarClock, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { PlanRequestStatus, ConnectionStatus } from "@prisma/client";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { DirectInboxRow } from "@/components/inbox/direct-inbox-row";
import { CourseInboxRow } from "@/components/inbox/course-inbox-row";
import { BackLink } from "@/components/nav/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getInboxMergeBundle } from "@/lib/queries/inbox-merge";
import { cn } from "@/lib/utils";

export default async function InboxUnreadPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <BackLink href="/inbox" label="Back" />
          <h1 className="text-lg font-semibold">Unread</h1>
        </div>
        <GuestAppCta returnTo="/inbox/unread" />
      </div>
    );
  }
  if (!sessionUser.onboardingComplete) {
    redirect("/onboarding");
  }
  const user = sessionUser;

  const { merged } = await getInboxMergeBundle(user.id);

  const unreadItems = merged.filter((item) => item.unreadCount > 0);

  const pendingPlans = await prisma.planRequest.findMany({
    where: {
      connection: {
        status: ConnectionStatus.ACTIVE,
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
      receiverUserId: user.id,
      status: PlanRequestStatus.PENDING,
    },
    include: {
      connection: true,
      proposer: { select: { id: true, nickname: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const hasListContent = unreadItems.length > 0 || pendingPlans.length > 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 px-0.5">
        <BackLink href="/inbox" label="Back" />
        <div>
          <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground">Unread</h1>
          <p className="text-[13px] leading-snug text-muted-foreground">
            Chats waiting on you and plan invites to respond to
          </p>
        </div>
      </div>

      {!hasListContent ? (
        <EmptyState
          title="You're all caught up"
          description="No unread messages or pending plan invites right now."
        />
      ) : (
        <div className="space-y-4">
          {pendingPlans.length > 0 ? (
            <section className="space-y-2">
              <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Plan invites
              </h2>
              <ul className="overflow-hidden rounded-[1.125rem] border border-amber-200/80 bg-amber-50/50 shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)] dark:border-amber-900/40 dark:bg-amber-950/20">
                {pendingPlans.map((req) => {
                  const peer = req.proposer;
                  const href =
                    `/connections/${req.connectionId}?returnTo=%2Finbox%2Funread` as Route;
                  const when = formatDistanceToNowStrict(req.startTime, { addSuffix: true });
                  return (
                    <li key={req.id} className="border-b border-amber-200/60 last:border-b-0 dark:border-amber-900/30">
                      <Link
                        href={href}
                        className="flex min-h-[4rem] items-center gap-3.5 px-4 py-3.5 transition-colors active:bg-amber-100/80 [@media(hover:hover)]:hover:bg-amber-100/50 dark:active:bg-amber-950/40 dark:[@media(hover:hover)]:hover:bg-amber-950/30"
                      >
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200">
                          <CalendarClock className="h-5 w-5" strokeWidth={2} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[15px] font-semibold text-foreground">
                            {req.title}
                          </p>
                          <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                            From {peer.nickname ?? "Student"} · {when}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/45" strokeWidth={2} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {unreadItems.length > 0 ? (
            <section className="space-y-2">
              <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Messages
              </h2>
              <ul
                className={cn(
                  "overflow-hidden rounded-[1.125rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]",
                  pendingPlans.length > 0 ? "mt-1" : "",
                )}
              >
                {unreadItems.map((item) =>
                  item.kind === "direct" ? (
                    <DirectInboxRow
                      key={item.connection.id}
                      userId={user.id}
                      connection={item.connection}
                      unreadCount={item.unreadCount}
                      returnTo="/inbox/unread"
                    />
                  ) : (
                    <CourseInboxRow
                      key={item.course.id}
                      userId={user.id}
                      course={item.course}
                      userCourse={item.userCourse}
                      last={item.last}
                      unreadCount={item.unreadCount}
                      returnTo="/inbox/unread"
                    />
                  ),
                )}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
