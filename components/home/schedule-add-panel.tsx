"use client";

import { Check, Loader2, Plus, X } from "lucide-react";
import { addMinutes, addMonths, format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  EventDateTimeRow,
  InlineDateCalendar,
  TimeWheelPicker,
  buildHourChoices,
  buildMinuteChoices,
  formatDisplayDate,
  timePart,
  withDate,
  withTime,
} from "@/components/schedule/event-datetime-pickers";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Input } from "@/components/ui/input";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import {
  clearCalendarClipboardSession,
  readCalendarClipboardSession,
  type CalendarClipboardSessionV1,
} from "@/lib/calendar/calendar-clipboard";
import { isValidCategoryHex } from "@/lib/calendar/category-visual";
import type { AppMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type RepeatRule = "NONE" | "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "YEARLY";

type CompanionOption = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type CalendarCategoryOption = {
  id: string;
  name: string;
  color: string;
  presetKey: string | null;
};

function nextWholeHour(date: Date) {
  const now = new Date();
  const next = new Date(date);
  next.setHours(now.getHours(), 0, 0, 0);
  if (now.getMinutes() > 0 || now.getSeconds() > 0 || now.getMilliseconds() > 0) {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  }
  return next;
}

function defaultStartDateTime(date: Date) {
  return format(nextWholeHour(date), "yyyy-MM-dd'T'HH:mm");
}

function defaultEndDateTime(date: Date) {
  return format(addMinutes(nextWholeHour(date), 60), "yyyy-MM-dd'T'HH:mm");
}

function defaultDateOnly(date: Date) {
  return format(date, "yyyy-MM-dd");
}

function truncateClipboardPreview(text: string, maxChars: number) {
  const single = text.replace(/\s+/g, " ").trim();
  if (single.length <= maxChars) return single;
  return `${single.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function ScheduleAddPanel({
  selectedDate,
  open,
  onClose,
  onSaved,
  initialMode = "course",
  mode = "create",
  entryId,
  initialTitle,
  initialLocation,
  initialNote,
  initialEventStart,
  initialEventEnd,
  initialRepeat = "NONE",
  initialRepeatUntil,
  initialWithUserIds,
  initialOpenCompanionList = false,
  initialCategoryId,
  calendarCategories = [],
  companionOptions,
}: {
  selectedDate: Date;
  open: boolean;
  onClose: () => void;
  /** When set, successful save calls this instead of `onClose` (parent typically refreshes there). */
  onSaved?: () => void;
  initialMode?: "course" | "event";
  mode?: "create" | "edit";
  entryId?: string;
  initialTitle?: string;
  initialLocation?: string;
  initialNote?: string;
  initialEventStart?: string;
  initialEventEnd?: string;
  initialRepeat?: RepeatRule;
  initialRepeatUntil?: string;
  initialWithUserIds?: string[];
  initialOpenCompanionList?: boolean;
  /** When `undefined`, new events default to the "Study" preset (or first list). When `null`, no category. */
  initialCategoryId?: string | null;
  calendarCategories?: CalendarCategoryOption[];
  companionOptions: CompanionOption[];
}) {
  const router = useRouter();
  const { messages } = useLocaleContext();
  const sch = messages.schedule;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [note, setNote] = useState("");
  const [startAt, setStartAt] = useState(initialEventStart ?? defaultStartDateTime(selectedDate));
  const [endAt, setEndAt] = useState(initialEventEnd ?? defaultEndDateTime(selectedDate));

  const [activeTimePicker, setActiveTimePicker] = useState<"start" | "end" | null>(null);
  const [activeDateDialog, setActiveDateDialog] = useState<"start" | "end" | null>(null);
  const [dateDialogMonth, setDateDialogMonth] = useState<Date>(selectedDate);

  const [repeat, setRepeat] = useState<RepeatRule>("NONE");
  const [repeatUntil, setRepeatUntil] = useState(defaultDateOnly(selectedDate));
  const [showRepeatEditor, setShowRepeatEditor] = useState(false);

  const [withUserIds, setWithUserIds] = useState<string[]>([]);
  const [withDraft, setWithDraft] = useState("");
  const [showCompanionList, setShowCompanionList] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [clipboardSession, setClipboardSession] = useState<CalendarClipboardSessionV1 | null>(null);

  useEffect(() => {
    if (!open || mode !== "create") {
      setClipboardSession(null);
      return;
    }
    setClipboardSession(readCalendarClipboardSession());
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    void initialMode;
    setSaving(false);
    setError("");
    const isEdit = mode === "edit" && Boolean(entryId);
    setTitle(
      isEdit
        ? (initialTitle?.trim() ?? "")
        : initialTitle != null && initialTitle.trim() !== ""
          ? initialTitle.trim()
          : "",
    );
    setLocation(initialLocation ?? "");
    setNote(initialNote ?? "");
    setStartAt(initialEventStart ?? defaultStartDateTime(selectedDate));
    setEndAt(initialEventEnd ?? defaultEndDateTime(selectedDate));
    setActiveTimePicker(null);
    setActiveDateDialog(null);
    setDateDialogMonth(selectedDate);
    setRepeat(initialRepeat);
    setRepeatUntil(initialRepeatUntil ?? defaultDateOnly(selectedDate));
    setShowRepeatEditor(false);
    setWithUserIds(initialWithUserIds ?? []);
    setWithDraft("");
    setShowCompanionList(initialOpenCompanionList);
    const defaultCat =
      calendarCategories.find((c) => c.presetKey === "study")?.id ??
      calendarCategories[0]?.id ??
      null;
    setCategoryId(initialCategoryId !== undefined ? initialCategoryId : defaultCat);
  }, [
    open,
    selectedDate,
    initialEventStart,
    initialEventEnd,
    initialMode,
    mode,
    entryId,
    initialTitle,
    initialLocation,
    initialNote,
    initialRepeat,
    initialRepeatUntil,
    initialWithUserIds,
    initialOpenCompanionList,
    initialCategoryId,
    calendarCategories,
  ]);

  const canSave = useMemo(
    () =>
      Boolean(
        startAt &&
          endAt &&
          (mode === "edit" ? title.trim() : true),
      ),
    [endAt, mode, startAt, title],
  );
  const hourChoices = useMemo(() => buildHourChoices(), []);
  const minuteChoices = useMemo(() => buildMinuteChoices(), []);

  const selectedCompanions = useMemo(
    () => companionOptions.filter((person) => withUserIds.includes(person.id)),
    [companionOptions, withUserIds],
  );

  const filteredCompanions = useMemo(() => {
    const query = withDraft.trim().toLowerCase();
    if (!query) return [];
    return companionOptions.filter(
      (person) => !withUserIds.includes(person.id) && person.name.toLowerCase().includes(query),
    );
  }, [companionOptions, withDraft, withUserIds]);

  const repeatOptions = useMemo(
    (): Array<{ value: RepeatRule; label: string }> => [
      { value: "NONE", label: sch.repeatNone },
      { value: "DAILY", label: sch.repeatDaily },
      { value: "WEEKLY", label: sch.repeatWeekly },
      { value: "BIWEEKLY", label: sch.repeatBiweekly },
      { value: "MONTHLY", label: sch.repeatMonthly },
      { value: "YEARLY", label: sch.repeatYearly },
    ],
    [sch],
  );

  const repeatLabel = useMemo(() => {
    return repeatOptions.find((o) => o.value === repeat)?.label ?? sch.repeatNone;
  }, [repeat, repeatOptions, sch.repeatNone]);

  const clipboardBannerAccentHex = useMemo(() => {
    const raw = clipboardSession?.categoryColor?.trim();
    if (!raw || !isValidCategoryHex(raw)) return null;
    return raw;
  }, [clipboardSession]);

  async function submitEntry() {
    setSaving(true);
    setError("");
    const response = await fetch(mode === "edit" && entryId ? `/api/calendar/events/${entryId}` : "/api/calendar/events", {
      method: mode === "edit" && entryId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: mode === "create" ? title.trim() || sch.newEvent : title.trim(),
        location: location.trim(),
        note: note.trim(),
        startAt: new Date(startAt).toISOString(),
        endAt: new Date(endAt).toISOString(),
        withUserIds,
        repeat,
        repeatUntil: repeat === "NONE" ? "" : new Date(`${repeatUntil}T23:59`).toISOString(),
        categoryId,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);

    if (!response.ok) {
      setError(
        typeof payload.error === "string"
          ? payload.error
          : mode === "edit"
            ? sch.addPanelSaveErrorEdit
            : sch.addPanelSaveErrorCreate,
      );
      return;
    }

    if (onSaved) {
      onSaved();
    } else {
      onClose();
    }
    if (!onSaved) {
      router.refresh();
    }
  }

  function setTimeValue(target: "start" | "end", nextHour?: string, nextMinute?: string) {
    const current = target === "start" ? startAt : endAt;
    const [hour, minute] = timePart(current).split(":");
    const nextTime = `${nextHour ?? hour}:${nextMinute ?? minute}`;
    if (target === "start") {
      setStartAt(withTime(startAt, nextTime));
      return;
    }
    setEndAt(withTime(endAt, nextTime));
  }

  function openDatePicker(target: "start" | "end") {
    setActiveDateDialog((current) => {
      if (current === target) return null;
      const currentValue = target === "start" ? startAt : endAt;
      setDateDialogMonth(new Date(currentValue));
      setActiveTimePicker(null);
      setShowRepeatEditor(false);
      return target;
    });
  }

  function applyDateFromCalendar(date: Date) {
    const isoDate = format(date, "yyyy-MM-dd");
    if (activeDateDialog === "start") {
      setStartAt(withDate(startAt, isoDate));
    } else if (activeDateDialog === "end") {
      setEndAt(withDate(endAt, isoDate));
    }
  }

  function toggleWithUser(userId: string) {
    setWithUserIds((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );
  }

  function addWithUser(userId: string) {
    setWithUserIds((current) => (current.includes(userId) ? current : [...current, userId]));
    setWithDraft("");
    setShowCompanionList(false);
  }

  function removeWithUser(userId: string) {
    setWithUserIds((current) => current.filter((id) => id !== userId));
  }

  return (
    <AppPushLayer open={open} onClose={onClose} zClassName="z-50" panelClassName="w-[min(100vw,28rem)] border-0">
      <div className="flex h-full min-h-0 flex-col bg-card pt-[env(safe-area-inset-top)]">
        <section className="flex min-h-0 flex-1 flex-col overflow-hidden border-border/60">
            <div className="relative flex min-h-12 shrink-0 items-center justify-center border-b border-border/50 px-4 py-2.5">
              <button
                type="button"
                onClick={onClose}
                aria-label={sch.addPanelCloseAria}
                className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" strokeWidth={2.25} />
              </button>
              <h2 className="pointer-events-none text-center text-[15px] font-semibold text-foreground">
                {mode === "edit" ? sch.addPanelTitleEdit : sch.addPanelTitle}
              </h2>
              <button
                type="button"
                aria-label={mode === "edit" ? sch.addPanelSaveAria : sch.addPanelAddAria}
                title={mode === "edit" ? sch.addPanelSaveAria : sch.addPanelAddAria}
                onClick={() => void submitEntry()}
                disabled={!canSave || saving}
                className={cn(
                  "absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-primary/25 bg-primary text-primary-foreground shadow-sm transition",
                  "hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-40",
                )}
              >
                {saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.25} aria-hidden />
                ) : (
                  <Check className="h-5 w-5" strokeWidth={2.75} aria-hidden />
                )}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2.5">
              <div className="space-y-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={sch.newEvent}
          aria-label={sch.addPanelTitleAria}
          className="h-10 rounded-xl border-border/70 bg-muted/10 text-[15px] shadow-none placeholder:text-muted-foreground/80"
        />

        {clipboardSession ? (
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border border-border/60 bg-muted/[0.08] px-2.5 py-2",
              clipboardBannerAccentHex && "border-l-[3px]",
            )}
            style={
              clipboardBannerAccentHex
                ? { borderLeftColor: clipboardBannerAccentHex }
                : undefined
            }
            role="status"
            aria-label={sch.calendarClipboardBannerTitle}
          >
            <p className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
              {truncateClipboardPreview(clipboardSession.summaryText, 56)}
            </p>
            {clipboardSession.title?.trim() ? (
              <button
                type="button"
                onClick={() => setTitle(clipboardSession.title!.trim())}
                className="shrink-0 rounded-full border border-border/70 bg-background px-2.5 py-0.5 text-[11px] font-medium text-foreground"
              >
                {sch.calendarClipboardApplyTitle}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                clearCalendarClipboardSession();
                setClipboardSession(null);
              }}
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            >
              {sch.calendarClipboardDismiss}
            </button>
          </div>
        ) : null}

        <Input
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder={sch.addPanelLocationPlaceholder}
          className="h-10 rounded-xl border-border/70 bg-muted/10 text-[15px] shadow-none"
        />

        {calendarCategories.length > 0 ? (
          <CategoryPickerRow
            categories={calendarCategories}
            value={categoryId}
            onChange={setCategoryId}
            labels={sch}
          />
        ) : null}

        <div className="rounded-xl border border-border/70 bg-muted/[0.06] px-3 py-0.5 text-foreground">
          <EventDateTimeRow
            label={sch.addPanelStart}
            dateValue={formatDisplayDate(startAt)}
            timeValue={timePart(startAt)}
            hasDivider
            activeDate={activeDateDialog === "start"}
            activeTime={activeTimePicker === "start"}
            onPickDate={() => openDatePicker("start")}
            onPickTime={() => {
              setActiveDateDialog(null);
              setShowRepeatEditor(false);
              setActiveTimePicker((current) => (current === "start" ? null : "start"));
            }}
          />

          {activeDateDialog === "start" ? (
            <div className="pb-3 pt-2">
              <InlineDateCalendar
                month={dateDialogMonth}
                selectedDate={new Date(startAt)}
                onPrevMonth={() => setDateDialogMonth((current) => addMonths(current, -1))}
                onNextMonth={() => setDateDialogMonth((current) => addMonths(current, 1))}
                onSelectDate={applyDateFromCalendar}
              />
            </div>
          ) : null}

          <EventDateTimeRow
            label={sch.addPanelEnd}
            dateValue={formatDisplayDate(endAt)}
            timeValue={timePart(endAt)}
            activeDate={activeDateDialog === "end"}
            activeTime={activeTimePicker === "end"}
            onPickDate={() => openDatePicker("end")}
            onPickTime={() => {
              setActiveDateDialog(null);
              setShowRepeatEditor(false);
              setActiveTimePicker((current) => (current === "end" ? null : "end"));
            }}
          />

          {activeDateDialog === "end" ? (
            <div className="pt-2">
              <InlineDateCalendar
                month={dateDialogMonth}
                selectedDate={new Date(endAt)}
                onPrevMonth={() => setDateDialogMonth((current) => addMonths(current, -1))}
                onNextMonth={() => setDateDialogMonth((current) => addMonths(current, 1))}
                onSelectDate={applyDateFromCalendar}
              />
            </div>
          ) : null}

          {activeTimePicker && !activeDateDialog ? (
            <div className="pt-2">
              <TimeWheelPicker
                hour={timePart(activeTimePicker === "start" ? startAt : endAt).split(":")[0] ?? "00"}
                minute={timePart(activeTimePicker === "start" ? startAt : endAt).split(":")[1] ?? "00"}
                hourChoices={hourChoices}
                minuteChoices={minuteChoices}
                onChangeHour={(nextHour) => setTimeValue(activeTimePicker, nextHour)}
                onChangeMinute={(nextMinute) =>
                  setTimeValue(activeTimePicker, undefined, nextMinute)
                }
                danger={activeTimePicker === "end"}
              />
            </div>
          ) : null}
        </div>

        <div className="relative rounded-xl border border-border/70 bg-muted/[0.06] px-3 py-0.5">
          <button
            type="button"
            onClick={() => {
              setShowRepeatEditor((current) => !current);
              setActiveDateDialog(null);
              setActiveTimePicker(null);
            }}
            className="flex w-full items-center justify-between py-2.5 text-[14px] text-foreground"
          >
            <span className="font-medium text-foreground">{sch.addPanelRepeat}</span>
            <span className="truncate text-right text-muted-foreground">{repeatLabel}</span>
          </button>

          {repeat !== "NONE" ? (
            <div className="flex items-center justify-between border-t border-border/50 py-2.5 text-[13px]">
              <span className="font-medium text-foreground">{sch.addPanelRepeatUntil}</span>
              <Input
                type="date"
                value={repeatUntil}
                onChange={(e) => setRepeatUntil(e.target.value)}
                className="h-9 w-auto rounded-full border-border/70 bg-background px-3 text-[13px] text-foreground"
              />
            </div>
          ) : null}

          {showRepeatEditor ? (
            <div className="absolute right-0 top-full z-30 mt-2 w-[min(13.5rem,72vw)] overflow-hidden rounded-[1.75rem] border border-border/70 bg-popover p-2 text-popover-foreground shadow-xl">
              {repeatOptions.map((option, index) => {
                const active = option.value === repeat;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setRepeat(option.value);
                      setShowRepeatEditor(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] transition hover:bg-muted/70",
                      index !== repeatOptions.length - 1 && "border-b border-border/50",
                    )}
                  >
                    <span className="flex h-5 w-5 items-center justify-center">
                      {active ? <Check className="h-4 w-4 text-primary" strokeWidth={2.5} /> : null}
                    </span>
                    <span className="flex-1">{option.label}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="relative rounded-xl border border-border/70 bg-muted/[0.06] px-3 py-1">
          <div className="flex min-h-10 flex-wrap items-center gap-1.5 py-2 pr-11">
            {selectedCompanions.map((person) => (
              <button
                key={person.id}
                type="button"
                onClick={() => removeWithUser(person.id)}
                className="inline-flex items-center gap-1.5 rounded-full bg-muted px-1.5 py-1 text-[12px] font-medium text-foreground"
              >
                <PresetAvatar id={person.avatarUrl} size={20} className="shrink-0" />
                <span className="max-w-24 truncate">{person.name}</span>
                <X className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={2.25} />
              </button>
            ))}
            <input
              value={withDraft}
              onChange={(e) => {
                setWithDraft(e.target.value);
                setShowCompanionList(false);
                setShowRepeatEditor(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredCompanions[0]) {
                  e.preventDefault();
                  addWithUser(filteredCompanions[0].id);
                }
              }}
              placeholder={sch.addPanelWithPlaceholder}
              className="min-w-[6rem] flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowCompanionList((current) => !current)}
            aria-label={sch.addPanelChooseClassmatesAria}
            className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <Plus className="h-4 w-4" strokeWidth={2.25} />
          </button>

          {filteredCompanions.length > 0 ? (
            <div className="absolute left-0 right-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-border bg-popover shadow-lg">
              {filteredCompanions.slice(0, 6).map((person) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => addWithUser(person.id)}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[13px] text-foreground transition hover:bg-muted/40"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <PresetAvatar id={person.avatarUrl} size={28} className="shrink-0" />
                    <span className="truncate">{person.name}</span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">{sch.addPanelAddPerson}</span>
                </button>
              ))}
            </div>
          ) : null}

          {showCompanionList && companionOptions.length > 0 ? (
            <div className="max-h-44 space-y-2 overflow-y-auto rounded-2xl border border-border/60 bg-muted/20 p-2">
              {companionOptions.map((person) => {
                const active = withUserIds.includes(person.id);
                return (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => toggleWithUser(person.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-[12px] font-medium transition",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-foreground hover:bg-muted/40",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <PresetAvatar id={person.avatarUrl} size={30} className="shrink-0" />
                      <span className="truncate">{person.name}</span>
                    </span>
                    <span className="text-[11px] opacity-80">{active ? sch.addPanelAdded : sch.addPanelSelect}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-border/70 bg-muted/[0.05] px-3 py-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={sch.addPanelNotesPlaceholder}
            rows={2}
            className="min-h-[2.5rem] w-full resize-none bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>

        {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
              </div>
            </div>
        </section>
      </div>
    </AppPushLayer>
  );
}

function CategoryPickerRow({
  categories,
  value,
  onChange,
  labels,
}: {
  categories: CalendarCategoryOption[];
  value: string | null;
  onChange: (id: string | null) => void;
  labels: AppMessages["schedule"];
}) {
  const [open, setOpen] = useState(false);
  const selected = categories.find((c) => c.id === value);

  return (
    <div className="relative rounded-xl border border-border/70 bg-muted/[0.06] px-3 py-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-2.5 text-[14px]"
      >
        <span className="font-medium text-foreground">{labels.addPanelCalendar}</span>
        <span className="inline-flex items-center gap-2 text-right">
          {selected ? (
            <>
              <span
                className="h-3 w-3 shrink-0 rounded-full border border-black/10 shadow-sm dark:border-white/15"
                style={{ backgroundColor: selected.color }}
                aria-hidden
              />
              <span className="text-foreground">{selected.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{labels.addPanelNone}</span>
          )}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(14rem,72vw)] overflow-hidden rounded-[1.75rem] border border-border/70 bg-popover p-2 text-popover-foreground shadow-xl">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className={cn(
              "flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-[14px] transition hover:bg-muted/70",
              "border-b border-border/50",
            )}
          >
            <span className="flex h-5 w-5 items-center justify-center">
              {value === null ? <Check className="h-4 w-4 text-primary" strokeWidth={2.5} /> : null}
            </span>
            <span className="flex-1 text-muted-foreground">{labels.addPanelNone}</span>
          </button>
          {categories.map((c, i) => {
            const active = value === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-[14px] transition hover:bg-muted/70",
                  i !== categories.length - 1 && "border-b border-border/50",
                )}
              >
                <span className="flex h-5 w-5 items-center justify-center">
                  {active ? <Check className="h-4 w-4 text-primary" strokeWidth={2.5} /> : null}
                </span>
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-full border border-black/10 shadow-sm dark:border-white/15"
                  style={{ backgroundColor: c.color }}
                  aria-hidden
                />
                <span className="flex-1">{c.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
