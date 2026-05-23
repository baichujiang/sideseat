import Link from "next/link";
import type { Route } from "next";
import { Bookmark, CalendarClock, ChevronRight, Settings, SquarePen } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { MeGuestScreen } from "@/components/profile/me-guest-screen";
import { MePageInstallCard } from "@/components/pwa/me-page-install-card";
import {
  MePageSettingsRowLabel,
  mePageCardClass,
  mePageChevronClass,
  mePageIconMutedClass,
  mePageIconMyPlanClass,
  mePageIconMyPlanShellClass,
  mePageIconMyPostsClass,
  mePageIconMyPostsShellClass,
  mePageIconSavedPostsClass,
  mePageIconSavedPostsShellClass,
  mePageIconShellClass,
  mePageListDivideClass,
  mePageRowInteractiveClass,
  mePageRowLeadClass,
} from "@/components/profile/me-settings-row";
import { ProfileMeDisplayCard } from "@/components/profile/profile-me-display-card";
import { MePageSection } from "@/components/profile/me-page-section";
import { FeedbackFormCard } from "@/components/profile/feedback-form-card";
import { PushNotificationsCard } from "@/components/profile/push-notifications-card";
import { TipSupportCard } from "@/components/profile/tip-support-card";
import { getSessionUser } from "@/lib/auth/session";
import { isConfiguredAdmin } from "@/lib/constants/app";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { DEGREE_LEVEL_LABELS } from "@/lib/constants/majors";
import { DEFAULT_SCHOOL, normalizeSchoolCode, schoolOptions } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
function MeDestRow({
  href,
  icon: Icon,
  title,
  subtitle,
  iconShellClass = mePageIconShellClass,
  iconClass = mePageIconMutedClass,
}: {
  href: Route;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  iconShellClass?: string;
  iconClass?: string;
}) {
  return (
    <Link href={href} className={mePageRowInteractiveClass}>
      <div className={mePageRowLeadClass}>
        <span className={iconShellClass}>
          <Icon className={iconClass} strokeWidth={2} aria-hidden />
        </span>
        <MePageSettingsRowLabel title={title} subtitle={subtitle} />
      </div>
      <ChevronRight className={mePageChevronClass} strokeWidth={2} aria-hidden />
    </Link>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ verification?: string; tip?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  const sessionUser = await getSessionUser();
  const tipsEnabled = Boolean(process.env.STRIPE_SECRET_KEY?.trim());

  if (!sessionUser) {
    return <MeGuestScreen mode="anonymous" />;
  }
  const user = sessionUser;

  if (user.isGuest) {
    return (
      <MeGuestScreen
        mode="guest-session"
        guestNickname={user.nickname}
        guestAvatarUrl={user.avatarUrl}
      />
    );
  }

  const blockedCount = await prisma.block.count({ where: { blockerId: user.id } });
  const isAdmin = isConfiguredAdmin(user);

  const schoolCode = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
  const schoolShort = schoolOptions.find((s) => s.value === schoolCode)?.shortLabel ?? schoolCode;
  const settingsSubtitle =
    blockedCount === 0
      ? ui.profile.preferencesSubtitleNone
      : blockedCount === 1
        ? ui.profile.preferencesSubtitleOne
        : formatMessage(ui.profile.preferencesSubtitleMany, { count: blockedCount });

  return (
    <div className="-mx-3 space-y-5 bg-classmates-warm-alt px-5 pb-2 pt-1 dark:bg-background">
      {isAdmin ? (
          <nav
            className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 px-0.5 pb-2"
            aria-label={ui.me.adminNavAria}
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {ui.me.adminLabel}
            </span>
            <Link className="rounded-full bg-[#e5f1ee] px-2 py-0.5 text-[11px] font-semibold text-[#20524d]" href="/admin/reports">
              {ui.me.adminReports}
            </Link>
            <Link className="rounded-full bg-[#f4ede0] px-2 py-0.5 text-[11px] font-semibold text-[#6f4d1c]" href="/admin/verifications">
              {ui.me.adminVerify}
            </Link>
            <Link className="rounded-full bg-[#eceaf5] px-2 py-0.5 text-[11px] font-semibold text-[#3f3473]" href="/admin/users">
              {ui.me.adminUsers}
            </Link>
            <Link className="rounded-full bg-[#e8f4fc] px-2 py-0.5 text-[11px] font-semibold text-[#1e4976]" href="/admin/feedback">
              {ui.me.adminFeedback}
            </Link>
          </nav>
      ) : null}

      {query.verification === "success" ? (
        <p className="rounded-xl border border-[#d5e9df] bg-[#eef8f2] px-3 py-2 text-[13px] text-foreground">
          {ui.me.verificationSuccessBanner}
        </p>
      ) : null}

      {query.tip === "success" ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-[13px] text-foreground dark:border-amber-800/40 dark:bg-amber-950/20">
          {ui.me.tipSuccessBanner}
        </p>
      ) : null}

      {query.tip === "cancel" ? (
        <p className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-[13px] text-muted-foreground">
          {ui.me.tipCancelBanner}
        </p>
      ) : null}

      <ProfileMeDisplayCard
        locale={locale}
        nickname={user.nickname}
        bio={user.bio}
        avatarUrl={user.avatarUrl}
        gender={user.gender}
        schoolSummary={{
          schoolShort,
          degreeLabel: DEGREE_LEVEL_LABELS[user.degreeLevel ?? "BACHELOR"],
          major: user.major?.trim() ?? "",
          semester: user.semester ?? 1,
        }}
      />

      <div className={mePageCardClass}>
        <div className={mePageListDivideClass}>
          <MeDestRow
            href={'/profile/my-posts' as Route}
            icon={SquarePen}
            iconShellClass={mePageIconMyPostsShellClass}
            iconClass={mePageIconMyPostsClass}
            title={ui.profile.myPostsRowTitle}
            subtitle={ui.profile.myPostsRowSubtitle}
          />
          <MeDestRow
            href={'/profile/saved-posts' as Route}
            icon={Bookmark}
            iconShellClass={mePageIconSavedPostsShellClass}
            iconClass={mePageIconSavedPostsClass}
            title={ui.profile.savedPostsRowTitle}
            subtitle={ui.profile.savedPostsRowSubtitle}
          />
          <MeDestRow
            href={'/profile/my-plan' as Route}
            icon={CalendarClock}
            iconShellClass={mePageIconMyPlanShellClass}
            iconClass={mePageIconMyPlanClass}
            title={ui.profile.myPlanRowTitle}
            subtitle={ui.profile.myPlanRowSubtitle}
          />
        </div>
      </div>

      <MePageSection id="me-push-heading" density="compact">
        <PushNotificationsCard />
      </MePageSection>

      <div className={mePageCardClass}>
        <div className={mePageListDivideClass}>
          <MePageInstallCard inList />
          <FeedbackFormCard variant="listRow" />
          <MeDestRow
            href={'/profile/account' as Route}
            icon={Settings}
            title={ui.profile.preferencesTitle}
            subtitle={settingsSubtitle}
          />
        </div>
      </div>

      {tipsEnabled ? (
        <MePageSection id="me-tip-heading" density="compact">
          <TipSupportCard enabled t={ui.tip} />
        </MePageSection>
      ) : null}

    </div>
  );
}
