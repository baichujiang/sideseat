import Link from "next/link";
import type { Route } from "next";
import { ChevronRight, LogOut, Settings } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { OnboardingContinueCta } from "@/components/app/onboarding-continue-cta";
import { LogoutForm } from "@/components/auth/logout-form";
import { StudentVerificationForm } from "@/components/forms/student-verification-form";
import { MePageInstallCard } from "@/components/pwa/me-page-install-card";
import { ProfileIdentitySheets } from "@/components/profile/profile-identity-sheets";
import { MePageSection } from "@/components/profile/me-page-section";
import { FeedbackFormCard } from "@/components/profile/feedback-form-card";
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
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-4 py-3.5 transition-colors active:bg-classmates-warm-alt dark:active:bg-muted/30 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/80 text-muted-foreground">
          <Icon className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold leading-tight text-foreground">{title}</p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/50" strokeWidth={2} aria-hidden />
    </Link>
  );
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ verification?: string; tip?: string }>;
}) {
  const sessionUser = await getSessionUser();
  const query = (await searchParams) ?? {};
  const tipsEnabled = Boolean(process.env.STRIPE_SECRET_KEY?.trim());

  if (!sessionUser) {
    return (
      <div className="space-y-3 pb-2">
        <header className="px-0.5">
          <h1 className="page-screen-title">Profile</h1>
          <p className="page-screen-subtitle mt-0.5">
            Sign in to edit your public card, matching preferences, and account.
          </p>
        </header>
        <GuestAppCta
          returnTo="/profile"
          headline="Sign in to your profile"
          body="Edit your courses, verification, and how classmates find you."
        />
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
            <CardTitle className="text-base">Guest session</CardTitle>
          </div>
          <form action="/api/auth/end-guest?to=signup" method="post">
            <Button className="w-full" type="submit">
              Create an account
            </Button>
          </form>
          <form action="/api/auth/end-guest?to=login" method="post">
            <Button className="w-full" type="submit" variant="outline">
              Log in with an existing account
            </Button>
          </form>
        </Card>

        <LogoutForm>
          <Button className="w-full" type="submit" variant="ghost">
            End guest session
          </Button>
        </LogoutForm>
      </div>
    );
  }

  const blockedCount = await prisma.block.count({ where: { blockerId: user.id } });
  const isAdmin = isConfiguredAdmin(user);
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);

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
            aria-label="Admin tools"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Admin</span>
            <Link className="rounded-full bg-[#e5f1ee] px-2 py-0.5 text-[11px] font-semibold text-[#20524d]" href="/admin/reports">
              Reports
            </Link>
            <Link className="rounded-full bg-[#f4ede0] px-2 py-0.5 text-[11px] font-semibold text-[#6f4d1c]" href="/admin/verifications">
              Verify
            </Link>
            <Link className="rounded-full bg-[#eceaf5] px-2 py-0.5 text-[11px] font-semibold text-[#3f3473]" href="/admin/users">
              Users
            </Link>
            <Link className="rounded-full bg-[#e8f4fc] px-2 py-0.5 text-[11px] font-semibold text-[#1e4976]" href="/admin/feedback">
              Feedback
            </Link>
          </nav>
        ) : null}
        <h1 className="page-screen-title">Me</h1>
        <p className="page-screen-subtitle mt-0.5">
          Your public card and verification first — then app install, support, and account in a compact list below.
        </p>
      </header>

      {!user.onboardingComplete ? (
        <OnboardingContinueCta
          title="Finish setup from here or later"
          body="Your main tabs stay available now. Continue the guided setup anytime to mark your profile as complete."
        />
      ) : null}

      {query.verification === "success" ? (
        <p className="rounded-xl border border-[#d5e9df] bg-[#eef8f2] px-3 py-2 text-[13px] text-foreground">
          Student email verified — you can send invitations now.
        </p>
      ) : null}

      {query.tip === "success" ? (
        <p className="rounded-xl border border-[#d5e9df] bg-[#eef8f2] px-3 py-2 text-[13px] text-foreground">
          Thank you — that really helps. Your tip went through.
        </p>
      ) : null}

      {query.tip === "cancel" ? (
        <p className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
          No worries — you left checkout before paying, so nothing was charged.
        </p>
      ) : null}

      {/* Identity + trust */}
      <div className="space-y-6">
        <MePageSection id="me-profile-summary-heading" title="Profile">
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

        <MePageSection id="me-verification-heading" title="School verification">
          <StudentVerificationForm
            currentStatus={user.studentVerificationStatus}
            schoolCode={schoolCode}
            schoolShortLabel={schoolShort}
            notes={user.studentVerificationNotes}
            email={user.email}
            hasProofUploaded={Boolean(user.manualReviewProofUrl)}
          />
        </MePageSection>
      </div>

      {/* App, support, account, sign out */}
      <div className="space-y-3 border-t border-border/60 pt-4">
        <div className="overflow-hidden rounded-xl border border-classmates-edge bg-classmates-surface shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card">
          <div className="divide-y divide-classmates-hairline dark:divide-border/60">
            <MePageInstallCard inList />
            {tipsEnabled ? <TipSupportCard enabled inList /> : null}
            <FeedbackFormCard variant="listRow" />
            <MeDestRow
              href={'/profile/account' as Route}
              icon={Settings}
              title={ui.profile.preferencesTitle}
              subtitle={settingsSubtitle}
            />
            <LogoutForm className="block">
              <button
                type="submit"
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-classmates-warm-alt dark:active:bg-muted/30 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/80 text-muted-foreground">
                  <LogOut className="h-5 w-5 opacity-80" strokeWidth={2} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold leading-tight text-foreground">Log out</p>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">Sign out on this device</p>
                </div>
              </button>
            </LogoutForm>
          </div>
        </div>
      </div>
    </div>
  );
}
