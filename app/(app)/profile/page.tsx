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
import { ContactRemarkEditor } from "@/components/chat/contact-remark-editor";
import { FeedbackFormCard } from "@/components/profile/feedback-form-card";
import { TipSupportCard } from "@/components/profile/tip-support-card";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/session";
import { isConfiguredAdmin } from "@/lib/constants/app";
import { DEGREE_LEVEL_LABELS } from "@/lib/constants/majors";
import { DEFAULT_SCHOOL, normalizeSchoolCode, schoolOptions } from "@/lib/constants/schools";
import { profileLanguagesFormDefault } from "@/lib/constants/languages";
import { contactRemarkForViewer } from "@/lib/connections/contact-remark";
import { prisma } from "@/lib/db/prisma";
import { findOrCreateSelfNotesConnection } from "@/lib/queries/self-notes-connection";
import { cn } from "@/lib/utils";
function MeDestRow({
  href,
  icon: Icon,
  title,
  subtitle,
  compact = false,
}: {
  href: Route;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center justify-between gap-3 transition-colors active:bg-classmates-warm-alt dark:active:bg-muted/30 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25",
        compact ? "px-3 py-2.5" : "px-4 py-3.5",
      )}
    >
      <div className={cn("flex min-w-0 items-center", compact ? "gap-2.5" : "gap-3")}>
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-muted/80 text-muted-foreground",
            compact ? "h-8 w-8" : "h-10 w-10",
          )}
        >
          <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className={cn("font-semibold leading-tight text-foreground", compact ? "text-[13px]" : "text-[14px]")}>
            {title}
          </p>
          <p
            className={cn(
              "leading-snug text-muted-foreground",
              compact ? "mt-0.5 text-[11px]" : "mt-0.5 text-[12px]",
            )}
          >
            {subtitle}
          </p>
        </div>
      </div>
      <ChevronRight
        className={cn("shrink-0 text-muted-foreground/50", compact ? "h-4 w-4" : "h-5 w-5")}
        strokeWidth={2}
        aria-hidden
      />
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

  const { connectionId: selfNotesConnectionId } = await findOrCreateSelfNotesConnection(user.id);
  const selfNotesConnection = await prisma.connection.findUnique({
    where: { id: selfNotesConnectionId },
    select: {
      userAId: true,
      userBId: true,
      contactRemarkByA: true,
      contactRemarkByB: true,
    },
  });
  const selfNotesRemark =
    selfNotesConnection != null ? contactRemarkForViewer(selfNotesConnection, user.id) : null;

  const profileForSheet = await prisma.user.findUnique({
    where: { id: user.id },
    include: { userLanguages: true },
  });

  const schoolCode = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
  const schoolShort = schoolOptions.find((s) => s.value === schoolCode)?.shortLabel ?? schoolCode;
  const sheetProfileFormKey = `${user.id}-${user.updatedAt.getTime()}`;

  const settingsSubtitle =
    blockedCount === 0
      ? "Notifications, blocked users, about, delete account"
      : blockedCount === 1
        ? "Notifications, 1 blocked user, about, delete account"
        : `Notifications, ${blockedCount} blocked users, about, delete account`;

  return (
    <div className="space-y-3 pb-2">
      <header className="px-0.5">
        <h1 className="page-screen-title">Me</h1>
        <p className="page-screen-subtitle mt-0.5">
          Your public card and verification first — install, tips, feedback, and account settings below.
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
          Payment completed — thank you for your support.
        </p>
      ) : null}

      {query.tip === "cancel" ? (
        <p className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2 text-[13px] text-muted-foreground">
          Checkout was cancelled. No charge was made.
        </p>
      ) : null}

      {/* Identity + trust */}
      <div className="space-y-6">
        <MePageSection id="me-profile-summary-heading" title="Profile">
          <ProfileIdentitySheets
            variant="summary"
            gender={user.gender}
            belowDisplayName={
              <ContactRemarkEditor
                connectionId={selfNotesConnectionId}
                initialRemark={selfNotesRemark}
                isSelfNotes
                variant="underName"
              />
            }
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
        {isAdmin ? (
          <div className="flex flex-wrap gap-1.5 rounded-lg border border-border/80 bg-muted/30 px-2.5 py-2">
            <span className="w-full text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Admin</span>
            <Link className="rounded-full bg-[#e5f1ee] px-2.5 py-1 text-[11px] font-semibold text-[#20524d]" href="/admin/reports">
              Reports
            </Link>
            <Link className="rounded-full bg-[#f4ede0] px-2.5 py-1 text-[11px] font-semibold text-[#6f4d1c]" href="/admin/verifications">
              Verify
            </Link>
            <Link className="rounded-full bg-[#eceaf5] px-2.5 py-1 text-[11px] font-semibold text-[#3f3473]" href="/admin/users">
              Users
            </Link>
            <Link className="rounded-full bg-[#e8f4fc] px-2.5 py-1 text-[11px] font-semibold text-[#1e4976]" href="/admin/feedback">
              Feedback
            </Link>
          </div>
        ) : null}

        <MePageSection
          id="me-app-support-heading"
          title="App & support"
          description="Install the app, optional tip, and send product feedback."
          density="compact"
        >
          <div className="space-y-2">
            <MePageInstallCard compact />
            <TipSupportCard enabled={tipsEnabled} compact />
            <FeedbackFormCard compact />
          </div>
        </MePageSection>

        <div className="overflow-hidden rounded-xl border border-classmates-edge bg-classmates-surface shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card">
          <MeDestRow
            compact
            href={'/profile/account' as Route}
            icon={Settings}
            title="Preferences & account"
            subtitle={settingsSubtitle}
          />
        </div>

        <div className="border-t border-border/50 pt-3">
          <LogoutForm className="block">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-classmates-edge bg-classmates-surface px-3 py-2.5 text-[13px] font-semibold text-classmates-ink shadow-sm transition-colors active:bg-classmates-warm-alt dark:border-border dark:bg-card dark:text-foreground dark:active:bg-muted/40 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25"
            >
              <LogOut className="h-4 w-4 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
              Log out
            </button>
          </LogoutForm>
        </div>
      </div>
    </div>
  );
}
