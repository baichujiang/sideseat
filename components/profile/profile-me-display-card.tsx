import Link from "next/link";
import type { Route } from "next";
import { ChevronRight } from "lucide-react";
import type { StudentVerificationStatus, UserGender } from "@prisma/client";

import type { ProfileSchoolSummary } from "@/components/profile/profile-identity-sheets";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { UserGenderProfileMark } from "@/components/ui/user-gender-icon";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { mePageCardClass } from "@/components/profile/me-settings-row";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { cn } from "@/lib/utils";

function buildSchoolSubtitle(summary: ProfileSchoolSummary, semesterLabel: string): string {
  const majorOrDegree = summary.major.trim() || summary.degreeLabel;
  const sem = formatMessage(semesterLabel, { semester: String(summary.semester) });
  return [summary.schoolShort, majorOrDegree, sem].join(" · ");
}

export type ProfileMeLandingStats = {
  posts: number;
  saved: number;
  courses: number;
};

function ProfileMeStatCell({
  href,
  value,
  label,
}: {
  href: Route;
  value: number;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center px-2 py-2.5 text-center transition-colors",
        "active:bg-classmates-warm-alt/80 dark:active:bg-muted/30",
        "[@media(hover:hover)]:hover:bg-classmates-warm-alt/50 dark:[@media(hover:hover)]:hover:bg-muted/20",
      )}
    >
      <span className="text-[17px] font-bold tabular-nums leading-none tracking-tight text-classmates-ink dark:text-foreground">
        {value}
      </span>
      <span className="mt-1 line-clamp-2 text-[11px] font-medium leading-tight text-classmates-sub dark:text-muted-foreground">
        {label}
      </span>
    </Link>
  );
}

/** Me page showcase — tap to open {@link /profile/info} field list and per-field editors. */
export function ProfileMeDisplayCard({
  locale,
  nickname,
  bio,
  avatarUrl,
  gender,
  school,
  verifiedStudent,
  studentVerificationStatus,
  schoolSummary,
  stats,
}: {
  locale: AppLocale;
  nickname: string | null;
  bio: string | null;
  avatarUrl: string | null;
  gender: UserGender;
  school: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus: StudentVerificationStatus;
  schoolSummary: ProfileSchoolSummary;
  stats: ProfileMeLandingStats;
}) {
  const t = getMessages(locale).meIdentity;
  const p = getMessages(locale).profile;
  const displayName = nickname?.trim() || t.displayNamePlaceholder;
  const bioTrimmed = bio?.trim() ?? "";
  const hasBio = bioTrimmed.length > 0;
  const schoolLine = buildSchoolSubtitle(schoolSummary, t.schoolLineSemester);

  const statPostsLabel = p.landingStatPosts;
  const statSavedLabel = p.landingStatSaved;
  const statCoursesLabel = p.landingStatCourses;

  return (
    <div
      className={cn(
        mePageCardClass,
        "relative w-full overflow-hidden text-left",
        "bg-gradient-to-b from-white via-classmates-surface to-classmates-warm-alt/35",
        "shadow-[0_2px_16px_-6px_rgba(15,23,42,0.08)]",
        "dark:from-card dark:via-card dark:to-muted/25 dark:shadow-none",
      )}
    >
      <div
        className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-blue-400/10 blur-2xl dark:bg-blue-500/10"
        aria-hidden
      />

      <Link
        href={"/profile/info" as Route}
        aria-label={t.editProfileAria}
        className={cn(
          "relative block px-4 pb-3 pt-4 transition-colors",
          "active:bg-classmates-warm-alt/30 dark:active:bg-muted/25",
          "[@media(hover:hover)]:hover:bg-classmates-warm-alt/25 dark:[@media(hover:hover)]:hover:bg-muted/15",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563EB]/35",
        )}
      >
        <div className="flex gap-3.5">
          <figure className="m-0 shrink-0 self-start">
            <PresetAvatar
              id={avatarUrl}
              size={72}
              className="ring-[2.5px] ring-white shadow-[0_6px_20px_-6px_rgba(15,23,42,0.18)] dark:ring-border dark:shadow-[0_6px_20px_-6px_rgba(0,0,0,0.45)]"
            />
            <figcaption className="sr-only">{t.profilePhotoCaption}</figcaption>
          </figure>
          <div className="min-w-0 flex-1 pt-0.5 text-left">
            <div className="flex flex-wrap items-center gap-1.5 pr-6">
              <p className="truncate text-[20px] font-bold leading-tight tracking-tight text-classmates-ink dark:text-foreground">
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
          <ChevronRight
            className="absolute right-4 top-4 h-5 w-5 shrink-0 text-muted-foreground/45"
            strokeWidth={2}
            aria-hidden
          />
        </div>

        <div
          className={cn(
            "mt-3 rounded-xl px-3 py-2.5 text-[13px] leading-snug",
            hasBio
              ? "bg-classmates-warm-alt/70 text-classmates-ink dark:bg-muted/35 dark:text-foreground/90"
              : "border border-dashed border-classmates-edge/80 bg-transparent italic text-classmates-sub dark:border-border/70 dark:text-muted-foreground",
          )}
        >
          <p className={cn(!hasBio && "line-clamp-2")}>{hasBio ? bioTrimmed : t.taglineEmpty}</p>
        </div>
      </Link>

      <div
        className={cn(
          "mx-4 mb-3 grid grid-cols-3 divide-x divide-classmates-edge/80 overflow-hidden rounded-xl",
          "border border-classmates-edge/80 bg-classmates-warm-alt/40 dark:divide-border/60 dark:border-border/60 dark:bg-muted/20",
        )}
      >
        <ProfileMeStatCell
          href={"/profile/my-posts" as Route}
          value={stats.posts}
          label={statPostsLabel}
        />
        <ProfileMeStatCell
          href={"/profile/saved-posts" as Route}
          value={stats.saved}
          label={statSavedLabel}
        />
        <ProfileMeStatCell
          href={"/courses" as Route}
          value={stats.courses}
          label={statCoursesLabel}
        />
      </div>

      <Link
        href={"/profile/info" as Route}
        className={cn(
          "relative mt-3 flex items-center justify-between gap-2 border-t border-classmates-edge/70 px-4 py-2.5 transition-colors",
          "bg-classmates-warm-alt/25 dark:border-border/60 dark:bg-muted/15",
          "active:bg-classmates-warm-alt/50 dark:active:bg-muted/30",
          "[@media(hover:hover)]:hover:bg-classmates-warm-alt/40 dark:[@media(hover:hover)]:hover:bg-muted/25",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563EB]/35",
        )}
      >
        <span className="text-[13px] font-semibold text-classmates-blue dark:text-blue-400">
          {p.landingEditProfileCta}
        </span>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-classmates-blue/70 dark:text-blue-400/70"
          strokeWidth={2.5}
          aria-hidden
        />
      </Link>
    </div>
  );
}
