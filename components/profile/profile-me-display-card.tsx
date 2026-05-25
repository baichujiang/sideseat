import Link from "next/link";
import type { Route } from "next";
import { ChevronRight } from "lucide-react";
import type { StudentVerificationStatus, UserGender } from "@prisma/client";

import { ProfileMeHeaderDisplay } from "@/components/profile/profile-me-header-display";
import type { ProfileSchoolSummary } from "@/components/profile/profile-identity-sheets";
import { mePageCardClass, mePageChevronClass } from "@/components/profile/me-settings-row";
import { getMessages } from "@/lib/i18n/messages";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { cn } from "@/lib/utils";

/** Me page profile preview — tap to open {@link /profile/info} field list and editors. */
export function ProfileMeDisplayCard({
  locale,
  username,
  nickname,
  avatarUrl,
  gender,
  school,
  verifiedStudent,
  studentVerificationStatus,
  schoolSummary,
  embedded = false,
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
  /** When true, omits outer card chrome (used inside {@link ProfileMeTopBlock}). */
  embedded?: boolean;
  readOnly?: boolean;
}) {
  const t = getMessages(locale).meIdentity;
  const content = (
    <>
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
          className="pr-7"
        />
        {!readOnly ? (
          <ChevronRight
            className={cn(mePageChevronClass, "absolute right-4 top-[1.125rem]")}
            strokeWidth={2}
            aria-hidden
          />
        ) : null}
      </div>
    </>
  );

  const className = cn(
    "relative block w-full overflow-hidden text-left transition-colors",
    !embedded && mePageCardClass,
    embedded
      ? "border-b border-classmates-edge/70 dark:border-border/60"
      : [
          "bg-gradient-to-b from-white via-classmates-surface to-classmates-warm-alt/35",
          "shadow-[0_2px_16px_-6px_rgba(15,23,42,0.08)]",
          "dark:from-card dark:via-card dark:to-muted/25 dark:shadow-none",
        ],
    !readOnly &&
      "active:bg-classmates-warm-alt/40 dark:active:bg-muted/25 [@media(hover:hover)]:hover:bg-classmates-warm-alt/30 dark:[@media(hover:hover)]:hover:bg-muted/15",
    !readOnly &&
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2563EB]/35",
  );

  if (readOnly) {
    return (
      <div aria-label={t.editProfileAria} className={className}>
        {content}
      </div>
    );
  }

  return (
    <Link
      href={"/profile/info" as Route}
      aria-label={t.editProfileAria}
      className={className}
    >
      {content}
    </Link>
  );
}
