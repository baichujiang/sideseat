"use client";

import { CourseIntent } from "@prisma/client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";

import { Input } from "@/components/ui/input";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { cn } from "@/lib/utils";

export type CourseMember = {
  membershipId: string;
  userId: string;
  nickname: string;
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

const INTENT_LABEL: Record<CourseIntent, string> = {
  STUDY_TOGETHER: "study",
  EXAM_PREP: "exam prep",
  GO_TO_CLASS_TOGETHER: "go together",
  EAT_AFTER_CLASS: "eat after",
};

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
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const haystack = [m.nickname, m.major ?? "", m.bio ?? ""].join(" ").toLowerCase();
      return haystack.includes(q);
    });
  }, [members, query]);

  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
        You are the only one in this course so far.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1 px-1">
        <h3 className="text-[15px] font-semibold leading-tight text-foreground">Classmates</h3>
        <p className="text-[12px] text-muted-foreground">
          People already in this course
        </p>
      </div>

      <Input
        placeholder={`Search ${members.length} classmate${members.length === 1 ? "" : "s"}`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            No match for &ldquo;{query.trim()}&rdquo;
          </div>
        ) : null}
        {filtered.map((m, i) => (
          <MemberRow
            key={m.membershipId}
            member={m}
            courseId={courseId}
            isLast={i === filtered.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function MemberRow({
  member,
  courseId,
  isLast,
}: {
  member: CourseMember;
  courseId: string;
  isLast: boolean;
}) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const overlap = formatOverlapShort(member.overlapMinutes);
  const metaLine = [
    member.major,
    member.semester ? `sem ${member.semester}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function openChat() {
    if (opening) return;
    setOpening(true);
    try {
      const response = await fetch("/api/connections/open", {
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

  return (
    <div className={cn("px-3 py-3", !isLast && "border-b border-border")}>
      <div className="flex items-start gap-3">
        <PresetAvatar id={member.avatarUrl} size={50} className="shrink-0" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{member.nickname}</span>
            <VerifiedBadge
              size="xs"
              school={member.school}
              verifiedStudent={member.verifiedStudent}
              status={member.studentVerificationStatus}
            />
            {overlap ? (
              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                {overlap} overlap
              </span>
            ) : null}
          </div>

          {metaLine ? (
            <p className="truncate text-xs text-muted-foreground">{metaLine}</p>
          ) : null}

          {member.bio ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground/90">
              {member.bio}
            </p>
          ) : null}

          {member.intentions.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {member.intentions.map((intent) => (
                <span
                  key={intent}
                  className="rounded-full bg-foreground/5 px-2 py-0.5 text-[10px] font-medium text-foreground/80"
                >
                  {INTENT_LABEL[intent]}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="shrink-0">
          {member.threadState.kind === "ACTIVE" ? (
            <Link
              href={`/connections/${member.threadState.connectionId}?returnTo=${encodeURIComponent(`/courses/${courseId}`)}` as Route}
              className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-medium text-primary transition hover:bg-primary/15"
            >
              Open chat
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void openChat()}
              disabled={opening}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                "border-foreground/20 bg-foreground text-background hover:bg-foreground/90",
                opening && "pointer-events-none opacity-60",
              )}
            >
              {opening ? "Opening…" : "Message"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
