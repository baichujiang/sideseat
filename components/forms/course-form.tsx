"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { CourseIntent, Weekday } from "@prisma/client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { SaveBookmarkButton } from "@/components/courses/save-bookmark-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/forms/form-message";
import { courseSchema } from "@/lib/validators/course";
import { getCurrentSemesterLabel } from "@/lib/constants/semester";
import { cn } from "@/lib/utils";

type CourseValues = z.infer<typeof courseSchema>;

const intentions = Object.values(CourseIntent);
const currentSemester = getCurrentSemesterLabel();

const WEEKDAY_OPTIONS: { value: Weekday; label: string }[] = [
  { value: "MON", label: "Mon" },
  { value: "TUE", label: "Tue" },
  { value: "WED", label: "Wed" },
  { value: "THU", label: "Thu" },
  { value: "FRI", label: "Fri" },
  { value: "SAT", label: "Sat" },
  { value: "SUN", label: "Sun" },
];

type CourseHit = {
  id: string;
  code: string | null;
  name: string;
  memberCount: number;
  enrolled: boolean;
  saved: boolean;
};

type Variant = {
  fingerprint: string;
  userCount: number;
  sessions: { weekday: Weekday; start: string; end: string }[];
};

type Picked = { code: string; name: string; courseId?: string };

export function CourseForm({
  prefillCourseId,
}: {
  prefillCourseId?: string | null;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [syncHomeCalendarEvents, setSyncHomeCalendarEvents] = useState(false);

  // Course identity UI state: either "search" (typing to find/create) or
  // "picked" (a course is locked in). In "search" mode the user can also
  // expand an inline "Add new" box to type code+name by hand.
  const [mode, setMode] = useState<"search" | "picked">("search");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CourseHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);

  const [variants, setVariants] = useState<Variant[]>([]);
  const [usedVariantFingerprint, setUsedVariantFingerprint] = useState<string | null>(null);
  const sessionsAutoFilled = useRef(false);
  const prefillLoaded = useRef(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<CourseValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      name: "",
      code: "",
      location: "",
      intentions: [CourseIntent.STUDY_TOGETHER],
      sessions: [{ weekday: "TUE" as Weekday, start: "14:00", end: "16:00", location: "" }],
    },
  });

  const { fields, replace, append, remove } = useFieldArray({ control, name: "sessions" });
  const selectedIntentions = watch("intentions");
  const codeValue = watch("code");

  useEffect(() => {
    const id = prefillCourseId?.trim();
    if (!id || prefillLoaded.current) return;
    prefillLoaded.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(`/api/courses/${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const json = (await res.json()) as {
          data?: { id: string; code: string | null; name: string };
        };
        const c = json.data;
        if (!c || cancelled) return;
        setValue("code", c.code ?? "", { shouldValidate: true });
        setValue("name", c.name, { shouldValidate: true });
        setPicked({ code: c.code ?? "", name: c.name, courseId: c.id });
        setMode("picked");
        setQuery("");
        setHits([]);
        sessionsAutoFilled.current = false;
        setUsedVariantFingerprint(null);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [prefillCourseId, setValue]);

  // -- Search --------------------------------------------------------------
  useEffect(() => {
    if (mode !== "search") return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await apiFetch(`/api/courses/search?q=${encodeURIComponent(q)}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const payload = (await res.json()) as { data?: { hits?: CourseHit[] } };
        setHits(payload.data?.hits ?? []);
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") console.error(err);
      } finally {
        setSearchLoading(false);
      }
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, mode]);

  const pickHit = (hit: CourseHit) => {
    setValue("code", hit.code ?? "", { shouldValidate: true });
    setValue("name", hit.name, { shouldValidate: true });
    setPicked({ code: hit.code ?? "", name: hit.name, courseId: hit.id });
    setMode("picked");
    setManualOpen(false);
    setHits([]);
    sessionsAutoFilled.current = false;
    setUsedVariantFingerprint(null);
  };

  const clearPicked = () => {
    setPicked(null);
    setMode("search");
    setQuery("");
    setValue("code", "");
    setValue("name", "");
    setVariants([]);
    setUsedVariantFingerprint(null);
    sessionsAutoFilled.current = false;
  };

  // -- Manual entry --------------------------------------------------------
  const commitManual = () => {
    const code = getValues("code").trim();
    const name = getValues("name").trim();
    if (code.length < 2 || name.length < 2) return;
    setPicked({ code: code.toUpperCase(), name });
    setMode("picked");
    setManualOpen(false);
    sessionsAutoFilled.current = false;
  };

  // -- Schedule variants ---------------------------------------------------
  useEffect(() => {
    if (mode !== "picked") {
      setVariants([]);
      return;
    }
    const params = new URLSearchParams();
    if (picked?.courseId) params.set("courseId", picked.courseId);
    else if (picked?.code) params.set("code", picked.code);
    else return;

    const controller = new AbortController();
    (async () => {
      try {
        const res = await apiFetch(`/api/courses/schedule-variants?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const payload = (await res.json()) as { data?: { variants?: Variant[] } };
        const next = payload.data?.variants ?? [];
        setVariants(next);

        const top = next[0];
        if (top && top.userCount >= 2 && !sessionsAutoFilled.current) {
          replace(
            top.sessions.map((s) => ({
              weekday: s.weekday,
              start: s.start,
              end: s.end,
              location: "",
            })),
          );
          setUsedVariantFingerprint(top.fingerprint);
          sessionsAutoFilled.current = true;
        }
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") console.error(err);
      }
    })();
    return () => controller.abort();
  }, [mode, picked, replace]);

  const applyVariant = (variant: Variant) => {
    replace(
      variant.sessions.map((s) => ({
        weekday: s.weekday,
        start: s.start,
        end: s.end,
        location: "",
      })),
    );
    setUsedVariantFingerprint(variant.fingerprint);
    sessionsAutoFilled.current = true;
  };

  // -- Form submit ---------------------------------------------------------
  const toggleIntention = (intention: CourseIntent) => {
    const next = selectedIntentions.includes(intention)
      ? selectedIntentions.filter((entry) => entry !== intention)
      : [...selectedIntentions, intention];
    setValue("intentions", next, { shouldValidate: true });
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerError("");
    const response = await apiFetch("/api/courses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const payload = await response.json();
    if (!response.ok) {
      setServerError(payload.error ?? "Unable to add course.");
      return;
    }
    const courseId = payload.data?.courseId as string | undefined;
    if (courseId && syncHomeCalendarEvents && values.sessions.length > 0) {
      await apiFetch("/api/calendar/mirror-course-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId,
          enabled: true,
          sessions: values.sessions,
        }),
      });
    }
    router.push(`/courses/${courseId}`);
    router.refresh();
  });

  const canSubmit = mode === "picked" && (codeValue?.trim().length ?? 0) >= 2;

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {/* --- Course identity ------------------------------------------ */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium">Course</label>
          <span className="text-[11px] text-muted-foreground">{currentSemester}</span>
        </div>

        {mode === "picked" && picked ? (
          <div className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2.5">
            <div className="min-w-0">
              {picked.code ? (
                <span className="mr-2 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-semibold">
                  {picked.code}
                </span>
              ) : null}
              <span className="text-sm font-medium">{picked.name}</span>
            </div>
            <button
              type="button"
              onClick={clearPicked}
              className="shrink-0 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Course code or name — e.g. IN2064 or Machine Learning"
              autoFocus
            />
            {query.trim().length >= 2 ? (
              <div className="overflow-hidden rounded-2xl border border-border bg-card">
                {searchLoading && hits.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-muted-foreground">Searching...</div>
                ) : null}

                {hits.map((hit) => (
                  <div
                    key={hit.id}
                    className="flex items-stretch border-b border-border last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => pickHit(hit)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        {hit.code ? (
                          <span className="mr-2 rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-semibold">
                            {hit.code}
                          </span>
                        ) : null}
                        {hit.name}
                      </span>
                      {hit.memberCount ? (
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {hit.memberCount}
                        </span>
                      ) : null}
                    </button>
                    {!hit.enrolled ? (
                      <div className="flex items-center border-l border-border px-1.5">
                        <SaveBookmarkButton
                          courseId={hit.id}
                          initialSaved={hit.saved}
                          variant="chip"
                        />
                      </div>
                    ) : null}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => {
                    setManualOpen(true);
                    const upper = query.trim().toUpperCase();
                    const isCodeLike = /^[A-Z0-9.\-_/]+$/.test(upper) && upper.length <= 20;
                    if (isCodeLike) {
                      setValue("code", upper, { shouldValidate: true });
                      setValue("name", "");
                    } else {
                      setValue("name", query.trim(), { shouldValidate: true });
                      setValue("code", "");
                    }
                  }}
                  className="flex w-full items-center justify-between gap-2 border-t border-border bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  <span>+ Add "{query.trim()}" as new course</span>
                </button>
              </div>
            ) : null}

            {manualOpen ? (
              <div className="space-y-2 rounded-2xl border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-muted-foreground">New course</p>
                <div className="grid grid-cols-[minmax(0,6rem)_1fr] gap-2">
                  <Input {...register("code")} placeholder="IN2064" autoCapitalize="characters" />
                  <Input {...register("name")} placeholder="Machine Learning" />
                </div>
                <FormMessage message={errors.code?.message ?? errors.name?.message} />
                <div className="flex gap-2">
                  <Button type="button" size="sm" onClick={commitManual}>
                    Use this course
                  </Button>
                  <button
                    type="button"
                    onClick={() => setManualOpen(false)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {mode === "picked" ? (
        <>
          {variants.length > 0 ? (
            <div className="space-y-2 rounded-2xl border border-border bg-muted/30 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                {`${variants.length} schedule${variants.length === 1 ? "" : "s"} used by other students`}
              </p>
              <div className="space-y-1.5">
                {variants.map((variant) => {
                  const isUsed = variant.fingerprint === usedVariantFingerprint;
                  return (
                    <button
                      key={variant.fingerprint}
                      type="button"
                      onClick={() => applyVariant(variant)}
                      className={cn(
                        "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition",
                        isUsed
                          ? "border-primary/60 bg-primary/10 text-foreground"
                          : "border-border bg-background hover:bg-muted",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="mr-2 inline-block rounded-full bg-foreground/10 px-2 py-0.5 text-[10px] font-semibold">
                          {variant.userCount}×
                        </span>
                        {variant.sessions
                          .map(
                            (s) =>
                              `${s.weekday.slice(0, 1)}${s.weekday.slice(1).toLowerCase()} ${s.start}–${s.end}`,
                          )
                          .join(" · ")}
                      </span>
                      <span className="shrink-0 text-[11px] font-medium">
                        {isUsed ? "Using" : "Use"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium">Room (default)</label>
            <Input {...register("location")} placeholder="MI HS 1" />
          </div>

          <div className="space-y-3 rounded-3xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">Weekly times for Home</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  These repeat on your Home week view after you enroll — only your personal schedule.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  append({ weekday: "MON" as Weekday, start: "10:00", end: "12:00", location: "" });
                  setUsedVariantFingerprint(null);
                }}
                className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted"
              >
                + Add
              </button>
            </div>

            {fields.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Add at least one weekly slot so this course appears on your Home schedule.
              </p>
            ) : null}

            <div className="space-y-2">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="grid grid-cols-[minmax(0,5rem)_minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-2"
                >
                  <select
                    {...register(`sessions.${index}.weekday` as const)}
                    onChange={(e) => {
                      setValue(`sessions.${index}.weekday`, e.target.value as Weekday, {
                        shouldValidate: true,
                      });
                      setUsedVariantFingerprint(null);
                    }}
                    className="h-9 rounded-md border border-border bg-background px-2 text-sm"
                  >
                    {WEEKDAY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <Input
                    type="time"
                    step={300}
                    {...register(`sessions.${index}.start` as const, {
                      onChange: () => setUsedVariantFingerprint(null),
                    })}
                  />
                  <span className="text-xs text-muted-foreground">–</span>
                  <Input
                    type="time"
                    step={300}
                    {...register(`sessions.${index}.end` as const, {
                      onChange: () => setUsedVariantFingerprint(null),
                    })}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      remove(index);
                      setUsedVariantFingerprint(null);
                    }}
                    aria-label="Remove session"
                    className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {errors.sessions ? (
              <FormMessage
                message={
                  Array.isArray(errors.sessions)
                    ? (errors.sessions.find(Boolean)?.start?.message ??
                        errors.sessions.find(Boolean)?.end?.message ??
                        "Check session times.")
                    : (errors.sessions as { message?: string })?.message
                }
              />
            ) : null}

            {fields.length > 0 ? (
              <Checkbox
                checked={syncHomeCalendarEvents}
                onChange={setSyncHomeCalendarEvents}
                label="Also sync these times to Home calendar events (draggable; hides duplicate course strip)"
              />
            ) : null}
          </div>

          <div className="space-y-3 rounded-3xl border border-border bg-card p-4">
            <p className="text-sm font-medium">Open to</p>
            <div className="space-y-3">
              {intentions.map((intention) => (
                <Checkbox
                  key={intention}
                  checked={selectedIntentions.includes(intention)}
                  onChange={() => toggleIntention(intention)}
                  label={intention.toLowerCase().replaceAll("_", " ")}
                />
              ))}
            </div>
          </div>
        </>
      ) : null}

      <FormMessage message={serverError || (errors.intentions?.message as string | undefined)} />

      <Button className="w-full" disabled={isSubmitting || !canSubmit} type="submit">
        {isSubmitting ? "Adding..." : "Add course"}
      </Button>
    </form>
  );
}
