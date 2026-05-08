import Link from "next/link";
import type { Route } from "next";
import { ChevronRight, LogOut, Settings, ShieldBan } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { OnboardingContinueCta } from "@/components/app/onboarding-continue-cta";
import { LogoutForm } from "@/components/auth/logout-form";
import { StudentVerificationForm } from "@/components/forms/student-verification-form";
import { ProfileIdentitySheets } from "@/components/profile/profile-identity-sheets";
import { MePageSection } from "@/components/profile/me-page-section";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/session";
import { isConfiguredAdmin } from "@/lib/constants/app";
import { DEGREE_LEVEL_LABELS } from "@/lib/constants/majors";
import { DEFAULT_SCHOOL, normalizeSchoolCode, schoolOptions } from "@/lib/constants/schools";
import { profileLanguagesFormDefault } from "@/lib/constants/languages";
import { prisma } from "@/lib/db/prisma";
import { cn } from "@/lib/utils";
import { profileSectionLabelClassName } from "@/lib/ui/profile-section-label";

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
  searchParams?: Promise<{ verification?: string }>;
}) {
  const sessionUser = await getSessionUser();
  const query = (await searchParams) ?? {};

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

  const profileForSheet = await prisma.user.findUnique({
    where: { id: user.id },
    include: { userLanguages: true },
  });

  const schoolCode = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
  const schoolShort = schoolOptions.find((s) => s.value === schoolCode)?.shortLabel ?? schoolCode;
  const sheetProfileFormKey = `${user.id}-${user.updatedAt.getTime()}`;

  return (
    <div className="space-y-4 pb-2">
      <header className="px-0.5">
        <h1 className="page-screen-title">Me</h1>
      </header>

      {!user.onboardingComplete ? (
        <OnboardingContinueCta
          title="Finish setup from here or later"
          body="Your main tabs stay available now. Continue the guided setup anytime to mark your profile as complete."
        />
      ) : null}

      {query.verification === "success" ? (
        <p className="rounded-[24px] border border-[#d5e9df] bg-[#eef8f2] px-4 py-3 text-sm text-foreground">
          Student email verified — you can send invitations now.
        </p>
      ) : null}

      {isAdmin ? (
        <div className="flex flex-wrap gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2.5">
          <span className={cn(profileSectionLabelClassName, "mb-0 w-full")}>Admin</span>
          <Link className="rounded-full bg-[#e5f1ee] px-3 py-1.5 text-xs font-semibold text-[#20524d]" href="/admin/reports">
            Reports
          </Link>
          <Link className="rounded-full bg-[#f4ede0] px-3 py-1.5 text-xs font-semibold text-[#6f4d1c]" href="/admin/verifications">
            Verify
          </Link>
          <Link className="rounded-full bg-[#eceaf5] px-3 py-1.5 text-xs font-semibold text-[#3f3473]" href="/admin/users">
            Users
          </Link>
        </div>
      ) : null}

      <MePageSection id="me-profile-summary-heading" title="Profile summary">
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

      <MePageSection id="me-manage-heading" title="More settings">
        <div className="overflow-hidden rounded-2xl border border-classmates-edge bg-classmates-surface shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card">
          <MeDestRow href={'/profile/account' as Route} icon={Settings} title="Preferences & account" subtitle="Notifications, discover toggles, safety, and support" />
        </div>
      </MePageSection>

      <LogoutForm className="block">
        <button
          type="submit"
          className="flex w-full items-center justify-center gap-2 rounded-full border border-classmates-edge bg-classmates-surface px-4 py-3 text-[14px] font-semibold text-classmates-ink shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors active:bg-classmates-warm-alt dark:border-border dark:bg-card dark:text-foreground dark:active:bg-muted/40 [@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25"
        >
          <LogOut className="h-4 w-4 shrink-0 opacity-70" strokeWidth={2} aria-hidden />
          Log out
        </button>
      </LogoutForm>
    </div>
  );
}
