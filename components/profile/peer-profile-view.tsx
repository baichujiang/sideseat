import Link from "next/link";
import type { Route } from "next";
import type {
  LanguageProficiency,
  LanguageTag,
  StudentVerificationStatus,
  UserGender,
} from "@prisma/client";
import type { ReactNode } from "react";

import { ProfileMeHeaderDisplay } from "@/components/profile/profile-me-header-display";
import type { ProfileSchoolSummary } from "@/components/profile/profile-identity-sheets";
import { ProfileLifePhotosEditor, type LifePhotoRow } from "@/components/profile/profile-life-photos-editor";
import {
  mePageCardClass,
  mePageListDivideClass,
} from "@/components/profile/me-settings-row";
import { LANGUAGE_PROFICIENCY_LABEL, LANGUAGE_TAG_LABEL } from "@/lib/constants/languages";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

export type PeerProfileFields = {
  nickname: string | null;
  gender: UserGender;
  avatarUrl: string | null;
  bio: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus: StudentVerificationStatus;
  school: string | null;
  languages: Array<{ tag: LanguageTag; proficiency: LanguageProficiency }>;
  lifePhotos?: LifePhotoRow[];
};

export type PeerProfileCourse = {
  id: string;
  code: string | null;
  name: string;
};

const peerProfileCardClass = cn(
  mePageCardClass,
  "bg-gradient-to-b from-white via-classmates-surface to-classmates-warm-alt/35",
  "shadow-[0_2px_16px_-6px_rgba(15,23,42,0.08)]",
  "dark:from-card dark:via-card dark:to-muted/25 dark:shadow-none",
);

function ProfileDetailSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="px-5 py-3.5">
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-classmates-sub dark:text-muted-foreground">
        {title}
      </h2>
      <div className={cn("mt-2.5", className)}>{children}</div>
    </div>
  );
}

export function PeerProfileView({
  locale,
  peer,
  schoolSummary,
  metVia,
  belowDisplayName,
  peerCourses,
  sharedCourses,
  coursesReturnTo,
  labels,
}: {
  locale: AppLocale;
  peer: PeerProfileFields;
  schoolSummary: ProfileSchoolSummary;
  metVia: string | null;
  /** Your private name for this contact — only when viewer has a connection. */
  belowDisplayName?: ReactNode;
  peerCourses: PeerProfileCourse[];
  sharedCourses: PeerProfileCourse[];
  coursesReturnTo: string;
  labels: {
    languagesSection: string;
    coursesSection: string;
    coursesEmpty: string;
    sharedCoursesOne: string;
    sharedCoursesMany: string;
    noCourseOverlap: string;
  };
}) {
  const lp = getMessages(locale).profileLifePhotos;
  const lifePhotos = peer.lifePhotos ?? [];
  const sharedCourseIds = new Set(sharedCourses.map((c) => c.id));

  return (
    <div className="pb-2">
      <section className={peerProfileCardClass} aria-label={lp.sectionTitle}>
        <div className="px-4 pb-3.5 pt-4">
          <ProfileMeHeaderDisplay
            locale={locale}
            nickname={peer.nickname}
            bio={peer.bio}
            avatarUrl={peer.avatarUrl}
            gender={peer.gender}
            school={peer.school}
            verifiedStudent={peer.verifiedStudent}
            studentVerificationStatus={peer.studentVerificationStatus}
            schoolSummary={schoolSummary}
          />
          {belowDisplayName ? (
            <div className="mt-2.5 w-full min-w-0 max-w-full">{belowDisplayName}</div>
          ) : null}
          {metVia ? (
            <div className="mt-3 inline-flex max-w-full items-center rounded-full bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary">
              {metVia}
            </div>
          ) : null}
        </div>

        <div className={mePageListDivideClass}>
          <ProfileDetailSection title={lp.sectionTitle}>
            <ProfileLifePhotosEditor initialPhotos={lifePhotos} readOnly layout="me" />
          </ProfileDetailSection>

          {peer.languages.length > 0 ? (
            <ProfileDetailSection title={labels.languagesSection}>
              <div className="flex flex-wrap gap-1.5">
                {peer.languages.map((row) => (
                  <span
                    key={row.tag}
                    className="rounded-full bg-foreground/5 px-2.5 py-0.5 text-xs font-medium text-foreground/80"
                    title={LANGUAGE_PROFICIENCY_LABEL[row.proficiency]}
                  >
                    {LANGUAGE_TAG_LABEL[row.tag]} · {LANGUAGE_PROFICIENCY_LABEL[row.proficiency]}
                  </span>
                ))}
              </div>
            </ProfileDetailSection>
          ) : null}

          <ProfileDetailSection title={labels.coursesSection}>
            {peerCourses.length === 0 ? (
              <p className="text-sm text-muted-foreground">{labels.coursesEmpty}</p>
            ) : (
              <div className="space-y-2">
                <ul className="flex flex-wrap gap-1.5">
                  {peerCourses.map((course) => {
                    const isShared = sharedCourseIds.has(course.id);
                    const courseHref =
                      `/courses/${course.id}?returnTo=${encodeURIComponent(coursesReturnTo)}` as Route;
                    const courseLabel = course.code ? `[${course.code}] ${course.name}` : course.name;
                    return (
                      <li key={course.id}>
                        <Link
                          href={courseHref}
                          className={
                            isShared
                              ? "inline-flex max-w-[14rem] rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/15"
                              : "inline-flex max-w-[14rem] rounded-full bg-foreground/5 px-2.5 py-1 text-[11px] text-foreground/75 transition hover:bg-foreground/10"
                          }
                          title={courseLabel}
                        >
                          <span className="truncate">{courseLabel}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {sharedCourses.length > 0 ? (
                  <p className="text-[11px] text-primary/90">
                    {sharedCourses.length === 1
                      ? labels.sharedCoursesOne
                      : formatMessage(labels.sharedCoursesMany, { count: sharedCourses.length })}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">{labels.noCourseOverlap}</p>
                )}
              </div>
            )}
          </ProfileDetailSection>
        </div>
      </section>
    </div>
  );
}
