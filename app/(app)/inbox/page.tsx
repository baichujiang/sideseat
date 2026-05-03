import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import type { ReactNode } from "react";
import { BellDot, CalendarRange, FileText } from "lucide-react";

import { DirectInboxRow } from "@/components/inbox/direct-inbox-row";
import { CourseInboxRow } from "@/components/inbox/course-inbox-row";
import { EmptyState } from "@/components/ui/empty-state";
import { GuestAppCta } from "@/components/app/guest-app-cta";
import { getSessionUser } from "@/lib/auth/session";
import { getInboxMergeBundle } from "@/lib/queries/inbox-merge";

export default async function InboxPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground">Chats, course rooms, and people you can reach</p>
        </header>
        <GuestAppCta
          returnTo="/inbox"
          headline="Sign in to see contacts"
          body="Your inbox syncs across devices once you log in."
        />
      </div>
    );
  }
  if (!sessionUser.onboardingComplete) {
    redirect("/onboarding");
  }
  const user = sessionUser;

  const { merged, unreadTotal, plansNeedingYourAction, activePostCount } = await getInboxMergeBundle(
    user.id,
  );

  return (
    <div className="space-y-5">
      <header className="space-y-1 px-0.5">
        <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground">Contacts</h1>
        <p className="text-[13px] leading-snug text-muted-foreground">
          Course chats and direct conversations
        </p>
      </header>

      <section className="grid grid-cols-3 gap-2.5">
        <InboxShortcut
          href="/inbox/unread"
          icon={<BellDot className="h-5 w-5" strokeWidth={2} aria-hidden />}
          label="Unread"
          count={unreadTotal}
        />
        <InboxShortcut
          href="/inbox/plans"
          icon={<CalendarRange className="h-5 w-5" strokeWidth={2} aria-hidden />}
          label="Plans"
          count={plansNeedingYourAction}
        />
        <InboxShortcut
          href="/inbox/my-posts"
          icon={<FileText className="h-5 w-5" strokeWidth={2} aria-hidden />}
          label="My posts"
          count={activePostCount}
        />
      </section>

      <section className="space-y-2">
        {merged.length ? (
          <ul className="overflow-hidden rounded-[1.125rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
            {merged.map((item) =>
              item.kind === "direct" ? (
                <DirectInboxRow key={item.connection.id} userId={user.id} connection={item.connection} />
              ) : (
                <CourseInboxRow
                  key={item.course.id}
                  userId={user.id}
                  course={item.course}
                  userCourse={item.userCourse}
                  last={item.last}
                />
              ),
            )}
          </ul>
        ) : (
          <EmptyState
            title="No conversations yet"
            description="Join a course to see its group chat, or start a direct chat from Discover."
          />
        )}
      </section>
    </div>
  );
}

function InboxShortcut({
  href,
  icon,
  label,
  count,
}: {
  href: Route;
  icon: ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[4.75rem] flex-col items-center justify-center gap-1.5 rounded-[1rem] border border-border/60 bg-card px-2.5 py-2.5 text-center shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] transition-colors active:bg-muted/40 [@media(hover:hover)]:hover:bg-muted/30"
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
        {icon}
        {(count ?? 0) > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-500 px-1 py-0.5 text-[10px] font-semibold leading-none text-white">
            {count}
          </span>
        ) : null}
      </span>
      <p className="max-w-full truncate text-[12px] font-semibold leading-tight">{label}</p>
    </Link>
  );
}
