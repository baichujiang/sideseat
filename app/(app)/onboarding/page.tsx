import { redirect } from "next/navigation";

import { LogoutForm } from "@/components/auth/logout-form";
import { ProfileForm } from "@/components/forms/profile-form";
import { StudentVerificationForm } from "@/components/forms/student-verification-form";
import { ProfileIdentitySheets } from "@/components/profile/profile-identity-sheets";
import { PushNotificationsCard } from "@/components/profile/push-notifications-card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { profileLanguagesFormDefault } from "@/lib/constants/languages";
import { DEFAULT_SCHOOL, normalizeSchoolCode, schoolOptions } from "@/lib/constants/schools";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { prisma } from "@/lib/db/prisma";

export default async function OnboardingPage() {
  const user = await requireUser();
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  const profileUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { userLanguages: true },
  });

  if (user.onboardingComplete) {
    redirect("/home");
  }

  const formKey = `${user.id}-${user.updatedAt.getTime()}`;
  const schoolCode = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
  const schoolShort = schoolOptions.find((s) => s.value === schoolCode)?.shortLabel ?? schoolCode;

  return (
    <div className="space-y-6 pb-2">
      <header className="space-y-1">
        <h1 className="page-screen-title">Set up your profile</h1>
        <p className="text-sm text-muted-foreground">
          Same sections as <span className="font-medium text-foreground/90">Me</span> — you can change
          these anytime after you continue.
        </p>
      </header>

      <section aria-labelledby="onboarding-display">
        <h2 id="onboarding-display" className="sr-only">
          Profile
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
          <ProfileIdentitySheets
            initialAvatarUrl={user.avatarUrl}
            initialBio={user.bio}
            initialNickname={user.nickname}
          />
        </div>
      </section>

      <PushNotificationsCard />

      <section aria-labelledby="onboarding-academic">
        <h2 id="onboarding-academic" className="sr-only">
          School and program
        </h2>
        <ProfileForm
          key={formKey}
          submitLabel={ui.profileForm.saveProfileAndContinue}
          variant="academicOnly"
          requireDirtyToSubmit={false}
          avatarId={user.avatarUrl}
          verificationSlot={
            <StudentVerificationForm
              currentStatus={user.studentVerificationStatus}
              schoolCode={schoolCode}
              schoolShortLabel={schoolShort}
              notes={user.studentVerificationNotes}
              email={user.email}
              hasProofUploaded={Boolean(user.manualReviewProofUrl)}
            />
          }
          initialValues={{
            nickname: user.nickname ?? "",
            gender: user.gender,
            school: schoolCode,
            degreeLevel: user.degreeLevel ?? "BACHELOR",
            major: user.major ?? "",
            semester: user.semester ?? 1,
            languages: profileLanguagesFormDefault(profileUser?.userLanguages ?? []),
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
        />
      </section>

      <section className="border-t border-border/60 pt-4">
        <LogoutForm>
          <Button className="w-full" type="submit" variant="outline">
            Log out
          </Button>
        </LogoutForm>
      </section>
    </div>
  );
}
