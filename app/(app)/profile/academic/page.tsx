import { redirect } from "next/navigation";

import { ProfileForm } from "@/components/forms/profile-form";
import { ProfileSubpageShell } from "@/components/profile/profile-subpage-shell";
import { getSessionUser } from "@/lib/auth/session";
import { profileLanguagesFormDefault } from "@/lib/constants/languages";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
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

  return (
    <ProfileSubpageShell
      title={ui.meIdentity.rowSchool}
      subtitle={ui.profileForm.academicSectionDescription}
      backFallback="/profile/info"
    >
      <ProfileForm
        key={formKey}
        submitLabel={ui.profileForm.saveChanges}
        variant="schoolOnly"
        requireDirtyToSubmit
        avatarId={user.avatarUrl}
        initialValues={{
          nickname: user.nickname ?? "",
          gender: user.gender,
          school: schoolCode,
          studentStatus: user.studentStatus ?? "CURRENT_STUDENT",
          degreeLevel: user.degreeLevel ?? "BACHELOR",
          major: user.major ?? "",
          semester: user.semester ?? 1,
          graduationYear: user.graduationYear ?? new Date().getFullYear(),
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
    </ProfileSubpageShell>
  );
}
