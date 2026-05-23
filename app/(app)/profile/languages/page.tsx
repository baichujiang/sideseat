import { redirect } from "next/navigation";

import { ProfileForm } from "@/components/forms/profile-form";
import { ProfileSubpageShell } from "@/components/profile/profile-subpage-shell";
import { profileLanguagesFormDefault } from "@/lib/constants/languages";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import { getSessionUser } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { prisma } from "@/lib/db/prisma";

export default async function ProfileLanguagesPage() {
  const user = await getSessionUser();
  if (!user || user.isGuest) redirect("/profile");
  const locale = await getServerAppLocale();
  const pf = getMessages(locale).profileForm;

  const profileUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { userLanguages: true },
  });
  const schoolCode = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
  const formKey = `${user.id}-lang-${user.updatedAt.getTime()}`;

  return (
    <ProfileSubpageShell title={getMessages(locale).meIdentity.rowLanguages} backFallback="/profile/info">
      <ProfileForm
        key={formKey}
        variant="languagesOnly"
        submitLabel={pf.saveChanges}
        requireDirtyToSubmit
        avatarId={user.avatarUrl}
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
    </ProfileSubpageShell>
  );
}
