import { redirect } from "next/navigation";

import { StudentVerificationForm } from "@/components/forms/student-verification-form";
import { ProfileForm } from "@/components/forms/profile-form";
import { BackLink } from "@/components/nav/back-link";
import { getSessionUser } from "@/lib/auth/session";
import { profileLanguagesFormDefault } from "@/lib/constants/languages";
import { DEFAULT_SCHOOL, normalizeSchoolCode, schoolOptions } from "@/lib/constants/schools";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { prisma } from "@/lib/db/prisma";

export default async function ProfileAcademicPage() {
  const user = await getSessionUser();
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  if (!user) redirect('/login');
  const profileUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { userLanguages: true },
  });

  const formKey = `${user.id}-${user.updatedAt.getTime()}`;
  const schoolCode = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
  const schoolShort = schoolOptions.find((s) => s.value === schoolCode)?.shortLabel ?? schoolCode;

  return (
    <div className="space-y-4 pb-2">
      <header className="flex items-center gap-2 px-0.5">
        <BackLink fallback="/profile" label="Back" />
        <div>
          <h1 className="page-screen-title">Edit profile</h1>
          <p className="page-screen-subtitle mt-0.5 text-[13px] leading-snug">
            School, major, semester, languages, and verification.
          </p>
        </div>
      </header>

      <ProfileForm
        key={formKey}
        submitLabel={ui.profileForm.saveChanges}
        variant="academicOnly"
        requireDirtyToSubmit
        mePageStructure
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
          hideFromDiscovery: user.hideFromDiscovery,
          hideFromRecommendations: user.hideFromRecommendations,
        }}
      />
    </div>
  );
}
