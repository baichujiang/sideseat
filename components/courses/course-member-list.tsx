"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { type CourseIntent, type UserGender } from "@prisma/client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";

import { Input } from "@/components/ui/input";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { useAppMessages } from "@/hooks/use-app-locale";
import { formatMessage, type CoursesMessages } from "@/lib/i18n/messages";

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

const memberListShellClass =
  "divide-y divide-[#F1F1F1] rounded-[1.25rem] border border-classmates-edge/90 bg-classmates-surface dark:divide-border/60 dark:border-border/60 dark:bg-card";

const memberIntentChipClass =
  "rounded-full bg-[#F0FDFA] px-2 py-0.5 text-[10px] font-semibold leading-tight text-[#0F766E] dark:border dark:border-teal-800/40 dark:bg-teal-950/45 dark:text-teal-100";

/** No thread yet — compact primary CTA. */
const memberMessageButtonClass =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-full bg-[#2563EB] px-3 text-[12px] font-semibold text-white transition hover:bg-[#1D4ED8] active:bg-[#1E40AF] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/45 dark:bg-blue-600 dark:hover:bg-blue-500";

/** Existing thread — compact secondary CTA. */
const memberOpenChatLinkClass =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-3 text-[12px] font-semibold text-[#2563EB] transition hover:bg-[#DBEAFE] active:bg-[#BFDBFE] dark:border-blue-800/60 dark:bg-blue-950/45 dark:text-blue-200 dark:hover:bg-blue-950/70";

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
}: {
  courseId: string;
  members: CourseMember[];
}) {
  const { courses: co } = useAppMessages();
  const intentLabel: Record<CourseIntent, string> = {
    STUDY_TOGETHER: co.intentStudyTogether,
    EXAM_PREP: co.intentExamPrep,
    GO_TO_CLASS_TOGETHER: co.intentGoTogether,
    EAT_AFTER_CLASS: co.intentGetCoffee,
  };
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const haystack = [m.nickname, m.major ?? "", m.bio ?? ""].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [members, query]);

  const n = members.length;

  return (
    <section
      className="space-y-2 border-t border-classmates-hairline pt-4 dark:border-border/60"
      aria-labelledby="course-classmates-heading"
    >
      <h3
        id="course-classmates-heading"
        className="px-0.5 text-base font-semibold leading-tight tracking-tight text-classmates-ink dark:text-foreground"
      >
        {co.memberListHeading}
      </h3>

      {n > 0 ? (
        <Input
          placeholder={formatMessage(co.memberSearchPlaceholder, { count: members.length })}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-9 rounded-xl border-classmates-edge/90 px-3 py-1.5 text-[13px] leading-tight shadow-none ring-offset-0 focus-visible:ring-1 focus-visible:ring-classmates-azure/40 focus-visible:ring-offset-0 dark:border-border/80"
          aria-label={co.memberSearchAria}
        />
      ) : null}

      {n === 0 ? (
        <p className="px-1 py-2 text-center text-[12px] leading-snug text-classmates-hint dark:text-zinc-500">
          {co.memberEmpty}
        </p>
      ) : filtered.length === 0 ? (
        <p className="rounded-[1.25rem] border border-classmates-edge/90 bg-classmates-surface px-3 py-6 text-center text-[12px] text-muted-foreground dark:border-border/60 dark:bg-card dark:text-zinc-400">
          {formatMessage(co.memberNoMatch, { query: query.trim() })}
        </p>
      ) : (
        <ul className={memberListShellClass}>
          {filtered.map((m) => (
            <MemberRow
              key={m.membershipId}
              member={m}
              courseId={courseId}
              intentLabel={intentLabel}
              copy={co}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function MemberRow({
  member,
  courseId,
  intentLabel,
  copy,
}: {
  member: CourseMember;
  courseId: string;
  intentLabel: Record<CourseIntent, string>;
  copy: CoursesMessages;
}) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const overlap = formatOverlapShort(member.overlapMinutes);
  const profileHref =
    `/users/${member.userId}?returnTo=${encodeURIComponent(`/courses/${courseId}`)}` as Route;
  const profileMeta = buildProfileMetaLine(member, copy);

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
        {copy.memberOpenChat}
      </Link>
    ) : (
      <button type="button" onClick={() => void openChat()} disabled={opening} className={memberMessageButtonClass}>
        {opening ? copy.memberOpening : copy.memberMessage}
      </button>
    );

  return (
    <li className="flex items-start gap-2.5 px-3 py-2.5">
      <Link
        href={profileHref}
        className="shrink-0 rounded-full outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-classmates-azure/40 focus-visible:ring-offset-2"
        aria-label={formatMessage(copy.memberViewProfileAria, { name: member.nickname })}
      >
        <PresetAvatar id={member.avatarUrl} size={40} className="shrink-0" />
      </Link>

      <div className="min-w-0 flex-1 space-y-1">
        <Link
          href={profileHref}
          className="block min-w-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-classmates-azure/40"
        >
          <div className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 truncate text-[13px] font-semibold leading-tight text-classmates-ink dark:text-foreground">
              {member.nickname}
            </span>
            <VerifiedBadge
              size="xs"
              school={member.school}
              verifiedStudent={member.verifiedStudent}
              status={member.studentVerificationStatus}
              className="shrink-0"
            />
          </div>
          {profileMeta ? (
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{profileMeta}</p>
          ) : null}
          {overlap ? (
            <p className="mt-0.5 text-[11px] font-semibold leading-snug text-[#0F766E] dark:text-teal-300">
              {formatMessage(copy.memberOverlapLine, { overlap })}
            </p>
          ) : null}
        </Link>

        {member.intentions.length ? (
          <div
            className="flex flex-wrap gap-1"
            aria-label={`${copy.memberWantsTo} ${member.intentions.map((intent) => intentLabel[intent]).join(", ")}`}
          >
            {member.intentions.map((intent) => (
              <span key={intent} className={memberIntentChipClass}>
                {intentLabel[intent]}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 self-center">{cta}</div>
    </li>
  );
}

function buildProfileMetaLine(member: CourseMember, copy: CoursesMessages): string | null {
  const schoolInBadge =
    member.studentVerificationStatus === "VERIFIED" && member.verifiedStudent;
  const schoolMeta = !schoolInBadge && member.school?.trim() ? member.school.trim() : null;
  const parts = [
    member.major,
    member.semester ? formatMessage(copy.memberSemesterChip, { semester: member.semester }) : null,
    schoolMeta,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
