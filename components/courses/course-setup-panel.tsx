"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { CourseIntent, type Weekday } from "@prisma/client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { isCompleteMiniSession, MiniWorkweekCourseGrid } from "@/components/courses/mini-workweek-course-grid";
import { useAppMessages } from "@/hooks/use-app-locale";
import type { CoursesMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type CourseRef = {
  id: string;
  code: string | null;
  name: string;
};

type SessionDraft = {
  weekday: Weekday;
  start: string;
  end: string;
  location: string;
};

/** Order-insensitive compare (trim times/location). */
function sessionsDraftEqual(a: SessionDraft[], b: SessionDraft[]): boolean {
  if (a.length !== b.length) return false;
  const norm = (s: SessionDraft) =>
    `${s.weekday}\0${s.start.trim()}\0${s.end.trim()}\0${s.location.trim()}`;
  const sa = [...a].map(norm).sort((x, y) => x.localeCompare(y));
  const sb = [...b].map(norm).sort((x, y) => x.localeCompare(y));
  return sa.every((k, i) => k === sb[i]);
}

async function persistCourseSetup(args: {
  course: CourseRef;
  intentions: CourseIntent[];
  sessions: SessionDraft[];
  copy: CoursesMessages;
}) {
  if (!args.course.code) {
    return { ok: false, error: args.copy.setupErrorMissingCode };
  }

  const response = await apiFetch("/api/courses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: args.course.code,
      name: args.course.name,
      location: "",
      intentions: args.intentions,
      sessions: args.sessions,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: typeof payload.error === "string" ? payload.error : args.copy.setupUnableSaveGeneric,
    };
  }

  const savedCourseId =
    payload.data != null &&
    typeof payload.data === "object" &&
    "courseId" in payload.data &&
    typeof (payload.data as { courseId: unknown }).courseId === "string"
      ? (payload.data as { courseId: string }).courseId
      : undefined;

  return { ok: true as const, courseId: savedCourseId };
}

async function mirrorCourseSessions(courseId: string, sessions: SessionDraft[]) {
  const complete = sessions.filter(isCompleteMiniSession);
  return apiFetch("/api/calendar/mirror-course-sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      courseId,
      enabled: complete.length > 0,
      sessions: complete,
    }),
  });
}

export function CourseCalendarPanel({
  course,
  intentions,
  initialSessions,
  /** `inline`: no card frame around expanded panel (e.g. course detail page). */
  layout = "card",
}: {
  course: CourseRef;
  intentions: CourseIntent[];
  initialSessions: SessionDraft[];
  layout?: "card" | "inline";
}) {
  const router = useRouter();
  const { courses: co, common } = useAppMessages();
  const [isEditing, setIsEditing] = useState(false);
  const [sessions, setSessions] = useState<SessionDraft[]>(initialSessions);
  const [saving, setSaving] = useState(false);
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [error, setError] = useState("");
  const hasCalendarSetup = initialSessions.length > 0;

  useEffect(() => {
    if (!isEditing) {
      setSessions(initialSessions);
    }
  }, [initialSessions, isEditing]);

  const canSyncCalendar = course.code != null && course.code.trim().length > 0;
  const sessionEditsPending = !sessionsDraftEqual(sessions, initialSessions);

  function enterEdit() {
    setError("");
    setSessions(initialSessions);
    setIsEditing(true);
  }

  function cancelEdit() {
    setSessions(initialSessions);
    setError("");
    setIsEditing(false);
  }

  async function saveEdits() {
    if (sessions.length > 0 && !sessions.every(isCompleteMiniSession)) {
      setError(co.setupErrorFixBlocks);
      return;
    }

    setSaving(true);
    setError("");
    const result = await persistCourseSetup({ course, intentions, sessions, copy: co });
    if (!result.ok) {
      setSaving(false);
      setError(result.error);
      return;
    }

    const mirrorTargetId = result.courseId ?? course.id;
    const mirrorRes = await mirrorCourseSessions(mirrorTargetId, sessions);
    const mirrorPayload = await mirrorRes.json().catch(() => ({}));
    if (!mirrorRes.ok) {
      setSaving(false);
      setIsEditing(false);
      router.refresh();
      setError(
        typeof mirrorPayload.error === "string"
          ? `${co.setupErrorSaveCalendarPrefix}${mirrorPayload.error}`
          : co.setupErrorSaveCalendarRetry,
      );
      return;
    }

    setSaving(false);
    setIsEditing(false);
    router.refresh();
  }

  async function syncCalendarOnly() {
    if (!canSyncCalendar) return;
    setSyncingCalendar(true);
    setError("");
    const mirrorRes = await mirrorCourseSessions(course.id, initialSessions);
    const mirrorPayload = await mirrorRes.json().catch(() => ({}));
    setSyncingCalendar(false);
    if (!mirrorRes.ok) {
      setError(
        typeof mirrorPayload.error === "string" ? mirrorPayload.error : co.setupSyncCalendarFailedGeneric,
      );
      return;
    }
    router.refresh();
  }

  function clearDraftSessions() {
    if (sessions.length === 0) return;
    if (!window.confirm(co.setupClearAllConfirm)) return;
    setSessions([]);
    setError("");
  }

  return (
    <section
      id="course-calendar"
      className={cn(
        layout === "inline"
          ? "border-t border-classmates-hairline pt-4 dark:border-border/60"
          : "rounded-[1.125rem] border border-border/60 bg-card px-4 py-3.5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)]",
      )}
    >
      <div className="space-y-4">
        {isEditing ? (
          <>
            <MiniWorkweekCourseGrid
              key="edit"
              courseTitle={course.name}
              sessions={sessions}
              onSessionsChange={setSessions}
            />
            {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={clearDraftSessions}
                disabled={saving || sessions.length === 0}
              >
                {co.setupClearAllBlocks}
              </Button>
              <Button type="button" variant="ghost" className="min-w-0 flex-1" onClick={cancelEdit} disabled={saving}>
                {common.cancel}
              </Button>
              <Button
                type="button"
                className="min-w-0 flex-1"
                onClick={() => void saveEdits()}
                disabled={saving || !sessionEditsPending}
              >
                {saving ? co.setupSaving : common.save}
              </Button>
            </div>
          </>
        ) : (
          <>
            {!hasCalendarSetup ? (
              <p className="rounded-xl border border-amber-200/90 bg-amber-50/90 px-3 py-2 text-[12px] text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
                {co.setupNoOfficialSchedule}
              </p>
            ) : null}
            <MiniWorkweekCourseGrid
              key="view"
              readOnly
              courseTitle={course.name}
              sessions={initialSessions}
              onSessionsChange={() => {}}
            />
            {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="min-w-0 flex-1" onClick={enterEdit} disabled={saving}>
                {hasCalendarSetup ? co.setupEdit : co.setupAddTimes}
              </Button>
              <Button
                type="button"
                className="min-w-0 flex-1"
                onClick={() => void syncCalendarOnly()}
                disabled={saving || syncingCalendar || !canSyncCalendar}
              >
                {syncingCalendar ? co.setupSyncing : co.setupSyncCalendar}
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
