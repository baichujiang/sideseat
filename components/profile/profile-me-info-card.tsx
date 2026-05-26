import type { Route } from "next";
import type { StudentVerificationStatus, UserGender } from "@prisma/client";
import type { LanguageTag } from "@prisma/client";

import { MePageGroupedSection } from "@/components/profile/me-page-section";
import { ProfileMeHeaderDisplay } from "@/components/profile/profile-me-header-display";
import { ProfileInfoRow } from "@/components/profile/profile-info-row";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import {
  mePageCardClass,
  mePageListDivideClass,
} from "@/components/profile/me-settings-row";
import type { ProfileSchoolSummary } from "@/components/profile/profile-identity-sheets";
import { userGenderLabel } from "@/components/ui/user-gender-icon";
import { getDiscoverCityDisplayLabel } from "@/lib/discover/discover-city-display";
import type { DiscoverCityNameKey } from "@/lib/discover/discover-city-name-keys";
import { LANGUAGE_TAG_LABEL } from "@/lib/constants/languages";
import { getMessages } from "@/lib/i18n/messages";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { buildSchoolSummaryLine } from "@/lib/profile/school-summary-line";
import { studentVerificationRowValue } from "@/lib/verification/student-verification-display";
import { cn } from "@/lib/utils";

function buildLanguagesValue(tags: LanguageTag[], locale: AppLocale, emptyLabel: string): string {
  if (tags.length === 0) return emptyLabel;
  const labels = tags.map((tag) => LANGUAGE_TAG_LABEL[tag]);
  if (locale === "zh-CN" && labels.length > 0) {
    return labels.join("、");
  }
  return labels.join(", ");
}

const infoHeaderCardClass = cn(
  mePageCardClass,
  "relative overflow-hidden bg-gradient-to-b from-white via-classmates-surface to-classmates-warm-alt/35",
  "shadow-[0_2px_16px_-6px_rgba(15,23,42,0.08)]",
  "dark:from-card dark:via-card dark:to-muted/25 dark:shadow-none",
);

export function ProfileMeInfoCard({
  locale,
  username,
  nickname,
  bio,
  avatarUrl,
  gender,
  school,
  verifiedStudent,
  studentVerificationStatus,
  schoolSummary,
  languageTags,
  discoverCity,
  verificationStatus,
  verificationEmail,
}: {
  locale: AppLocale;
  username: string | null;
  nickname: string | null;
  bio: string | null;
  avatarUrl: string | null;
  gender: UserGender;
  school: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus: StudentVerificationStatus;
  schoolSummary: ProfileSchoolSummary;
  languageTags: LanguageTag[];
  discoverCity: DiscoverCityNameKey;
  verificationStatus: StudentVerificationStatus;
  verificationEmail: string | null;
}) {
  const t = getMessages(locale).meIdentity;
  const pr = getMessages(locale).profile;
  const me = getMessages(locale).me;
  const sv = getMessages(locale).studentVerification;
  const cityNames = getMessages(locale).discover.cityNames;

  const usernameDisplay = username?.trim() ? `@${username.trim()}` : "—";
  const nicknameDisplay = nickname?.trim() || t.displayNamePlaceholder;
  const bioDisplay = bio?.trim() || t.taglineEmpty;
  const schoolDisplay = buildSchoolSummaryLine(schoolSummary, t.schoolLineSemester);
  const languagesDisplay = buildLanguagesValue(languageTags, locale, "—");
  const cityDisplay = getDiscoverCityDisplayLabel(discoverCity, cityNames);
  const genderDisplay = userGenderLabel(gender);
  const verificationDisplay = studentVerificationRowValue(verificationStatus, sv, verificationEmail);

  return (
    <div className="space-y-4">
      <MePageGroupedSection id="profile-fields-heading" title={t.profileRowsNavAria}>
        <nav className={infoHeaderCardClass} aria-label={t.profileInfoNavAria}>
          <div
            className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-blue-400/10 blur-2xl dark:bg-blue-500/10"
            aria-hidden
          />
          <div className="relative px-4 pb-3.5 pt-4">
            <ProfileMeHeaderDisplay
              locale={locale}
              username={username}
              nickname={nickname}
              avatarUrl={avatarUrl}
              gender={gender}
              school={school}
              verifiedStudent={verifiedStudent}
              studentVerificationStatus={studentVerificationStatus}
              schoolSummary={schoolSummary}
            />
          </div>
          <div className={mePageListDivideClass}>
            <ProfileInfoRow
              href={"/profile/avatar" as Route}
              title={t.rowPhoto}
              value={<PresetAvatar id={avatarUrl} size={40} className="shrink-0" />}
              valueClassName="flex justify-end"
            />
            <ProfileInfoRow
              href={"/profile/name" as Route}
              title={t.rowNickname}
              value={nicknameDisplay}
            />
            <ProfileInfoRow
              href={"/profile/account/login-username" as Route}
              title={t.rowUsername}
              value={usernameDisplay}
            />
            <ProfileInfoRow href={"/profile/bio" as Route} title={t.rowBio} value={bioDisplay} />
            <ProfileInfoRow href={"/profile/gender" as Route} title={t.rowGender} value={genderDisplay} />
            <ProfileInfoRow href={"/profile/academic" as Route} title={t.rowSchool} value={schoolDisplay} />
            <ProfileInfoRow
              href={"/profile/languages" as Route}
              title={t.rowLanguages}
              value={languagesDisplay}
            />
            <ProfileInfoRow
              href={"/profile/discover-city" as Route}
              title={pr.discoverCityRowTitle}
              value={cityDisplay}
            />
          </div>
        </nav>
      </MePageGroupedSection>

      <MePageGroupedSection id="profile-verification-heading" title={me.verificationSectionTitle}>
        <nav className={mePageCardClass} aria-label={me.verificationSectionTitle}>
          <ProfileInfoRow
            href={"/profile/verification" as Route}
            title={me.verificationSectionTitle}
            value={verificationDisplay}
          />
        </nav>
      </MePageGroupedSection>
    </div>
  );
}
