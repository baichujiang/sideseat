import type { Route } from "next";
import type { StudentVerificationStatus, UserGender } from "@prisma/client";

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
import type { LanguageTag } from "@prisma/client";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { studentVerificationRowValue } from "@/lib/verification/student-verification-display";

function buildSchoolValue(summary: ProfileSchoolSummary, semesterLabel: string): string {
  const majorOrDegree = summary.major.trim() || summary.degreeLabel;
  const sem = formatMessage(semesterLabel, { semester: String(summary.semester) });
  return [summary.schoolShort, majorOrDegree, sem].join(" · ");
}

function buildLanguagesValue(tags: LanguageTag[], locale: AppLocale, emptyLabel: string): string {
  if (tags.length === 0) return emptyLabel;
  const labels = tags.map((tag) => LANGUAGE_TAG_LABEL[tag]);
  if (locale === "zh-CN" && labels.length > 0) {
    return labels.join("、");
  }
  return labels.join(", ");
}

export function ProfileMeInfoCard({
  locale,
  nickname,
  bio,
  avatarUrl,
  gender,
  schoolSummary,
  languageTags,
  discoverCity,
  verificationStatus,
  verificationEmail,
}: {
  locale: AppLocale;
  nickname: string | null;
  bio: string | null;
  avatarUrl: string | null;
  gender: UserGender;
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

  const nameDisplay = nickname?.trim() || t.displayNamePlaceholder;
  const bioDisplay = bio?.trim() || t.taglineEmpty;
  const schoolDisplay = buildSchoolValue(schoolSummary, t.schoolLineSemester);
  const languagesDisplay = buildLanguagesValue(languageTags, locale, "—");
  const cityDisplay = getDiscoverCityDisplayLabel(discoverCity, cityNames);
  const genderDisplay = userGenderLabel(gender);
  const verificationDisplay = studentVerificationRowValue(verificationStatus, sv, verificationEmail);

  return (
    <nav className={mePageCardClass} aria-label={t.profileInfoNavAria}>
      <div className={mePageListDivideClass}>
        <ProfileInfoRow
          href={"/profile/avatar" as Route}
          title={t.rowPhoto}
          value={<PresetAvatar id={avatarUrl} size={40} className="shrink-0" />}
          valueClassName="flex justify-end"
        />
        <ProfileInfoRow href={"/profile/name" as Route} title={t.rowName} value={nameDisplay} />
        <ProfileInfoRow href={"/profile/bio" as Route} title={t.rowBio} value={bioDisplay} />
        <ProfileInfoRow href={"/profile/gender" as Route} title={t.rowGender} value={genderDisplay} />
        <ProfileInfoRow href={"/profile/academic" as Route} title={t.rowSchool} value={schoolDisplay} />
        <ProfileInfoRow
          href={"/profile/verification" as Route}
          title={me.verificationSectionTitle}
          value={verificationDisplay}
        />
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
  );
}
