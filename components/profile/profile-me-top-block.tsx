import type { StudentVerificationStatus, UserGender } from "@prisma/client";

import {
  ProfileLifePhotosEditor,
  type LifePhotoRow,
} from "@/components/profile/profile-life-photos-editor";
import { ProfileMeDisplayCard } from "@/components/profile/profile-me-display-card";
import type { ProfileSchoolSummary } from "@/components/profile/profile-identity-sheets";
import { mePageCardClass } from "@/components/profile/me-settings-row";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

/** Me page header: profile preview (links to info) + inline life photo editor. */
export function ProfileMeTopBlock({
  locale,
  username,
  nickname,
  avatarUrl,
  gender,
  school,
  verifiedStudent,
  studentVerificationStatus,
  schoolSummary,
  initialLifePhotos,
  readOnly = false,
}: {
  locale: AppLocale;
  username: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  gender: UserGender;
  school: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus: StudentVerificationStatus;
  schoolSummary: ProfileSchoolSummary;
  initialLifePhotos: LifePhotoRow[];
  readOnly?: boolean;
}) {
  const lp = getMessages(locale).profileLifePhotos;

  return (
    <section
      className={cn(
        mePageCardClass,
        "bg-gradient-to-b from-white via-classmates-surface to-classmates-warm-alt/35",
        "shadow-[0_2px_16px_-6px_rgba(15,23,42,0.08)]",
        "dark:from-card dark:via-card dark:to-muted/25 dark:shadow-none",
      )}
      aria-label={lp.sectionTitle}
    >
      <ProfileMeDisplayCard
        embedded
        locale={locale}
        username={username}
        nickname={nickname}
        avatarUrl={avatarUrl}
        gender={gender}
        school={school}
        verifiedStudent={verifiedStudent}
        studentVerificationStatus={studentVerificationStatus}
        schoolSummary={schoolSummary}
        readOnly={readOnly}
      />
      <div className="px-4 pb-4 pt-3.5">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-classmates-sub dark:text-muted-foreground">
          {lp.sectionTitle}
        </h2>
        <div className="mt-2.5">
          <ProfileLifePhotosEditor initialPhotos={initialLifePhotos} readOnly={readOnly} layout="me" />
        </div>
      </div>
    </section>
  );
}
