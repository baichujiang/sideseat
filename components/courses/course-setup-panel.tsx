"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { CourseIntent, Weekday } from "@prisma/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { isCompleteMiniSession, MiniWorkweekCourseGrid } from "@/components/courses/mini-workweek-course-grid";
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

async function persistCourseSetup(args: {
  course: CourseRef;
  intentions: CourseIntent[];
  sessions: SessionDraft[];
}) {
  if (!args.course.code) {
    return { ok: false, error: "This course is missing a course code." as const };
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
      error: typeof payload.error === "string" ? payload.error : "Unable to save course.",
    };
  }

  return { ok: true as const };
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
  const [sessions, setSessions] = useState<SessionDraft[]>(initialSessions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const hasCalendarSetup = initialSessions.length > 0;

  async function save(nextSessions: SessionDraft[]) {
    setSaving(true);
    setError("");
    const result = await persistCourseSetup({ course, intentions, sessions: nextSessions });
    if (!result.ok) {
      setSaving(false);
      setError(result.error);
      return false;
    }

    const complete = nextSessions.filter(isCompleteMiniSession);
    const mirrorRes = await apiFetch("/api/calendar/mirror-course-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseId: course.id,
        enabled: complete.length > 0,
        sessions: complete,
      }),
    });
    const mirrorPayload = await mirrorRes.json().catch(() => ({}));
    if (!mirrorRes.ok) {
      setSaving(false);
      setError(
        typeof mirrorPayload.error === "string"
          ? mirrorPayload.error
          : "Schedule saved, but syncing to Home calendar failed. Check your network and try 'Sync to calendar' again.",
      );
      return false;
    }

    setSaving(false);
    router.refresh();
    return true;
  }

  function resetDraftSessions() {
    setSessions(initialSessions);
    setError("");
  }

  function clearDraftSessions() {
    if (sessions.length === 0) return;
    if (!window.confirm("Clear all current class time blocks?")) return;
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
      <div>
        <h3 className="text-[15px] font-semibold leading-tight">
          {hasCalendarSetup ? "Your class times" : "Add this course to your week"}
        </h3>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Enter when you meet, then sync - times show up on Home in your week view (your personal calendar, not the school's).
        </p>
      </div>

      <div className="mt-3 space-y-4">
        <MiniWorkweekCourseGrid
          courseTitle={course.name}
          sessions={sessions}
          onSessionsChange={setSessions}
        />

        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={clearDraftSessions}
            disabled={saving || sessions.length === 0}
          >
            Clear all blocks
          </Button>
          <Button type="button" variant="ghost" className="flex-1" onClick={resetDraftSessions} disabled={saving}>
            Reset
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={() => {
              if (sessions.length === 0) {
                setError("Tap the week grid to add at least one class time.");
                return;
              }
              if (!sessions.every(isCompleteMiniSession)) {
                setError("Fix every row so end time is after start time.");
                return;
              }
              setError("");
              void save(sessions);
            }}
            disabled={saving}
          >
            {saving ? "Syncing..." : "Sync to calendar"}
          </Button>
        </div>
      </div>
    </section>
  );
}
