import { MeGuestScreen } from "@/components/profile/me-guest-screen";
import { ProfilePageClient, type ProfilePagePayload } from "@/components/profile/profile-page-client";
import { TabKeepAliveSnapshot } from "@/components/layout/tab-keep-alive";
import { getSessionUser } from "@/lib/auth/session";
import { isConfiguredAdmin } from "@/lib/constants/app";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { DEGREE_LEVEL_LABELS } from "@/lib/constants/majors";
import { DEFAULT_SCHOOL, normalizeSchoolCode, schoolOptions } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams?: Promise<{ verification?: string; tip?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  const sessionUser = await getSessionUser();
  const tipsEnabled = Boolean(process.env.STRIPE_SECRET_KEY?.trim());

  if (!sessionUser) {
    return (
      <TabKeepAliveSnapshot tab="profile">
        <MeGuestScreen mode="anonymous" />
      </TabKeepAliveSnapshot>
    );
  }
  const user = sessionUser;

  if (user.isGuest) {
    return (
      <TabKeepAliveSnapshot tab="profile">
        <MeGuestScreen
          mode="guest-session"
          guestNickname={user.nickname}
          guestAvatarUrl={user.avatarUrl}
        />
      </TabKeepAliveSnapshot>
    );
  }

  const [blockedCount, lifePhotoRows] = await Promise.all([
    prisma.block.count({ where: { blockerId: user.id } }),
    prisma.userLifePhoto.findMany({
      where: { userId: user.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, url: true, sortOrder: true },
    }),
  ]);
  const isAdmin = isConfiguredAdmin(user);

  const schoolCode = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
  const schoolShort = schoolOptions.find((s) => s.value === schoolCode)?.shortLabel ?? schoolCode;
  const settingsSubtitle =
    blockedCount === 0
      ? ui.profile.preferencesSubtitleNone
      : blockedCount === 1
        ? ui.profile.preferencesSubtitleOne
        : formatMessage(ui.profile.preferencesSubtitleMany, { count: blockedCount });

  const payload: ProfilePagePayload = {
    userId: user.id,
    locale,
    isAdmin,
    tipsEnabled,
    query,
    settingsSubtitle,
    user: {
      nickname: user.nickname,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      gender: user.gender,
      school: user.school,
      verifiedStudent: user.verifiedStudent,
      studentVerificationStatus: user.studentVerificationStatus,
      schoolSummary: {
        schoolShort,
        degreeLabel: DEGREE_LEVEL_LABELS[user.degreeLevel ?? "BACHELOR"],
        major: user.major?.trim() ?? "",
        semester: user.semester ?? 1,
      },
      lifePhotos: lifePhotoRows.map((r) => ({
        id: r.id,
        url: r.url,
        sortOrder: r.sortOrder,
      })),
    },
  };

  return (
    <TabKeepAliveSnapshot tab="profile">
      <ProfilePageClient initialPayload={payload} />
    </TabKeepAliveSnapshot>
  );
}
