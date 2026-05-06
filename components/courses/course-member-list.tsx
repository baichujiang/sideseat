"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { CourseIntent, type UserGender } from "@prisma/client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";

import { ClassmatesPersonRow, CLASSMATES_PERSON_ROW_CLASS } from "@/components/classmates/classmates-person-row";
import { CourseShareLinkAction } from "@/components/courses/course-share-link-action";
import { Input } from "@/components/ui/input";
import { UserGenderCardIcon } from "@/components/ui/user-gender-icon";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { cn } from "@/lib/utils";

/** Visible classmates in list at or below this → invite / share growth strip (see share action threshold). */
const LOW_CLASSMATES_GROWTH_THRESHOLD = 3;

export type CourseMember = {
  membershipId: string;
  userId: string;
  nickname: string;
  gender: UserGender;
  avatarUrl: string | null;
  major: string | null;
  semester: number | null;
  school: string | null;
  bio: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus:
    | "UNVERIFIED"
    | "EMAIL_PENDING"
    | "VERIFIED"
    | "MANUAL_REVIEW_REQUIRED"
    | "REJECTED";
  intentions: CourseIntent[];
  overlapMinutes: number;
  /**
   * Connection state between the viewer and this member:
   * - NONE: no 1:1 thread yet, the "Message" button opens a composer
   * - ACTIVE: existing thread, clicking the pill jumps straight in
   */
  threadState:
    | { kind: "NONE" }
    | { kind: "ACTIVE"; connectionId: string };
};

/** How this person wants to connect — title case, same meanings as course intent picker. */
const MEMBER_INTENT_LABEL: Record<CourseIntent, string> = {
  STUDY_TOGETHER: "Study together",
  EXAM_PREP: "Exam prep",
  GO_TO_CLASS_TOGETHER: "Go together",
  EAT_AFTER_CLASS: "Get coffee",
};

const intentChipClass =
  "rounded-full bg-[#F0FDFA] px-3 py-1 text-xs font-semibold text-[#0F766E] dark:border dark:border-teal-800/40 dark:bg-teal-950/45 dark:text-teal-100";

/** No thread yet — primary CTA, brand blue (not near-black). */
const memberMessageButtonClass =
  "inline-flex min-h-[2.25rem] items-center justify-center rounded-full bg-[#2563EB] px-3.5 text-xs font-semibold text-white shadow-[0_2px_8px_rgba(37,99,235,0.22)] transition hover:bg-[#1D4ED8] active:bg-[#1E40AF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/45 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:bg-blue-600 dark:hover:bg-blue-500 dark:focus-visible:ring-blue-400/50 dark:ring-offset-card";

/** Existing thread — secondary, matches calendar-style chips on course hub. */
const memberOpenChatLinkClass =
  "inline-flex min-h-[2.25rem] items-center justify-center rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3.5 text-xs font-semibold text-[#2563EB] transition hover:bg-[#DBEAFE] active:bg-[#BFDBFE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:border-blue-800/60 dark:bg-blue-950/45 dark:text-blue-200 dark:hover:bg-blue-950/70 dark:focus-visible:ring-blue-400/40 dark:ring-offset-card";

const classmateCardClass =
  "rounded-[24px] border border-[#E7E0D6] bg-white px-4 py-4 shadow-[0_4px_16px_rgba(15,23,42,0.04)] transition-[border-color,box-shadow] sm:px-5 sm:py-[1.125rem] dark:border-border dark:bg-card dark:shadow-[0_4px_14px_rgba(0,0,0,0.18)] [@media(hover:hover)]:hover:border-[#D4C9BA] [@media(hover:hover)]:hover:shadow-[0_6px_22px_rgba(15,23,42,0.08)] dark:[@media(hover:hover)]:hover:border-zinc-600";

function formatOverlapShort(minutes: number): string {
  if (minutes <= 0) return "";
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h${m}m` : `${h}h`;
}

export function CourseMemberList({
  courseId,
  members,
  courseCode,
  schoolShortLabel,
  shareMemberCount,
}: {
  courseId: string;
  members: CourseMember[];
  /** When set, title becomes “Classmates in {code}”. */
  courseCode?: string | null;
  /** Shown after the count, e.g. “8 classmates · TUM”. */
  schoolShortLabel?: string | null;
  /** Total enrolled in course — invite vs share copy for growth CTAs. */
  shareMemberCount: number;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const haystack = [m.nickname, m.major ?? "", m.bio ?? ""].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [members, query]);

  const codeTrimmed = courseCode?.trim() ?? "";
  /** Course hub wireframe: social list is “in this course”, not a generic code title. */
  const sectionTitle = "Classmates in this course";
  const n = members.length;
  const showGrowth = n <= LOW_CLASSMATES_GROWTH_THRESHOLD;
  const countLine =
    n === 0
      ? "No classmates in your list yet"
      : `${n} student${n === 1 ? "" : "s"} already joined` +
        (schoolShortLabel ? ` · ${schoolShortLabel}` : "");

  return (
    <section
      className="space-y-2.5 border-t border-classmates-hairline pt-8 dark:border-border/60"
      aria-labelledby="course-classmates-heading"
    >
      <div className="space-y-1.5 px-0.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3
            id="course-classmates-heading"
            className="min-w-0 flex-1 text-base font-semibold leading-tight tracking-tight text-classmates-ink dark:text-foreground"
          >
            {sectionTitle}
          </h3>
          {showGrowth ? (
            <CourseShareLinkAction
              courseId={courseId}
              memberCount={shareMemberCount}
              variant="buttonPrimary"
              labelOverride="Invite"
              className="h-9 min-h-0 shrink-0 px-4 py-2 text-xs shadow-[0_4px_12px_rgba(37,99,235,0.18)]"
            />
          ) : null}
        </div>
        {showGrowth ? (
          <p className="text-[12px] font-semibold leading-snug text-[#0F766E] dark:text-teal-300">
            {codeTrimmed
              ? `Invite classmates to ${codeTrimmed}`
              : "Invite classmates to this course"}
          </p>
        ) : null}
        <p className="text-[13px] font-semibold leading-snug text-classmates-ink/95 dark:text-zinc-100">
          {countLine}
        </p>
        {n > 0 ? (
          <p className="text-[12px] leading-snug text-classmates-sub dark:text-zinc-400">
            Same course as you — tap{" "}
            <span className="font-medium text-classmates-ink/80 dark:text-zinc-300">Message</span> to start a private
            chat. Sorted by schedule overlap first.
          </p>
        ) : (
          <p className="text-[12px] leading-snug text-classmates-sub dark:text-zinc-400">
            When classmates enroll and match this course, they&apos;ll appear here. Use Invite or share the link below.
          </p>
        )}
      </div>

      {n > 0 ? (
        <Input
          placeholder={`Search ${members.length} classmate${members.length === 1 ? "" : "s"}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 rounded-xl border-classmates-edge/90 px-3 py-1.5 text-[13px] leading-tight shadow-none ring-offset-0 focus-visible:ring-1 focus-visible:ring-classmates-azure/40 focus-visible:ring-offset-0 dark:border-border/80"
          aria-label="Search classmates in this course"
        />
      ) : null}

      {showGrowth ? (
        <div className="rounded-[20px] border border-[#BFDBFE] bg-[#EFF6FF] px-3.5 py-3 dark:border-blue-800/50 dark:bg-blue-950/35">
          <p className="text-[13px] font-semibold text-classmates-ink dark:text-zinc-100">Know someone in this course?</p>
          <p className="mt-1 text-[12px] leading-snug text-classmates-sub dark:text-zinc-400">
            Send them the course link so they can join SideSeat and show up in this list.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <CourseShareLinkAction
              courseId={courseId}
              memberCount={shareMemberCount}
              variant="button"
              labelOverride="Share course link"
              className="h-9 min-h-0 w-full justify-center px-4 py-2 text-xs sm:w-auto"
            />
          </div>
        </div>
      ) : null}

      {n === 0 ? (
        <p className="px-1 text-center text-[12px] leading-snug text-classmates-hint dark:text-zinc-500">
          No classmates to show yet — invite a few people and check back.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {filtered.length === 0 ? (
            <div
              className={cn(
                CLASSMATES_PERSON_ROW_CLASS,
                "py-8 text-center text-sm text-muted-foreground dark:text-zinc-400",
              )}
            >
              No match for &ldquo;{query.trim()}&rdquo;
            </div>
          ) : (
            filtered.map((m) => <MemberRow key={m.membershipId} member={m} courseId={courseId} />)
          )}
        </div>
      )}
    </section>
  );
}

function MemberRow({ member, courseId }: { member: CourseMember; courseId: string }) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const overlap = formatOverlapShort(member.overlapMinutes);
  const profileHref =
    `/users/${member.userId}?returnTo=${encodeURIComponent(`/courses/${courseId}`)}` as Route;
  const schoolInBadge =
    member.studentVerificationStatus === "VERIFIED" && member.verifiedStudent;
  const schoolMeta = !schoolInBadge && member.school?.trim() ? member.school.trim() : null;
  const metaLine = [member.major, member.semester ? `sem ${member.semester}` : null, schoolMeta]
    .filter(Boolean)
    .join(" · ");

  async function openChat() {
    if (opening) return;
    setOpening(true);
    try {
      const response = await apiFetch("/api/connections/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peerId: member.userId,
          courseId,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || typeof payload.data?.connectionId !== "string") {
        setOpening(false);
        return;
      }
      router.push(
        `/connections/${payload.data.connectionId}?returnTo=${encodeURIComponent(`/courses/${courseId}`)}` as Route,
      );
    } catch {
      setOpening(false);
    }
  }

  const cta =
    member.threadState.kind === "ACTIVE" ? (
      <Link
        href={
          `/connections/${member.threadState.connectionId}?returnTo=${encodeURIComponent(`/courses/${courseId}`)}` as Route
        }
        className={memberOpenChatLinkClass}
      >
        Open chat
      </Link>
    ) : (
      <button
        type="button"
        onClick={() => void openChat()}
        disabled={opening}
        className={cn(memberMessageButtonClass, opening && "pointer-events-none opacity-60")}
      >
        {opening ? "Opening…" : "Message"}
      </button>
    );

  return (
    <ClassmatesPersonRow
      avatarHref={profileHref}
      avatarUrl={member.avatarUrl}
      profileAriaLabel={`View ${member.nickname}'s profile`}
      name={member.nickname}
      titleAdornment={
        <>
          <VerifiedBadge
            size="xs"
            school={member.school}
            verifiedStudent={member.verifiedStudent}
            status={member.studentVerificationStatus}
          />
          <UserGenderCardIcon gender={member.gender} className="shrink-0" />
        </>
      }
      body={
        <>
          {metaLine ? (
            <p className="mt-1 truncate text-[12px] leading-snug text-muted-foreground">{metaLine}</p>
          ) : null}
          {overlap ? (
            <p className="mt-1 text-[11px] font-semibold leading-snug text-[#0F766E] dark:text-teal-300">
              {overlap} weekly overlap with your schedule
            </p>
          ) : null}
          {member.bio ? (
            <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-muted-foreground/90">{member.bio}</p>
          ) : null}
        </>
      }
      footer={
        member.intentions.length ? (
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 pt-1">
            <span className="shrink-0 text-[12px] font-semibold text-classmates-sub dark:text-zinc-400">Wants to:</span>
            {member.intentions.map((intent) => (
              <span key={intent} className={intentChipClass}>
                {MEMBER_INTENT_LABEL[intent]}
              </span>
            ))}
          </div>
        ) : null
      }
      action={cta}
    />
  );
}
