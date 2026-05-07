"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { CourseIntent, Weekday } from "@prisma/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, CalendarPlus2, PencilLine } from "lucide-react";

import { Button } from "@/components/ui/button";
import { isCompleteMiniSession, MiniWorkweekCourseGrid } from "@/components/courses/mini-workweek-course-grid";
import { profileSectionLabelClassName } from "@/lib/ui/profile-section-label";
import { cn } from "@/lib/utils";

const WEEKDAY_ORDER: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const WEEKDAY_SHORT: Record<Weekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

/** Human copy for "how I want to connect" in this course (teal intent chips). */
const CONNECTION_INTENT_LABEL: Record<CourseIntent, string> = {
  GO_TO_CLASS_TOGETHER: "Go together",
  EAT_AFTER_CLASS: "Eat after class",
  STUDY_TOGETHER: "Study together",
  EXAM_PREP: "Exam prep",
};

const intentChipReadClass =
  "rounded-full bg-[#F0FDFA] px-3 py-1.5 text-sm font-semibold text-[#0F766E] dark:border dark:border-teal-800/50 dark:bg-teal-950/40 dark:text-teal-100";

const intentToggleSelectedClass =
  "rounded-full bg-[#0F766E] px-3 py-1.5 text-sm font-semibold text-white shadow-sm dark:bg-teal-600";

const intentToggleIdleClass =
  "rounded-full border border-[#99F6E4] bg-white/90 px-3 py-1.5 text-sm font-semibold text-[#0F766E] hover:bg-[#F0FDFA] dark:border-teal-800/60 dark:bg-card dark:text-teal-100 dark:hover:bg-teal-950/50";

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

export function CourseTagsPanel({
  course,
  initialIntentions,
  sessions,
  /** `inline`: section divider only, no card frame (e.g. course detail page). */
  layout = "card",
}: {
  course: CourseRef;
  initialIntentions: CourseIntent[];
  sessions: SessionDraft[];
  layout?: "card" | "inline";
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [intentions, setIntentions] = useState<CourseIntent[]>(initialIntentions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleIntent(intent: CourseIntent) {
    setIntentions((current) =>
      current.includes(intent) ? current.filter((item) => item !== intent) : [...current, intent],
    );
  }

  async function save() {
    setSaving(true);
    setError("");
    const result = await persistCourseSetup({ course, intentions, sessions });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <section
      className={cn(
        layout === "inline"
          ? "border-t border-classmates-hairline pt-5 dark:border-border/60"
          : "rounded-[1.125rem] border border-border/60 bg-card px-3.5 py-3 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] dark:border-border/80",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 pr-1">
          <p className={cn(profileSectionLabelClassName, "!mb-1")}>Connection tags</p>
          <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
            How I want to connect
          </h3>
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            Tell classmates what you&apos;re looking for in this course.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing((value) => !value);
            setError("");
          }}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-2.5 text-[11px] font-semibold text-[#2563EB] transition hover:bg-[#DBEAFE] dark:border-blue-800/50 dark:bg-blue-950/40 dark:text-blue-200 dark:hover:bg-blue-950/70"
        >
          <PencilLine className="h-3 w-3" strokeWidth={2.25} />
          {editing ? "Close" : "Edit"}
        </button>
      </div>

      {!editing ? (
        <div className="mt-2.5">
          {intentions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {intentions.map((intent) => (
                <span key={intent} className={intentChipReadClass}>
                  {CONNECTION_INTENT_LABEL[intent]}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[12px] leading-snug text-muted-foreground">
              Nothing selected yet — tap Edit to share what you&apos;re open to.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-2.5 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {Object.values(CourseIntent).map((intent) => (
              <button
                key={intent}
                type="button"
                onClick={() => toggleIntent(intent)}
                aria-pressed={intentions.includes(intent)}
                className={cn(
                  "transition",
                  intentions.includes(intent) ? intentToggleSelectedClass : intentToggleIdleClass,
                )}
              >
                {CONNECTION_INTENT_LABEL[intent]}
              </button>
            ))}
          </div>

          {error ? <p className="text-[12px] leading-snug text-destructive">{error}</p> : null}

          <div className="flex gap-2 pt-0.5">
            <Button type="button" variant="ghost" size="sm" className="flex-1 h-9 text-[13px]" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" className="flex-1 h-9 text-[13px]" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving\u2026" : "Save"}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export function CourseCalendarPanel({
  course,
  intentions,
  initialSessions,
  triggerVariant = "accent",
  /** `inline`: no card frame around expanded panel (e.g. course detail page). */
  layout = "card",
}: {
  course: CourseRef;
  intentions: CourseIntent[];
  initialSessions: SessionDraft[];
  triggerVariant?: "accent" | "neutral";
  layout?: "card" | "inline";
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [sessions, setSessions] = useState<SessionDraft[]>(initialSessions);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const hasCalendarSetup = initialSessions.length > 0;
  const hasDraftSessions = sessions.length > 0;

  const sortedSessions = [...sessions].sort((a, b) => {
    const da = WEEKDAY_ORDER.indexOf(a.weekday);
    const db = WEEKDAY_ORDER.indexOf(b.weekday);
    if (da !== db) return da - db;
    return a.start.localeCompare(b.start);
  });

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
          : "课表已保存，但同步到首页日历失败。请检查网络后重试「同步到日历」。",
      );
      return false;
    }

    setSaving(false);
    setEditing(false);
    router.refresh();
    return true;
  }

  async function removeFromCalendar() {
    if (!window.confirm("Remove class times from your schedule?")) {
      return;
    }
    const ok = await save([]);
    if (ok) {
      setExpanded(false);
    }
  }

  function cancelEditing() {
    setSessions(initialSessions);
    setError("");
    setEditing(false);
    if (!hasCalendarSetup) {
      setExpanded(false);
    }
  }

  function clearDraftSessions() {
    if (sessions.length === 0) return;
    if (!window.confirm("清空当前所有课表时段？")) return;
    setSessions([]);
    setError("");
  }

  return (
    <div className={cn("space-y-3", layout === "inline" && "space-y-2")}>
      <button
        type="button"
        onClick={() => {
          if (hasCalendarSetup) {
            setExpanded((value) => !value);
            return;
          }
          setExpanded(true);
          setEditing(true);
          if (!hasDraftSessions) {
            setSessions([]);
          }
          setError("");
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-semibold transition",
          triggerVariant === "neutral"
            ? "border border-[#BFDBFE] bg-[#EFF6FF] px-5 py-3 text-sm font-semibold text-[#2563EB] shadow-[0_1px_2px_rgba(37,99,235,0.06)] hover:bg-[#DBEAFE] active:bg-[#BFDBFE] dark:border-blue-800/60 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-950/80"
            : "h-8 bg-primary/10 px-3 text-[12px] text-primary hover:bg-primary/15",
        )}
      >
        {hasCalendarSetup ? (
          <CalendarCheck2 className="h-3.5 w-3.5 text-[#2563EB] dark:text-blue-300" strokeWidth={2.25} />
        ) : (
          <CalendarPlus2 className="h-3.5 w-3.5 text-[#2563EB] dark:text-blue-300" strokeWidth={2.25} />
        )}
        {hasCalendarSetup ? "\u7F16\u8F91\u5468\u5386\u65F6\u95F4" : "\u6DFB\u52A0\u5468\u5386\u65F6\u95F4"}
      </button>

      {expanded ? (
        <section
          id="course-calendar"
          className={cn(
            layout === "inline"
              ? "border-t border-classmates-hairline pt-4 dark:border-border/60"
              : "rounded-[1.125rem] border border-border/60 bg-card px-4 py-3.5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)]",
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold leading-tight">
                {hasCalendarSetup ? "Your class times" : "Add this course to your week"}
              </h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {hasCalendarSetup
                  ? "These blocks repeat every week on your Home schedule."
                  : "Enter when you meet, then save \u2014 times show up on Home in your week view (your personal calendar, not the school\u2019s)."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (editing) {
                  cancelEditing();
                  return;
                }
                setEditing(true);
                setError("");
              }}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-[12px] font-semibold text-primary transition hover:bg-primary/15"
            >
              <PencilLine className="h-3.5 w-3.5" strokeWidth={2.25} />
              {editing ? "Close" : hasCalendarSetup ? "Edit" : "Set time"}
            </button>
          </div>

          {!editing ? (
            <div className="mt-3 space-y-3">
              {sortedSessions.length > 0 ? (
                <ul className={cn(layout === "inline" ? "divide-y divide-border/50" : "space-y-2")}>
                  {sortedSessions.map((session) => (
                    <li
                      key={`${session.weekday}-${session.start}-${session.end}-${session.location}`}
                      className={cn(
                        layout === "inline" ? "py-2.5 first:pt-0" : "rounded-xl bg-muted/35 px-3 py-2",
                      )}
                    >
                      <p className="text-[13px] font-medium text-foreground">
                        {WEEKDAY_SHORT[session.weekday]} {session.start}\u2013{session.end}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                        {session.location.trim() || "No location set"}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div
                  className={cn(
                    layout === "inline"
                      ? "py-1"
                      : "rounded-xl border border-dashed border-border/70 bg-muted/15 px-3 py-3",
                  )}
                >
                  <p className="text-[13px] font-medium text-foreground">Not on your schedule yet</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    Tap the button above, add your weekly times, and save \u2014 that adds this course to your Home week view.
                  </p>
                </div>
              )}

              {hasCalendarSetup ? (
                <div className="border-t border-border/60 pt-2">
                  <button
                    type="button"
                    onClick={() => void removeFromCalendar()}
                    disabled={saving}
                    className="inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold text-destructive/85 transition hover:bg-destructive/8 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
                  >
                    {saving ? "Removing..." : "Remove class times"}
                  </button>
                  {error ? <p className="mt-2 text-[12px] text-destructive">{error}</p> : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 space-y-4">
              <div
                className={cn(
                  "text-[12px] leading-snug text-[#1E40AF] dark:text-blue-200",
                  layout === "inline"
                    ? "border-l-[3px] border-[#2563EB] bg-muted/25 py-2 pl-3 dark:border-blue-500 dark:bg-blue-950/20"
                    : "rounded-xl border border-[#BFDBFE]/80 bg-[#EFF6FF]/90 px-3 py-2.5 dark:border-blue-900/50 dark:bg-blue-950/35",
                )}
                role="note"
              >
                <p>
                  此处只影响你在本站的<span className="font-semibold">个人周历</span>，不会改选课状态，也不会向学校发送任何信息。
                </p>
                <p className="mt-2 border-t border-[#BFDBFE]/60 pt-2 dark:border-blue-900/40">
                  <span className="font-semibold">同步：</span>
                  点下方「<span className="font-semibold">同步到日历</span>」后，会把当前所有时段写入首页可拖动的日历事件；打开或返回首页即可看到更新。
                </p>
              </div>

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
                  一键清空时段
                </Button>
                <Button type="button" variant="ghost" className="flex-1" onClick={cancelEditing}>
                  Cancel
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
                  {saving ? "\u540C\u6B65\u4E2D\u2026" : "\u540C\u6B65\u5230\u65E5\u5386"}
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
