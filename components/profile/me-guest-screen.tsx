"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  BookOpen,
  Bookmark,
  CalendarClock,
  ChevronRight,
  Lock,
  ShieldCheck,
  Sparkles,
  SquarePen,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { LogoutForm } from "@/components/auth/logout-form";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/ui/link-button";
import {
  MePageSettingsRowLabel,
  mePageCardClass,
  mePageChevronClass,
  mePageIconCoursesClass,
  mePageIconCoursesShellClass,
  mePageIconMyPlanClass,
  mePageIconMyPlanShellClass,
  mePageIconMyPostsClass,
  mePageIconMyPostsShellClass,
  mePageIconSavedPostsClass,
  mePageIconSavedPostsShellClass,
  mePageListDivideClass,
  mePageRowInteractiveClass,
  mePageRowLeadClass,
} from "@/components/profile/me-settings-row";
import { useAppMessages } from "@/hooks/use-app-locale";
import { withReturnTo } from "@/lib/nav/back";
import { cn } from "@/lib/utils";

type MeGuestMode = "anonymous" | "guest-session";

function MeGuestLockedRow({
  icon: Icon,
  title,
  subtitle,
  iconShellClass,
  iconClass,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  iconShellClass: string;
  iconClass: string;
}) {
  const m = useAppMessages();

  return (
    <div
      className="flex min-h-[72px] items-center justify-between gap-3 px-5 opacity-[0.72]"
      aria-hidden
    >
      <div className={mePageRowLeadClass}>
        <span className={iconShellClass}>
          <Icon className={iconClass} strokeWidth={2} aria-hidden />
        </span>
        <MePageSettingsRowLabel title={title} subtitle={subtitle} />
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        <Lock className="h-3 w-3" strokeWidth={2.5} aria-hidden />
        {m.me.guestLockedLabel}
      </span>
    </div>
  );
}

function MeGuestCoursesRow() {
  const m = useAppMessages();

  return (
    <Link href={"/courses" as Route} className={mePageRowInteractiveClass}>
      <div className={mePageRowLeadClass}>
        <span className={mePageIconCoursesShellClass}>
          <BookOpen className={mePageIconCoursesClass} strokeWidth={2} aria-hidden />
        </span>
        <MePageSettingsRowLabel
          title={m.profile.coursesRowTitle}
          subtitle={m.profile.coursesRowSubtitle}
        />
      </div>
      <ChevronRight className={mePageChevronClass} strokeWidth={2} aria-hidden />
    </Link>
  );
}

export function MeGuestScreen({
  mode,
  guestNickname,
  guestAvatarUrl,
}: {
  mode: MeGuestMode;
  guestNickname?: string | null;
  guestAvatarUrl?: string | null;
}) {
  const m = useAppMessages();
  const returnTo = "/profile";
  const loginHref = withReturnTo("/login", returnTo) as Route;
  const signupHref = withReturnTo("/signup", returnTo) as Route;
  const isGuestSession = mode === "guest-session";
  const displayName =
    guestNickname?.trim() || m.home.guestDisplayName;

  const identityIconShell = cn(
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
    "bg-gradient-to-br from-sky-400/25 to-indigo-400/20 text-sky-700 dark:from-sky-400/15 dark:to-indigo-400/14 dark:text-sky-300",
  );

  return (
    <div className="-mx-3 space-y-5 bg-classmates-warm-alt px-5 pb-8 pt-1 dark:bg-background">
      <section
        className={cn(
          "relative overflow-hidden rounded-[28px] border px-5 py-7 text-center",
          "border-blue-200/55 bg-gradient-to-br from-white via-[#f8fafc] to-[#eff6ff]",
          "shadow-[0_10px_40px_-12px_rgba(37,99,235,0.22)]",
          "dark:border-blue-800/45 dark:from-card dark:via-card dark:to-blue-950/35 dark:shadow-[0_10px_40px_-12px_rgba(0,0,0,0.35)]",
        )}
      >
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-blue-400/15 blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-8 -left-8 h-28 w-28 rounded-full bg-indigo-400/12 blur-2xl"
          aria-hidden
        />

        <div className="relative flex flex-col items-center">
          {isGuestSession ? (
            <span
              className={cn(
                "inline-flex h-[88px] w-[88px] items-center justify-center overflow-hidden rounded-full",
                "border-2 border-white/90 shadow-[0_4px_20px_rgba(37,99,235,0.2)]",
                "dark:border-blue-900/60 dark:shadow-[0_4px_20px_rgba(0,0,0,0.35)]",
              )}
            >
              <PresetAvatar id={guestAvatarUrl} size={88} className="h-[88px] w-[88px]" />
            </span>
          ) : (
            <span
              className={cn(
                "inline-flex h-[88px] w-[88px] items-center justify-center rounded-full",
                "bg-gradient-to-br from-[#2563EB] to-indigo-600 shadow-[0_6px_24px_rgba(37,99,235,0.35)]",
              )}
            >
              <UserRound className="h-11 w-11 text-white" strokeWidth={1.75} aria-hidden />
            </span>
          )}

          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-classmates-blue dark:bg-blue-500/15 dark:text-blue-400">
            <Sparkles className="h-3 w-3 shrink-0" strokeWidth={2.5} aria-hidden />
            {m.me.guestHeroBadge}
          </span>

          <h1 className="mt-3 text-[22px] font-bold leading-tight tracking-tight text-[#111827] dark:text-foreground">
            {isGuestSession ? (
              <>
                <span className="text-classmates-blue dark:text-blue-400">{displayName}</span>
                <span className="mt-1 block text-[17px] font-semibold text-foreground">
                  {m.me.guestSessionTitle}
                </span>
              </>
            ) : (
              m.guest.profileHeadline
            )}
          </h1>

          <p className="mx-auto mt-2.5 max-w-[300px] text-[13px] leading-relaxed text-muted-foreground">
            {m.guest.profileBody}
          </p>
        </div>
      </section>

      <section aria-labelledby="me-guest-more-heading">
        <h2
          id="me-guest-more-heading"
          className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {m.profile.landingSectionMore}
        </h2>
        <div className={mePageCardClass}>
          <MeGuestCoursesRow />
        </div>
      </section>

      <section aria-labelledby="me-guest-unlock-heading">
        <h2
          id="me-guest-unlock-heading"
          className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
        >
          {m.me.guestUnlockSection}
        </h2>
        <div className={mePageCardClass}>
          <div className={mePageListDivideClass}>
            <MeGuestLockedRow
              icon={UserRound}
              title={m.me.profileSectionTitle}
              subtitle={m.me.guestPreviewIdentitySubtitle}
              iconShellClass={identityIconShell}
              iconClass="h-5 w-5"
            />
            <MeGuestLockedRow
              icon={SquarePen}
              title={m.profile.myPostsRowTitle}
              subtitle={m.profile.myPostsRowSubtitle}
              iconShellClass={mePageIconMyPostsShellClass}
              iconClass={mePageIconMyPostsClass}
            />
            <MeGuestLockedRow
              icon={Bookmark}
              title={m.profile.savedPostsRowTitle}
              subtitle={m.profile.savedPostsRowSubtitle}
              iconShellClass={mePageIconSavedPostsShellClass}
              iconClass={mePageIconSavedPostsClass}
            />
            <MeGuestLockedRow
              icon={CalendarClock}
              title={m.profile.myPlanRowTitle}
              subtitle={m.profile.myPlanRowSubtitle}
              iconShellClass={mePageIconMyPlanShellClass}
              iconClass={mePageIconMyPlanClass}
            />
            <MeGuestLockedRow
              icon={ShieldCheck}
              title={m.me.verificationSectionTitle}
              subtitle={m.me.guestPreviewVerificationSubtitle}
              iconShellClass={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-full",
                "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/35 dark:text-emerald-400",
              )}
              iconClass="h-5 w-5"
            />
          </div>
        </div>
      </section>

      <section
        className={cn(
          "rounded-[22px] border border-classmates-edge bg-classmates-surface px-4 py-5",
          "shadow-[0_2px_20px_-6px_rgba(15,23,42,0.08)] dark:border-border dark:bg-card dark:shadow-none",
        )}
        aria-label={m.guest.profileHeadline}
      >
        {isGuestSession ? (
          <div className="grid gap-2.5">
            <form action="/api/auth/end-guest?to=signup" method="post">
              <Button className="min-h-11 w-full text-[15px]" type="submit">
                {m.me.createAccount}
              </Button>
            </form>
            <form action="/api/auth/end-guest?to=login" method="post">
              <Button className="min-h-11 w-full text-[15px]" type="submit" variant="outline">
                {m.me.logInExisting}
              </Button>
            </form>
            <LogoutForm>
              <Button
                className="min-h-10 w-full text-[13px] text-muted-foreground"
                type="submit"
                variant="ghost"
              >
                {m.me.endGuestSession}
              </Button>
            </LogoutForm>
          </div>
        ) : (
          <>
            <div className="grid gap-2.5">
              <LinkButton href={signupHref} className="min-h-11 w-full text-[15px]">
                {m.guest.createAccount}
              </LinkButton>
              <LinkButton
                href={loginHref}
                variant="outline"
                className="min-h-11 w-full text-[15px]"
              >
                {m.guest.logIn}
              </LinkButton>
            </div>
            <p className="mt-3 text-center text-[11px] leading-snug text-muted-foreground">
              {m.guest.browsePrivateHint}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
