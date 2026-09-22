import { redirect } from "next/navigation";

import { StudentVerificationForm } from "@/components/forms/student-verification-form";
import { ProfileSubpageShell } from "@/components/profile/profile-subpage-shell";
import { DEFAULT_SCHOOL, normalizeSchoolCode, schoolOptions } from "@/lib/constants/schools";
import { getSessionUser } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function ProfileVerificationPage() {
  const user = await getSessionUser();
  if (!user || user.isGuest) redirect("/profile");
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  const schoolCode = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
  const schoolShort = schoolOptions.find((s) => s.value === schoolCode)?.shortLabel ?? schoolCode;

  return (
    <ProfileSubpageShell
      title={ui.me.verificationSectionTitle}
      subtitle={ui.studentVerification.heading}
      backFallback="/profile/info"
    >
      <StudentVerificationForm
        currentStatus={user.studentVerificationStatus}
        verificationMethod={user.studentVerificationMethod}
        studentStatus={user.studentStatus}
        schoolCode={schoolCode}
        schoolShortLabel={schoolShort}
        notes={user.studentVerificationNotes}
        email={user.email}
        hasProofUploaded={Boolean(user.manualReviewProofUrl)}
      />
    </ProfileSubpageShell>
  );
}
