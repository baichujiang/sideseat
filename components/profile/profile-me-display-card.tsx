import Link from "next/link";
import type { Route } from "next";
import { ChevronRight } from "lucide-react";
import type { UserGender } from "@prisma/client";

import type { ProfileSchoolSummary } from "@/components/profile/profile-identity-sheets";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { UserGenderProfileMark } from "@/components/ui/user-gender-icon";
import { mePageCardClass } from "@/components/profile/me-settings-row";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { cn } from "@/lib/utils";

function buildSchoolSubtitle(summary: ProfileSchoolSummary, semesterLabel: string): string {
  const majorOrDegree = summary.major.trim() || summary.degreeLabel;
  const sem = formatMessage(semesterLabel, { semester: String(summary.semester) });
  return [summary.schoolShort, majorOrDegree, sem].join(" · ");
}

/** Me page showcase — tap to open {@link /profile/info} field list and per-field editors. */
export function ProfileMeDisplayCard({
  locale,
  nickname,
  bio,
  avatarUrl,
  gender,
  schoolSummary,
}: {
  locale: AppLocale;
  nickname: string | null;
  bio: string | null;
  avatarUrl: string | null;
  gender: UserGender;
  schoolSummary: ProfileSchoolSummary;
}) {
  const t = getMessages(locale).meIdentity;
  const displayName = nickname?.trim() || t.displayNamePlaceholder;
  const bioDisplay = bio?.trim() ? bio.trim() : t.taglineEmpty;
  const schoolLine = buildSchoolSubtitle(schoolSummary, t.schoolLineSemester);

  return (
    <Link
      href={"/profile/info" as Route}
      aria-label={t.editProfileAria}
      className={cn(
        mePageCardClass,
        "relative block w-full bg-gradient-to-b from-classmates-warm-alt/50 to-classmates-surface text-left transition-colors",
        "hover:from-classmates-warm-alt/70 hover:to-classmates-warm-alt/40 active:bg-muted/30",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "dark:from-card dark:to-card dark:hover:from-muted/40 dark:hover:to-card dark:active:bg-muted/40",
      )}
    >
      <div className="flex gap-3.5 px-4 py-3.5">
        <figure className="m-0 shrink-0 self-start">
          <PresetAvatar
            id={avatarUrl}
            size={64}
            className="ring-2 ring-[#F3F4F6] shadow-[0_4px_12px_-4px_rgba(15,23,42,0.12)] dark:ring-border"
          />
          <figcaption className="sr-only">{t.profilePhotoCaption}</figcaption>
        </figure>
        <div className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-[17px] font-semibold leading-tight text-classmates-ink dark:text-foreground">
              {displayName}
            </p>
            <UserGenderProfileMark gender={gender} iconClassName="h-3.5 w-3.5" />
          </div>
          <p className="mt-0.5 text-[13px] font-medium leading-snug text-classmates-sub dark:text-muted-foreground">
            {schoolLine}
          </p>
          <p className="mt-1 line-clamp-4 text-pretty text-[13px] leading-snug text-classmates-sub dark:text-muted-foreground">
            {bioDisplay}
          </p>
        </div>
        <ChevronRight
          className="mt-1 h-5 w-5 shrink-0 self-start text-muted-foreground/45"
          strokeWidth={2}
          aria-hidden
        />
      </div>
    </Link>
  );
}
