"use client";

import { CourseIntent, Weekday } from "@prisma/client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck2, CalendarPlus2, PencilLine, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const INTENT_LABEL: Record<CourseIntent, string> = {
  GO_TO_CLASS_TOGETHER: "Go to class together",
  EAT_AFTER_CLASS: "Eat after class",
  STUDY_TOGETHER: "Study together",
  EXAM_PREP: "Exam prep",
};

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

  const response = await fetch("/api/courses", {
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
    <section className="rounded-[1.125rem] border border-border/60 bg-card px-4 py-3.5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold leading-tight">Tags</h3>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            Set how you want to connect in this course
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditing((value) => !value);
            setError("");
          }}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-[12px] font-semibold text-primary transition hover:bg-primary/15"
        >
          <PencilLine className="h-3.5 w-3.5" strokeWidth={2.25} />
          {editing ? "Close" : "Edit"}
        </button>
      </div>

      {!editing ? (
        <div className="mt-3">
          {intentions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {intentions.map((intent) => (
                <span
                  key={intent}
                  className="rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary"
                >
                  {INTENT_LABEL[intent]}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">No tags set yet.</p>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-4">
          <div className="flex flex-wrap gap-2">
            {Object.values(CourseIntent).map((intent) => (
              <button
                key={intent}
                type="button"
                onClick={() => toggleIntent(intent)}
                aria-pressed={intentions.includes(intent)}
                className={cn(
                  "rounded-full px-3 py-2 text-[12px] font-medium transition",
                  intentions.includes(intent)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground/80 hover:bg-muted/80",
                )}
              >
                {INTENT_LABEL[intent]}
              </button>
            ))}
          </div>

          {error ? <p className="text-[12px] text-destructive">{error}</p> : null}

          <div className="flex gap-2">
            <Button type="button" variant="ghost" className="flex-1" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button type="button" className="flex-1" onClick={() => void save()} disabled={saving}>
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
}: {
  course: CourseRef;
  intentions: CourseIntent[];
  initialSessions: SessionDraft[];
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
    if (!window.confirm("Remove this course from your calendar?")) {
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
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-[12px] font-semibold text-primary transition hover:bg-primary/15"
      >
        {hasCalendarSetup ? (
          <CalendarCheck2 className="h-3.5 w-3.5" strokeWidth={2.25} />
        ) : (
          <CalendarPlus2 className="h-3.5 w-3.5" strokeWidth={2.25} />
        )}
        {hasCalendarSetup ? "In calendar" : "Add to calendar"}
      </button>

      {expanded ? (
        <section
          id="course-calendar"
          className="rounded-[1.125rem] border border-border/60 bg-card px-4 py-3.5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)]"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold leading-tight">
                {hasCalendarSetup ? "In your calendar" : "Add to calendar"}
              </h3>
              <p className="mt-0.5 text-[12px] text-muted-foreground">
                {hasCalendarSetup
                  ? "Your weekly class time for this course"
                  : "Set your class time so this course shows up on your weekly schedule"}
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
                    Set a weekday and time to show this course in your weekly calendar.
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
                    {saving ? "Removing..." : "Remove from calendar"}
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
                  {saving ? "Saving…" : hasCalendarSetup ? "Save" : "Add to calendar"}
                </Button>
              </div>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
