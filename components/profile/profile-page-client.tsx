"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  BookOpen,
  Bookmark,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  Settings,
  SquarePen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { StudentVerificationStatus, UserGender } from "@prisma/client";
import { useEffect, useMemo, useState } from "react";

import { MePageInstallCard } from "@/components/pwa/me-page-install-card";
import { FeedbackFormCard } from "@/components/profile/feedback-form-card";
import { MePageGroupedSection, MePageSection } from "@/components/profile/me-page-section";
import {
  MePageSettingsRowLabel,
  mePageCardClass,
  mePageChevronClass,
  mePageIconCoursesClass,
  mePageIconCoursesShellClass,
  mePageIconMutedClass,
  mePageIconMyActivitiesClass,
  mePageIconMyActivitiesShellClass,
  mePageIconMyPlanClass,
  mePageIconMyPlanShellClass,
  mePageIconMyPostsClass,
  mePageIconMyPostsShellClass,
  mePageIconSavedPostsClass,
  mePageIconSavedPostsShellClass,
  mePageIconShellClass,
  mePageListDivideClass,
  mePageRowInteractiveClass,
  mePageRowLeadClass,
} from "@/components/profile/me-settings-row";
import { ProfileMeTopBlock } from "@/components/profile/profile-me-top-block";
import { PushNotificationsCard } from "@/components/profile/push-notifications-card";
import { TipSupportCard } from "@/components/profile/tip-support-card";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { useOnlineStatus } from "@/hooks/use-online-status";
import type { AppLocale } from "@/lib/i18n/app-locale";
import type { ProfileSchoolSummary } from "@/components/profile/profile-identity-sheets";
import type { LifePhotoRow } from "@/components/profile/profile-life-photos-editor";
import { cn } from "@/lib/utils";

export type ProfilePagePayload = {
  userId: string;
  locale: AppLocale;
  isAdmin: boolean;
  tipsEnabled: boolean;
  query: { verification?: string; tip?: string };
  settingsSubtitle: string;
  user: {
    username: string | null;
    nickname: string | null;
    bio: string | null;
    avatarUrl: string | null;
    gender: UserGender;
    school: string | null;
    verifiedStudent: boolean;
    studentVerificationStatus: StudentVerificationStatus;
    schoolSummary: ProfileSchoolSummary;
    lifePhotos: LifePhotoRow[];
  };
};

type ProfilePageCacheRecord = {
  version: 1;
  payload: ProfilePagePayload;
  fetchedAt: number;
};

const PROFILE_PAGE_STORAGE_PREFIX = "sideseat:profilePage:v1:";

function storageKey(userId: string): string {
  return `${PROFILE_PAGE_STORAGE_PREFIX}${encodeURIComponent(userId)}`;
}

function readProfileCache(userId: string): ProfilePagePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ProfilePageCacheRecord>;
    if (parsed.version !== 1 || parsed.payload?.userId !== userId) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

function writeProfileCache(payload: ProfilePagePayload) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      storageKey(payload.userId),
      JSON.stringify({ version: 1, payload, fetchedAt: Date.now() } satisfies ProfilePageCacheRecord),
    );
  } catch {
    // Storage may be unavailable or full; the current page still remains usable.
  }
}

function MeDestRow({
  href,
  icon: Icon,
  title,
  subtitle,
  disabled,
  disabledTitle,
  iconShellClass = mePageIconShellClass,
  iconClass = mePageIconMutedClass,
}: {
  href: Route;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  disabled?: boolean;
  disabledTitle?: string;
  iconShellClass?: string;
  iconClass?: string;
}) {
  const content = (
    <>
      <div className={mePageRowLeadClass}>
        <span className={iconShellClass}>
          <Icon className={iconClass} strokeWidth={2} aria-hidden />
        </span>
        <MePageSettingsRowLabel title={title} subtitle={subtitle} />
      </div>
      <ChevronRight className={mePageChevronClass} strokeWidth={2} aria-hidden />
    </>
  );

  if (disabled) {
    return (
      <div
        aria-disabled="true"
        title={disabledTitle}
        className={cn(mePageRowInteractiveClass, "cursor-not-allowed opacity-65")}
      >
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className={mePageRowInteractiveClass}>
      {content}
    </Link>
  );
}

export function ProfilePageClient({ initialPayload }: { initialPayload: ProfilePagePayload }) {
  const isOnline = useOnlineStatus();
  const { messages: ui } = useLocaleContext();
  const [cachedPayload, setCachedPayload] = useState<ProfilePagePayload | null>(() => null);

  useEffect(() => {
    writeProfileCache(initialPayload);
    setCachedPayload(null);
  }, [initialPayload]);

  useEffect(() => {
    if (isOnline) {
      setCachedPayload(null);
      return;
    }
    setCachedPayload(readProfileCache(initialPayload.userId));
  }, [initialPayload.userId, isOnline]);

  const payload = cachedPayload ?? initialPayload;
  const readOnly = !isOnline;
  const disabledTitle = ui.offline.onlineRequiredAction;

  const statusBanners = useMemo(
    () => (
      <>
        {readOnly ? (
          <p className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-[13px] text-amber-950 dark:border-amber-400/25 dark:bg-amber-950/25 dark:text-amber-100">
            {ui.offline.profileReadOnlyNotice}
          </p>
        ) : null}

        {payload.query.verification === "success" ? (
          <p className="rounded-xl border border-[#d5e9df] bg-[#eef8f2] px-3 py-2 text-[13px] text-foreground">
            {ui.me.verificationSuccessBanner}
          </p>
        ) : null}

        {payload.query.tip === "success" ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-[13px] text-foreground dark:border-amber-800/40 dark:bg-amber-950/20">
            {ui.me.tipSuccessBanner}
          </p>
        ) : null}

        {payload.query.tip === "cancel" ? (
          <p className="rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 text-[13px] text-muted-foreground">
            {ui.me.tipCancelBanner}
          </p>
        ) : null}
      </>
    ),
    [payload.query.tip, payload.query.verification, readOnly, ui],
  );

  return (
    <div className="-mx-3 space-y-4 bg-classmates-warm-alt px-5 pb-4 pt-1 dark:bg-background">
      {payload.isAdmin && !readOnly ? (
        <nav
          className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border/60 px-0.5 pb-2"
          aria-label={ui.me.adminNavAria}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {ui.me.adminLabel}
          </span>
          <Link className="rounded-full bg-[#e5f1ee] px-2 py-0.5 text-[11px] font-semibold text-[#20524d]" href="/admin/reports">
            {ui.me.adminReports}
          </Link>
          <Link className="rounded-full bg-[#f4ede0] px-2 py-0.5 text-[11px] font-semibold text-[#6f4d1c]" href="/admin/verifications">
            {ui.me.adminVerify}
          </Link>
          <Link className="rounded-full bg-[#eceaf5] px-2 py-0.5 text-[11px] font-semibold text-[#3f3473]" href="/admin/users">
            {ui.me.adminUsers}
          </Link>
          <Link className="rounded-full bg-[#e8f4fc] px-2 py-0.5 text-[11px] font-semibold text-[#1e4976]" href="/admin/feedback">
            {ui.me.adminFeedback}
          </Link>
        </nav>
      ) : null}

      {statusBanners}

      <ProfileMeTopBlock
        locale={payload.locale}
        username={payload.user.username}
        nickname={payload.user.nickname}
        avatarUrl={payload.user.avatarUrl}
        gender={payload.user.gender}
        school={payload.user.school}
        verifiedStudent={payload.user.verifiedStudent}
        studentVerificationStatus={payload.user.studentVerificationStatus}
        schoolSummary={payload.user.schoolSummary}
        initialLifePhotos={payload.user.lifePhotos}
        readOnly={readOnly}
      />

      <MePageGroupedSection id="me-activity-heading" title={ui.profile.landingSectionActivity}>
        <div className={mePageCardClass}>
          <div className={mePageListDivideClass}>
            <MeDestRow
              href={"/courses" as Route}
              icon={BookOpen}
              iconShellClass={mePageIconCoursesShellClass}
              iconClass={mePageIconCoursesClass}
              title={ui.profile.coursesRowTitle}
              subtitle={ui.profile.coursesRowSubtitle}
            />
            <MeDestRow
              href={"/profile/my-activities" as Route}
              icon={CalendarDays}
              iconShellClass={mePageIconMyActivitiesShellClass}
              iconClass={mePageIconMyActivitiesClass}
              title={ui.profile.myActivitiesRowTitle}
              subtitle={ui.profile.myActivitiesRowSubtitle}
              disabled={readOnly}
              disabledTitle={disabledTitle}
            />
            <MeDestRow
              href={"/profile/my-posts" as Route}
              icon={SquarePen}
              iconShellClass={mePageIconMyPostsShellClass}
              iconClass={mePageIconMyPostsClass}
              title={ui.profile.myPostsRowTitle}
              subtitle={ui.profile.myPostsRowSubtitle}
              disabled={readOnly}
              disabledTitle={disabledTitle}
            />
            <MeDestRow
              href={"/profile/saved-posts" as Route}
              icon={Bookmark}
              iconShellClass={mePageIconSavedPostsShellClass}
              iconClass={mePageIconSavedPostsClass}
              title={ui.profile.savedPostsRowTitle}
              subtitle={ui.profile.savedPostsRowSubtitle}
              disabled={readOnly}
              disabledTitle={disabledTitle}
            />
            <MeDestRow
              href={"/profile/my-plan" as Route}
              icon={CalendarClock}
              iconShellClass={mePageIconMyPlanShellClass}
              iconClass={mePageIconMyPlanClass}
              title={ui.profile.myPlanRowTitle}
              subtitle={ui.profile.myPlanRowSubtitle}
              disabled={readOnly}
              disabledTitle={disabledTitle}
            />
          </div>
        </div>
      </MePageGroupedSection>

      {!readOnly ? (
        <MePageGroupedSection id="me-push-heading" title={ui.profile.landingSectionNotifications}>
          <PushNotificationsCard />
        </MePageGroupedSection>
      ) : null}

      <MePageGroupedSection id="me-more-heading" title={ui.profile.landingSectionMore}>
        <div className={mePageCardClass}>
          <div className={mePageListDivideClass}>
            <MePageInstallCard inList />
            {!readOnly ? <FeedbackFormCard variant="listRow" /> : null}
            <MeDestRow
              href={"/profile/account" as Route}
              icon={Settings}
              title={ui.profile.preferencesTitle}
              subtitle={payload.settingsSubtitle}
              disabled={readOnly}
              disabledTitle={disabledTitle}
            />
          </div>
        </div>
      </MePageGroupedSection>

      {payload.tipsEnabled && !readOnly ? (
        <MePageSection id="me-tip-heading" density="compact">
          <TipSupportCard enabled t={ui.tip} />
        </MePageSection>
      ) : null}
    </div>
  );
}
