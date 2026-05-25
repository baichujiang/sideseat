import type { StudentVerificationStatus, UserGender } from "@prisma/client";

import type { ProfileSchoolSummary } from "@/components/profile/profile-identity-sheets";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { UserGenderProfileMark } from "@/components/ui/user-gender-icon";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { getMessages } from "@/lib/i18n/messages";
import { buildSchoolSummaryLine } from "@/lib/profile/school-summary-line";
import { cn } from "@/lib/utils";

/** Shared avatar + username + school block for Me preview and `/profile/info` header. */
export function ProfileMeHeaderDisplay({
  locale,
  username,
  nickname,
  avatarUrl,
  gender,
  school,
  verifiedStudent,
  studentVerificationStatus,
  schoolSummary,
  className,
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
  className?: string;
}) {
  const t = getMessages(locale).meIdentity;
  const displayName = username?.trim() || nickname?.trim() || t.displayNamePlaceholder;
  const schoolLine = buildSchoolSummaryLine(schoolSummary, t.schoolLineSemester);

  return (
    <div className={cn("flex gap-3.5", className)}>
      <figure className="m-0 shrink-0 self-start">
        <PresetAvatar
          id={avatarUrl}
          size={72}
          className="ring-[2.5px] ring-white shadow-[0_6px_20px_-6px_rgba(15,23,42,0.18)] dark:ring-border dark:shadow-[0_6px_20px_-6px_rgba(0,0,0,0.45)]"
        />
        <figcaption className="sr-only">{t.profilePhotoCaption}</figcaption>
      </figure>
      <div className="min-w-0 flex-1 pt-0.5 text-left">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate font-mono text-[20px] font-bold leading-tight tracking-tight text-classmates-ink dark:text-foreground">
            {displayName}
          </p>
          <UserGenderProfileMark gender={gender} iconClassName="h-4 w-4" />
          <VerifiedBadge
            size="sm"
            tone="brandBlue"
            school={school}
            verifiedStudent={verifiedStudent}
            status={studentVerificationStatus}
          />
        </div>
        <p className="mt-1 text-[13px] font-medium leading-snug text-classmates-sub dark:text-muted-foreground">
          {schoolLine}
        </p>
      </div>
    </div>
  );
}
