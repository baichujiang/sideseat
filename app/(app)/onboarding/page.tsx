import { redirect } from "next/navigation";

import { ProfileForm } from "@/components/forms/profile-form";
import { StudentVerificationForm } from "@/components/forms/student-verification-form";
import { ProfileIdentitySheets } from "@/components/profile/profile-identity-sheets";
import { PushNotificationsCard } from "@/components/profile/push-notifications-card";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { coerceProfileLanguages } from "@/lib/constants/languages";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import { getSchoolVerificationHint } from "@/lib/constants/verification";

export default async function OnboardingPage() {
  const user = await requireUser();

  if (user.onboardingComplete) {
    redirect("/home");
  }

  const formKey = `${user.id}-${user.updatedAt.getTime()}`;

  return (
    <div className="space-y-6 pb-2">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Set up your profile</h1>
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
          submitLabel="Save profile and continue"
          variant="academicOnly"
          avatarId={user.avatarUrl}
          verificationSlot={
            <StudentVerificationForm
              currentStatus={user.studentVerificationStatus}
              schoolHint={getSchoolVerificationHint(user.school)}
              notes={user.studentVerificationNotes}
              email={user.email}
              hasProofUploaded={Boolean(user.manualReviewProofUrl)}
            />
          }
          initialValues={{
            nickname: user.nickname ?? "",
            school: normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL,
            degreeLevel: user.degreeLevel ?? "BACHELOR",
            major: user.major ?? "",
            semester: user.semester ?? 1,
            languages: coerceProfileLanguages(user.languages),
            bio: user.bio ?? "",
            wechatHandle: user.wechatHandle ?? "",
            whatsappHandle: user.whatsappHandle ?? "",
            telegramHandle: user.telegramHandle ?? "",
            instagramHandle: user.instagramHandle ?? "",
          }}
        />
      </section>

      <section className="border-t border-border/60 pt-4">
        <form action="/api/auth/logout" method="post">
          <Button className="w-full" type="submit" variant="outline">
            Log out
          </Button>
        </form>
      </section>
    </div>
  );
}
