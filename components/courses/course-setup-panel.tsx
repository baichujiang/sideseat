"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { CourseIntent, Weekday } from "@prisma/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, CalendarPlus2, PencilLine, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** Human copy for “how I want to connect” in this course (teal intent chips). */
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
}: {
  course: CourseRef;
  initialIntentions: CourseIntent[];
  sessions: SessionDraft[];
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
    <section className="rounded-[1.125rem] border border-border/60 bg-card px-3.5 py-3 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] dark:border-border/80">
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
              {saving ? "Saving…" : "Save"}
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
  /** Match course hero primary actions (outline pill) instead of accent chip. */
  triggerVariant = "accent",
}: {
  course: CourseRef;
  intentions: CourseIntent[];
  initialSessions: SessionDraft[];
  triggerVariant?: "accent" | "neutral";
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

  function updateSession(index: number, key: keyof SessionDraft, value: string) {
    setSessions((current) =>
      current.map((session, i) => (i === index ? { ...session, [key]: value } : session)),
    );
  }

  function addSession() {
    setSessions((current) => [
      ...current,
      { weekday: "TUE", start: "14:00", end: "16:00", location: "" },
    ]);
  }

  function removeSession(index: number) {
    setSessions((current) => current.filter((_, i) => i !== index));
  }

  async function save(nextSessions: SessionDraft[]) {
    setSaving(true);
    setError("");
    const result = await persistCourseSetup({ course, intentions, sessions: nextSessions });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
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

  return (
    <div className="space-y-3">
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
            setSessions([{ weekday: "TUE", start: "", end: "", location: "" }]);
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
        {hasCalendarSetup ? "Class times set" : "Add class time"}
      </button>

      {expanded ? (
        <section
          id="course-calendar"
          className="rounded-[1.125rem] border border-border/60 bg-card px-4 py-3.5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)]"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold leading-tight">
                {hasCalendarSetup ? "Your class times" : "Add class time"}
              </h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {hasCalendarSetup
                  ? "When this course meets on your weekly home schedule"
                  : "Set when this class meets so it appears on your week view"}
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
                <ul className="space-y-2">
                  {sortedSessions.map((session) => (
                    <li
                      key={`${session.weekday}-${session.start}-${session.end}-${session.location}`}
                      className="rounded-xl bg-muted/35 px-3 py-2"
                    >
                      <p className="text-[13px] font-medium text-foreground">
                        {WEEKDAY_SHORT[session.weekday]} {session.start}–{session.end}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                        {session.location.trim() || "No location set"}
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-3 py-3">
                  <p className="text-[13px] font-medium text-foreground">Not on your schedule yet</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                    Add weekday and start/end time so this course shows on your home schedule.
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
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] font-medium text-foreground">Weekly times</p>
                  <button
                    type="button"
                    onClick={addSession}
                    className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-foreground/80 transition hover:bg-muted/80"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.25} />
                    Add time
                  </button>
                </div>

                {sessions.length > 0 ? (
                  <div className="space-y-2">
                  {sessions.map((session, index) => (
                    <div
                      key={`${index}-${session.weekday}-${session.start}`}
                      className="rounded-xl border border-border/70 bg-muted/20 p-3"
                    >
                      <div className="grid gap-2 sm:grid-cols-[6rem_1fr_1fr_auto]">
                        <select
                          value={session.weekday}
                          onChange={(e) => updateSession(index, "weekday", e.target.value)}
                          className="h-10 rounded-xl border border-input bg-background px-3 text-[13px]"
                        >
                          {WEEKDAY_ORDER.map((weekday) => (
                            <option key={weekday} value={weekday}>
                              {WEEKDAY_SHORT[weekday]}
                            </option>
                          ))}
                        </select>
                        <Input
                          type="time"
                          value={session.start}
                          onChange={(e) => updateSession(index, "start", e.target.value)}
                        />
                        <Input
                          type="time"
                          value={session.end}
                          onChange={(e) => updateSession(index, "end", e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => removeSession(index)}
                          disabled={sessions.length === 1}
                          className={cn(
                            "inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground",
                            sessions.length === 1 && "pointer-events-none opacity-35",
                          )}
                          aria-label="Remove session"
                        >
                          <X className="h-4 w-4" strokeWidth={2.25} />
                        </button>
                      </div>
                      <Input
                        className="mt-2"
                        placeholder="Location (optional)"
                        value={session.location}
                        onChange={(e) => updateSession(index, "location", e.target.value)}
                      />
                    </div>
                  ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border/70 bg-muted/15 px-3 py-3">
                    <p className="text-[12px] text-muted-foreground">
                      No time set yet.
                    </p>
                  </div>
                )}
              </div>

                {error ? <p className="text-[12px] text-destructive">{error}</p> : null}

              <div className="flex gap-2">
                <Button type="button" variant="ghost" className="flex-1" onClick={cancelEditing}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="flex-1"
                  onClick={() => void save(sessions)}
                  disabled={saving}
                >
                  {saving ? "Saving…" : hasCalendarSetup ? "Save" : "Save class times"}
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
