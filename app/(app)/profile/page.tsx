import Link from "next/link";
import type { Route } from "next";
import { Bookmark, CalendarClock, ChevronRight, Settings, SquarePen } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { OnboardingContinueCta } from "@/components/app/onboarding-continue-cta";
import { LogoutForm } from "@/components/auth/logout-form";
import { StudentVerificationForm } from "@/components/forms/student-verification-form";
import { MePageInstallCard } from "@/components/pwa/me-page-install-card";
import {
  MeSettingsRowLabel,
  meSettingsRowChevronClass,
  meSettingsRowMutedIconShellClass,
  meSettingsRowLeadClass,
  meSettingsRowLinkClass,
} from "@/components/profile/me-settings-row";
import { ProfileIdentitySheets } from "@/components/profile/profile-identity-sheets";
import { MePageSection } from "@/components/profile/me-page-section";
import { FeedbackFormCard } from "@/components/profile/feedback-form-card";
import { PushNotificationsCard } from "@/components/profile/push-notifications-card";
import { TipSupportCard } from "@/components/profile/tip-support-card";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/session";
import { isConfiguredAdmin } from "@/lib/constants/app";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { DEGREE_LEVEL_LABELS } from "@/lib/constants/majors";
import { DEFAULT_SCHOOL, normalizeSchoolCode, schoolOptions } from "@/lib/constants/schools";
import { profileLanguagesFormDefault } from "@/lib/constants/languages";
import { prisma } from "@/lib/db/prisma";

function MeDestRow({
  href,
  icon: Icon,
  title,
  subtitle,
}: {
  href: Route;
  icon: LucideIcon;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href} className={meSettingsRowLinkClass}>
      <div className={meSettingsRowLeadClass}>
        <span className={meSettingsRowMutedIconShellClass}>
          <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <MeSettingsRowLabel title={title} subtitle={subtitle} />
      </div>
      <ChevronRight className={meSettingsRowChevronClass} strokeWidth={2} aria-hidden />
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
    return (
      <div className="space-y-3 pb-2">
        <header className="px-0.5">
          <h1 className="page-screen-title">{ui.me.guestScreenTitle}</h1>
          <p className="page-screen-subtitle mt-0.5">{ui.me.guestScreenSubtitle}</p>
        </header>
        <GuestAppCta returnTo="/profile" headline={ui.guest.profileHeadline} body={ui.guest.profileBody} />
      </div>
    );
  }
  const user = sessionUser;

  if (user.isGuest) {
    return (
      <div className="space-y-6">
        <Card className="space-y-3 border-dashed border-primary/30 bg-muted/30">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground">
              G
            </div>
            <CardTitle className="text-base">{ui.me.guestSessionTitle}</CardTitle>
          </div>
          <form action="/api/auth/end-guest?to=signup" method="post">
            <Button className="w-full" type="submit">
              {ui.me.createAccount}
            </Button>
          </form>
          <form action="/api/auth/end-guest?to=login" method="post">
            <Button className="w-full" type="submit" variant="outline">
              {ui.me.logInExisting}
            </Button>
          </form>
        </Card>

        <LogoutForm>
          <Button className="w-full" type="submit" variant="ghost">
            {ui.me.endGuestSession}
          </Button>
        </LogoutForm>
      </div>
    );
  }

  const blockedCount = await prisma.block.count({ where: { blockerId: user.id } });
  const isAdmin = isConfiguredAdmin(user);

  const profileForSheet = await prisma.user.findUnique({
    where: { id: user.id },
    include: { userLanguages: true },
  });

  const schoolCode = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
  const schoolShort = schoolOptions.find((s) => s.value === schoolCode)?.shortLabel ?? schoolCode;
  const sheetProfileFormKey = `${user.id}-${user.updatedAt.getTime()}`;

  const settingsSubtitle =
    blockedCount === 0
      ? ui.profile.preferencesSubtitleNone
      : blockedCount === 1
        ? ui.profile.preferencesSubtitleOne
        : formatMessage(ui.profile.preferencesSubtitleMany, { count: blockedCount });

  return (
    <div className="space-y-3 pb-2">
      <header className="px-0.5">
        {isAdmin ? (
          <nav
            className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 pb-2"
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
        <h1 className="page-screen-title">{ui.me.screenTitle}</h1>
        <p className="page-screen-subtitle mt-0.5">{ui.me.screenSubtitle}</p>
      </header>

      {!user.onboardingComplete ? (
        <OnboardingContinueCta title={ui.onboarding.meTitle} body={ui.onboarding.meBody} />
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

      {/* Identity + trust */}
      <div className="space-y-6">
        <MePageSection id="me-profile-summary-heading" title={ui.me.profileSectionTitle}>
          <ProfileIdentitySheets
            variant="summary"
            gender={user.gender}
            sheetProfileFormKey={sheetProfileFormKey}
            sheetProfileInitialValues={{
              nickname: user.nickname ?? "",
              gender: user.gender,
              school: schoolCode,
              degreeLevel: user.degreeLevel ?? "BACHELOR",
              major: user.major ?? "",
              semester: user.semester ?? 1,
              languages: profileLanguagesFormDefault(profileForSheet?.userLanguages ?? []),
              bio: user.bio ?? "",
              wechatHandle: user.wechatHandle ?? "",
              whatsappHandle: user.whatsappHandle ?? "",
              telegramHandle: user.telegramHandle ?? "",
              instagramHandle: user.instagramHandle ?? "",
              discoverByCourse: user.discoverByCourse,
              discoverByMajor: user.discoverByMajor,
              discoverBySemester: user.discoverBySemester,
              allowInvitationNotes: user.allowInvitationNotes,
              contactInfoOptIn: user.contactInfoOptIn,
              hideFromCourseMembers: user.hideFromCourseMembers,
            }}
            schoolSummary={{
              schoolShort,
              degreeLabel: DEGREE_LEVEL_LABELS[user.degreeLevel ?? "BACHELOR"],
              major: user.major?.trim() ?? "",
              semester: user.semester ?? 1,
            }}
            initialAvatarUrl={user.avatarUrl}
            initialBio={user.bio}
            initialNickname={user.nickname}
          />
        </MePageSection>

        <MePageSection id="me-verification-heading" title={ui.me.verificationSectionTitle}>
          <StudentVerificationForm
            currentStatus={user.studentVerificationStatus}
            schoolCode={schoolCode}
            schoolShortLabel={schoolShort}
            notes={user.studentVerificationNotes}
            email={user.email}
            hasProofUploaded={Boolean(user.manualReviewProofUrl)}
          />
        </MePageSection>

        <MePageSection id="me-push-heading" density="compact">
          <PushNotificationsCard />
        </MePageSection>

        {tipsEnabled ? (
          <MePageSection id="me-tip-heading" density="compact">
            <TipSupportCard enabled t={ui.tip} />
          </MePageSection>
        ) : null}
      </div>

      {/* App, support, account */}
      <div className="space-y-3 border-t border-border/60 pt-4">
        <div className="overflow-hidden rounded-xl border border-classmates-edge bg-classmates-surface shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card">
          <div className="divide-y divide-classmates-hairline dark:divide-border/60">
            <MeDestRow
              href={'/profile/my-posts' as Route}
              icon={SquarePen}
              title={ui.profile.myPostsRowTitle}
              subtitle={ui.profile.myPostsRowSubtitle}
            />
            <MeDestRow
              href={'/profile/saved-posts' as Route}
              icon={Bookmark}
              title={ui.profile.savedPostsRowTitle}
              subtitle={ui.profile.savedPostsRowSubtitle}
            />
            <MeDestRow
              href={'/profile/my-plan' as Route}
              icon={CalendarClock}
              title={ui.profile.myPlanRowTitle}
              subtitle={ui.profile.myPlanRowSubtitle}
            />
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
      </div>
    </div>
  );
}
