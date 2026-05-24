import { redirect } from "next/navigation";

import { ProfileMeInfoCard } from "@/components/profile/profile-me-info-card";
import { ProfileSubpageShell } from "@/components/profile/profile-subpage-shell";
import { DEGREE_LEVEL_LABELS } from "@/lib/constants/majors";
import { DEFAULT_SCHOOL, normalizeSchoolCode, schoolOptions } from "@/lib/constants/schools";
import { getServerDiscoverServedCity } from "@/lib/discover/discover-city-preference";
import { getSessionUser } from "@/lib/auth/session";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { prisma } from "@/lib/db/prisma";

export default async function ProfileInfoPage() {
  const user = await getSessionUser();
  if (!user || user.isGuest) redirect("/profile");
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);

  const [profileUser, servedCity, lifePhotoCount] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      include: { userLanguages: true },
    }),
    getServerDiscoverServedCity(),
    prisma.userLifePhoto.count({ where: { userId: user.id } }),
  ]);

  const schoolCode = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
  const schoolShort = schoolOptions.find((s) => s.value === schoolCode)?.shortLabel ?? schoolCode;
  const languageTags = (profileUser?.userLanguages ?? []).map((l) => l.tag);

  return (
    <ProfileSubpageShell title={ui.meIdentity.editProfileSheetTitle} backFallback="/profile">
      <ProfileMeInfoCard
        locale={locale}
        nickname={user.nickname}
        bio={user.bio}
        avatarUrl={user.avatarUrl}
        gender={user.gender}
        discoverCity={servedCity}
        languageTags={languageTags}
        verificationStatus={user.studentVerificationStatus}
        verificationEmail={user.email}
        lifePhotoCount={lifePhotoCount}
        schoolSummary={{
          schoolShort,
          degreeLabel: DEGREE_LEVEL_LABELS[user.degreeLevel ?? "BACHELOR"],
          major: user.major?.trim() ?? "",
          semester: user.semester ?? 1,
        }}
      />
    </ProfileSubpageShell>
  );
}
