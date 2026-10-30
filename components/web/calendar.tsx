"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { addDays, addMonths, startOfMonth, startOfWeek } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  MapPin,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import type {
  HomeSchedulePayload,
  HomeStudyEntry,
} from "@/lib/home/home-schedule-dto";
import type {
  ParsedScheduleDraft,
  ParseNaturalScheduleResult,
} from "@/lib/calendar/natural-language-schema";
import {
  clock,
  dateKey,
  messageOf,
  refreshWebData,
  useWebResource,
  webRequest,
} from "@/lib/web/client";
import { Empty, ErrorNotice, Field, Loading, Modal, PageHeading } from "./ui";
const zone = "Europe/Berlin";
const dayID = (date: Date | string) =>
  formatInTimeZone(date, zone, "yyyy-MM-dd");
const zonedInput = (date: Date | string) =>
  formatInTimeZone(date, zone, "yyyy-MM-dd'T'HH:mm");
const repeatNames: Record<string, string> = {
  NONE: "不重复",
  DAILY: "每天",
  WEEKLY: "每周",
  BIWEEKLY: "每两周",
  MONTHLY: "每月",
  YEARLY: "每年",
};
type DisplayEvent = HomeStudyEntry & {
  isClass?: boolean;
};
function EventForm({
  event,
  day,
  payload,
  close,
  saved,
}: {
  event?: DisplayEvent;
  day: string;
  payload: HomeSchedulePayload;
  close: () => void;
  saved: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [scope, setScope] = useState("this"),
    [repeat, setRepeat] = useState(event?.repeatRule ?? "NONE"),
    [deleting, setDeleting] = useState(false);
  const [companions, setCompanions] = useState<string[]>(
    (event?.eventParticipants ?? []).flatMap((row) =>
      row.userId ? [row.userId] : [],
    ),
  );
  const planLink = event?.timePollToken
    ? `/web/plans/${event.timePollToken}`
    : event?.planConnectionId
      ? `/web/messages?chat=${event.planConnectionId}`
      : null;
  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(formEvent.currentTarget);
    try {
      await webRequest(
        `/api/v1/calendar/events${event ? `/${encodeURIComponent(event.id)}?scope=${scope}` : ""}`,
        event ? "PATCH" : "POST",
        {
          title: form.get("title"),
          location: form.get("location"),
          note: form.get("note"),
          startAt: fromZonedTime(String(form.get("start")), zone).toISOString(),
          endAt: fromZonedTime(String(form.get("end")), zone).toISOString(),
          repeat,
          repeatUntil: form.get("until")
            ? fromZonedTime(`${form.get("until")}T23:59:59`, zone).toISOString()
            : "",
          categoryId: form.get("category") || null,
          withUserIds: companions,
        },
      );
      refreshWebData();
      saved();
      close();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={event ? event.title : "给生活，留一点时间。"} onClose={close}>
      {planLink ? (
        <>
          <p className="sw-muted">
            这是已确认计划同步的安排，请在原计划中查看和修改。
          </p>
          <Link
            href={planLink as "/web/plans"}
            className="sw-button sw-primary"
            style={{ marginTop: 20 }}
          >
            打开对应计划
            <ArrowRight size={15} />
          </Link>
        </>
      ) : event?.isClass ? (
        <p className="sw-muted">
          这是课程安排，请在「我 → 我的课程」中管理课表。
        </p>
      ) : (
        <form onSubmit={(formEvent) => void submit(formEvent)}>
          <Field label="日程名称">
            <input
              name="title"
              defaultValue={event?.title ?? ""}
              maxLength={120}
              required
              autoFocus
              placeholder="例如：和朋友去图书馆"
            />
          </Field>
          <div className="sw-form-row">
            <Field label="开始 · Berlin">
              <input
                name="start"
                type="datetime-local"
                defaultValue={
                  event ? zonedInput(event.startISO) : `${day}T10:00`
                }
                required
              />
            </Field>
            <Field label="结束 · Berlin">
              <input
                name="end"
                type="datetime-local"
                defaultValue={event ? zonedInput(event.endISO) : `${day}T11:00`}
                required
              />
            </Field>
          </div>
          <Field label="地点">
            <input
              name="location"
              defaultValue={event?.location ?? ""}
              maxLength={120}
              placeholder="在哪里见？"
            />
          </Field>
          <div className="sw-form-row">
            <Field label="日历分类">
              <select name="category" defaultValue={event?.categoryId ?? ""}>
                <option value="">默认日历</option>
                {payload.initialCalendarCategories.map((category) => (
                  <option value={category.id} key={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="重复">
              <select
                value={repeat}
                onChange={(formEvent) =>
                  setRepeat(formEvent.target.value as typeof repeat)
                }
              >
                {Object.entries(repeatNames).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {repeat !== "NONE" ? (
            <Field label="重复截止日期（留空则持续）">
              <input
                type="date"
                name="until"
                defaultValue={
                  event?.repeatUntilISO ? dayID(event.repeatUntilISO) : ""
                }
              />
            </Field>
          ) : null}
          {event && event.repeatRule !== "NONE" ? (
            <Field label="此次修改范围">
              <select
                value={scope}
                onChange={(formEvent) => setScope(formEvent.target.value)}
              >
                <option value="this">仅这一次</option>
                <option value="future">这次及之后</option>
                <option value="all">整个系列</option>
              </select>
            </Field>
          ) : null}
          <Field label="备注">
            <textarea
              name="note"
              defaultValue={event?.note ?? ""}
              maxLength={500}
            />
          </Field>
          {payload.companionOptions.length ? (
            <details>
              <summary className="sw-muted">
                一起的人（个人日历关联，不会代替对方接受邀请）
              </summary>
              {payload.companionOptions.map((person) => (
                <label className="sw-check" key={person.id}>
                  <input
                    type="checkbox"
                    checked={companions.includes(person.id)}
                    onChange={(formEvent) =>
                      setCompanions((ids) =>
                        formEvent.target.checked
                          ? [...ids, person.id]
                          : ids.filter((id) => id !== person.id),
                      )
                    }
                  />
                  {person.name}
                </label>
              ))}
            </details>
          ) : null}
          <ErrorNotice message={error} />
          {deleting ? (
            <div className="sw-error">
              <span>
                确定删除
                {scope === "all"
                  ? "整个重复系列"
                  : scope === "future"
                    ? "这次及之后的日程"
                    : "这次日程"}
                ？
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await webRequest(
                      `/api/v1/calendar/events/${encodeURIComponent(event!.id)}?scope=${scope}`,
                      "DELETE",
                    );
                    saved();
                    refreshWebData();
                    close();
                  } catch (cause) {
                    setError(messageOf(cause));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                确认删除
              </button>
            </div>
          ) : null}
          <div className="sw-form-actions">
            {event ? (
              <button
                className="sw-button sw-danger"
                type="button"
                onClick={() => setDeleting(true)}
              >
                <X size={14} />
                删除
              </button>
            ) : null}
            <button className="sw-button" type="button" onClick={close}>
              取消
            </button>
            <button className="sw-button sw-primary" disabled={busy}>
              {busy ? "保存中…" : "保存日程"}
              <Check size={15} />
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
function SmartCalendar({
  close,
  saved,
}: {
  close: () => void;
  saved: () => void;
}) {
  const [result, setResult] = useState<ParsedScheduleDraft[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function parse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const data = await webRequest<ParseNaturalScheduleResult>(
        "/api/v1/calendar/parse-natural",
        "POST",
        { text: form.get("text"), locale: "zh-CN" },
      );
      setResult(data.events);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="说一句，记进日历。" onClose={close}>
      <form onSubmit={(event) => void parse(event)}>
        <Field label="告诉我你的安排">
          <textarea
            name="text"
            required
            placeholder="例如：明天下午三点在图书馆复习两小时"
            maxLength={5000}
          />
        </Field>
        <button className="sw-button sw-soft" disabled={busy}>
          <Sparkles size={15} />
          {busy ? "整理中…" : "整理为日程"}
        </button>
      </form>
      <ErrorNotice message={error} />
      {result ? (
        <>
          <div className="sw-line" />
          <p className="sw-muted">
            确认下面的内容后再保存。时间按 Europe/Berlin 显示。
          </p>
          {result.map((event, index) => (
            <div key={index} className="sw-parsed-event">
              <Field label="日程名称">
                <input
                  value={event.title}
                  onChange={(change) =>
                    setResult((rows) =>
                      rows!.map((row, i) =>
                        i === index
                          ? { ...row, title: change.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </Field>
              <div className="sw-form-row">
                <Field label="开始">
                  <input
                    type="datetime-local"
                    value={zonedInput(event.startAt)}
                    onChange={(change) => {
                      if (change.target.value)
                        setResult((rows) =>
                          rows!.map((row, i) =>
                            i === index
                              ? {
                                  ...row,
                                  startAt: fromZonedTime(
                                    change.target.value,
                                    zone,
                                  ).toISOString(),
                                }
                              : row,
                          ),
                        );
                    }}
                  />
                </Field>
                <Field label="结束">
                  <input
                    type="datetime-local"
                    value={zonedInput(event.endAt)}
                    onChange={(change) => {
                      if (change.target.value)
                        setResult((rows) =>
                          rows!.map((row, i) =>
                            i === index
                              ? {
                                  ...row,
                                  endAt: fromZonedTime(
                                    change.target.value,
                                    zone,
                                  ).toISOString(),
                                }
                              : row,
                          ),
                        );
                    }}
                  />
                </Field>
              </div>
              <p className="sw-muted">
                {event.location || "无地点"} · {repeatNames[event.repeat]}
              </p>
              <button
                className="sw-text-button"
                onClick={() =>
                  setResult((rows) => rows!.filter((_, i) => i !== index))
                }
              >
                移除此项
              </button>
            </div>
          ))}
          {!result.length ? (
            <p className="sw-muted">
              没有可保存的日程，请补充具体安排后重新整理。
            </p>
          ) : null}
          <div className="sw-form-actions">
            <button
              className="sw-button sw-primary"
              disabled={busy || !result.length}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await webRequest("/api/v1/calendar/events/batch", "POST", {
                    events: result.map((event) => ({
                      title: event.title,
                      location: event.location,
                      note: event.note,
                      startAt: event.startAt,
                      endAt: event.endAt,
                      repeat: event.repeat,
                      repeatUntil: event.repeatUntil,
                      categoryId: event.categoryId,
                    })),
                  });
                  saved();
                  refreshWebData();
                  close();
                } catch (cause) {
                  setError(messageOf(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              确认保存 {result.length} 个日程
              <Check size={15} />
            </button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
function CalendarSettings({
  payload,
  close,
  saved,
}: {
  payload: HomeSchedulePayload;
  close: () => void;
  saved: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const file = useRef<HTMLInputElement>(null);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="我的日历" onClose={close}>
      <div className="sw-category-list">
        {payload.initialCalendarCategories.map((category) => (
          <div key={category.id} className="sw-row">
            <span
              className="sw-color-dot"
              style={{ background: category.color }}
            />
            <span className="sw-grow">
              {category.name}
              {category.icsSubscriptionUrl ? (
                <small className="sw-muted"> · 已订阅</small>
              ) : null}
            </span>
          </div>
        ))}
      </div>
      <details>
        <summary className="sw-text-button">
          <Plus size={13} />
          添加日历分类或订阅
        </summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void run(async () => {
              await webRequest("/api/v1/calendar/categories", "POST", {
                name: form.get("name"),
                color: form.get("color"),
                ...(form.get("url")
                  ? { icsSubscriptionUrl: form.get("url") }
                  : {}),
              });
              setNotice("日历已添加。");
              saved();
              refreshWebData();
            });
          }}
        >
          <Field label="日历名称">
            <input name="name" required maxLength={40} />
          </Field>
          <Field label="颜色">
            <input name="color" type="color" defaultValue="#8b9e75" />
          </Field>
          <Field label="ICS 订阅地址（选填）">
            <input name="url" type="url" placeholder="https://…" />
          </Field>
          <button className="sw-button sw-soft" disabled={busy}>
            添加日历
          </button>
        </form>
      </details>
      <div className="sw-line" />
      <div className="sw-row">
        <button
          className="sw-button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const data = await webRequest<{
                filename: string;
                ics: string;
              }>(`/api/v1/calendar/export?year=${new Date().getFullYear()}`);
              const url = URL.createObjectURL(
                new Blob([data.ics], { type: "text/calendar;charset=utf-8" }),
              );
              const anchor = document.createElement("a");
              anchor.href = url;
              anchor.download = data.filename;
              anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setNotice("日历已导出。");
            })
          }
        >
          <Download size={15} />
          导出今年日历
        </button>
        <button
          className="sw-button"
          disabled={busy}
          onClick={() => file.current?.click()}
        >
          <Upload size={15} />
          导入 ICS 文件
        </button>
        <input
          ref={file}
          hidden
          type="file"
          accept=".ics,text/calendar"
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (selected)
              void run(async () => {
                const ics = await selected.text();
                await webRequest("/api/v1/calendar/import", "POST", { ics });
                saved();
                refreshWebData();
                setNotice("日历已导入。");
              });
          }}
        />
      </div>
      <ErrorNotice message={error} />
      {notice ? (
        <p className="sw-save-status" role="status">
          {notice}
        </p>
      ) : null}
    </Modal>
  );
}
export function CalendarPage() {
  const [anchor, setAnchor] = useState(() => new Date()),
    [selectedDay, setSelectedDay] = useState(() => dayID(new Date())),
    [view, setView] = useState("month"),
    [query, setQuery] = useState(""),
    [hidden, setHidden] = useState<string[]>([]),
    [editing, setEditing] = useState<DisplayEvent | true | null>(null),
    [smart, setSmart] = useState(false),
    [settings, setSettings] = useState(false);
  const windowStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }),
    windowEnd = addDays(windowStart, 42);
  const from = fromZonedTime(
      dateKey(windowStart) + "T00:00:00",
      zone,
    ).toISOString(),
    to = fromZonedTime(dateKey(windowEnd) + "T00:00:00", zone).toISOString();
  const schedule = useWebResource<HomeSchedulePayload>(
    `/api/v1/home/schedule?windowStart=${encodeURIComponent(from)}&windowEnd=${encodeURIComponent(to)}`,
  );
  const firstGridDay = dateKey(windowStart);
  const days = useMemo(
    () =>
      Array.from({ length: 42 }, (_, index) =>
        addDays(new Date(firstGridDay + "T12:00:00"), index),
      ),
    [firstGridDay],
  );
  const events = useMemo(() => {
    const data = schedule.data;
    if (!data) return [];
    const classes: DisplayEvent[] = days.flatMap((day) =>
      data.classBlocks
        .filter(
          (block) =>
            ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][day.getDay()] ===
            block.weekday,
        )
        .map((block) => {
          const at = (minute: number) =>
            fromZonedTime(
              `${dateKey(day)}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00`,
              zone,
            ).toISOString();
          return {
            id: `class:${block.courseId}:${dateKey(day)}:${block.startMinute}`,
            title: block.courseName,
            location: block.location,
            startISO: at(block.startMinute),
            endISO: at(block.endMinute),
            repeatRule: "NONE" as const,
            repeatUntilISO: null,
            categoryId: block.categoryId,
            categoryColor: block.categoryColor ?? "#9aafd2",
            categoryName: block.categoryName ?? "课程",
            eventParticipants: [],
            note: null,
            withLabel: null,
            isClass: true,
          };
        }),
    );
    return [...data.studyEntries, ...classes]
      .filter(
        (event) =>
          !hidden.includes(event.categoryId ?? "default") &&
          (!query ||
            [event.title, event.location, event.note].some((value) =>
              value?.toLowerCase().includes(query.toLowerCase()),
            )),
      )
      .sort((a, b) => a.startISO.localeCompare(b.startISO));
  }, [schedule.data, days, hidden, query]);
  const dayEvents = (key: string) =>
    events.filter(
      (event) =>
        dayID(event.startISO) <= key &&
        dayID(new Date(Date.parse(event.endISO) - 1)) >= key,
    );
  const weekDays = Array.from({ length: 7 }, (_, index) =>
    addDays(startOfWeek(anchor, { weekStartsOn: 1 }), index),
  );
  const weekScroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (view === "week" && weekScroll.current)
      weekScroll.current.scrollTop = 8 * 48;
  }, [view]);
  function selectDate(day: Date) {
    setAnchor(day);
    setSelectedDay(dateKey(day));
  }
  function navigate(amount: number) {
    selectDate(
      view === "month"
        ? addMonths(anchor, amount)
        : addDays(anchor, amount * 7),
    );
  }
  return (
    <>
      <PageHeading
        eyebrow="MAKE ROOM FOR LIFE"
        title="有安排，也有期待。"
        description="课程、个人日程和确认的计划，都在同一本日历。"
      >
        <button className="sw-button" onClick={() => setSmart(true)}>
          <Sparkles size={15} />
          智能输入
        </button>
        <button
          className="sw-button sw-primary"
          onClick={() => setEditing(true)}
        >
          <Plus size={16} />
          添加日程
        </button>
      </PageHeading>
      <div className="sw-calendar-layout">
        <section className="sw-calendar-main">
          <div className="sw-calendar-toolbar">
            <div className="sw-row">
              <h2>
                {anchor.getFullYear()} 年 {anchor.getMonth() + 1} 月
              </h2>
              <div className="sw-row" style={{ gap: 2 }}>
                <button
                  className="sw-icon-button"
                  aria-label="上一段日期"
                  onClick={() => navigate(-1)}
                >
                  <ChevronLeft size={17} />
                </button>
                <button
                  className="sw-icon-button"
                  aria-label="下一段日期"
                  onClick={() => navigate(1)}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
              <button
                className="sw-button sw-small"
                onClick={() => {
                  setAnchor(new Date());
                  setSelectedDay(dayID(new Date()));
                }}
              >
                今天
              </button>
            </div>
            <div className="sw-view-picker">
              {[
                ["month", "月"],
                ["week", "周"],
                ["agenda", "日程"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={view === key ? "is-active" : ""}
                  onClick={() => setView(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <ErrorNotice message={schedule.error} retry={schedule.reload} />
          {schedule.loading ? (
            <Loading />
          ) : view === "month" ? (
            <>
              <div className="sw-month-weekdays">
                {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                  <span key={day}>周{day}</span>
                ))}
              </div>
              <div className="sw-month-grid">
                {days.map((day) => {
                  const key = dateKey(day);
                  return (
                    <div
                      className={`sw-month-day ${day.getMonth() !== anchor.getMonth() ? "is-outside" : ""} ${key === selectedDay ? "is-selected" : ""}`}
                      key={key}
                    >
                      <button
                        className={`sw-day-number ${key === dayID(new Date()) ? "is-today" : ""}`}
                        onClick={() => selectDate(day)}
                        onDoubleClick={() => {
                          setSelectedDay(key);
                          setEditing(true);
                        }}
                        aria-label={`${key}，${dayEvents(key).length} 项安排`}
                      >
                        {day.getDate()}
                      </button>
                      <div className="sw-day-events">
                        {dayEvents(key)
                          .slice(0, 3)
                          .map((event) => (
                            <button
                              key={event.id}
                              onClick={() => setEditing(event)}
                              style={
                                {
                                  "--event-color":
                                    event.categoryColor ?? "#8ba06f",
                                } as React.CSSProperties
                              }
                            >
                              <span>{clock(event.startISO, zone)}</span>
                              <strong>{event.title}</strong>
                            </button>
                          ))}
                        {dayEvents(key).length > 3 ? (
                          <button
                            className="sw-more-events"
                            onClick={() => selectDate(day)}
                          >
                            还有 {dayEvents(key).length - 3} 项
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : view === "week" ? (
            <div className="sw-week-scroll" ref={weekScroll}>
              <div className="sw-week-calendar">
                <div className="sw-week-head">
                  <span />
                  {weekDays.map((day) => (
                    <button
                      key={dateKey(day)}
                      className={
                        dateKey(day) === dayID(new Date()) ? "is-today" : ""
                      }
                      onClick={() => selectDate(day)}
                    >
                      <small>
                        {
                          [
                            "周日",
                            "周一",
                            "周二",
                            "周三",
                            "周四",
                            "周五",
                            "周六",
                          ][day.getDay()]
                        }
                      </small>
                      <strong>{day.getDate()}</strong>
                    </button>
                  ))}
                </div>
                <div className="sw-week-body">
                  <div className="sw-week-hours">
                    {Array.from({ length: 24 }, (_, hour) => (
                      <span key={hour}>{String(hour).padStart(2, "0")}:00</span>
                    ))}
                  </div>
                  {weekDays.map((day) => (
                    <div className="sw-week-column" key={dateKey(day)}>
                      {dayEvents(dateKey(day)).map((event) => {
                        const start =
                          dayID(event.startISO) < dateKey(day)
                            ? 0
                            : Number(
                                formatInTimeZone(event.startISO, zone, "H"),
                              ) *
                                60 +
                              Number(
                                formatInTimeZone(event.startISO, zone, "m"),
                              );
                        const end =
                          dayID(event.endISO) > dateKey(day)
                            ? 1440
                            : Number(
                                formatInTimeZone(event.endISO, zone, "H"),
                              ) *
                                60 +
                              Number(formatInTimeZone(event.endISO, zone, "m"));
                        return (
                          <button
                            key={event.id}
                            className="sw-week-event"
                            style={
                              {
                                top: start * 0.8,
                                height: Math.max(27, (end - start) * 0.8),
                                "--event-color":
                                  event.categoryColor ?? "#91a479",
                              } as React.CSSProperties
                            }
                            onClick={() => setEditing(event)}
                          >
                            <strong>{event.title}</strong>
                            <small>
                              {clock(event.startISO, zone)}–
                              {clock(event.endISO, zone)}
                            </small>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="sw-agenda">
              {events.length ? (
                events.map((event) => (
                  <button
                    key={event.id}
                    className="sw-agenda-row"
                    onClick={() => setEditing(event)}
                  >
                    <span className="sw-agenda-date">
                      <strong>
                        {formatInTimeZone(event.startISO, zone, "d")}
                      </strong>
                      {formatInTimeZone(event.startISO, zone, "MM 月")}
                    </span>
                    <span
                      className="sw-color-dot"
                      style={{ background: event.categoryColor ?? "#93a67c" }}
                    />
                    <div className="sw-grow">
                      <strong>{event.title}</strong>
                      <p>
                        {clock(event.startISO, zone)}–
                        {clock(event.endISO, zone)}
                        {event.location ? ` · ${event.location}` : ""}
                      </p>
                    </div>
                    <ArrowRight size={15} />
                  </button>
                ))
              ) : (
                <Empty icon={CalendarDays} title="给空白的日子，一点新的可能。">
                  这个时间范围还没有安排。
                </Empty>
              )}
            </div>
          )}
        </section>
        <aside className="sw-calendar-aside">
          <label className="sw-calendar-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索此范围的日程"
              aria-label="搜索日程"
            />
          </label>
          <div className="sw-panel">
            <div className="sw-panel-heading">
              <h2>我的日历</h2>
              <button
                className="sw-icon-button"
                aria-label="日历设置"
                onClick={() => setSettings(true)}
              >
                <Settings2 size={16} />
              </button>
            </div>
            {[
              { id: "default", name: "默认日历", color: "#93a67c" },
              ...(schedule.data?.initialCalendarCategories ?? []),
            ].map((category) => (
              <label className="sw-calendar-category" key={category.id}>
                <input
                  type="checkbox"
                  checked={!hidden.includes(category.id)}
                  onChange={(event) =>
                    setHidden((ids) =>
                      event.target.checked
                        ? ids.filter((id) => id !== category.id)
                        : [...ids, category.id],
                    )
                  }
                  style={{ accentColor: category.color }}
                />
                <span>{category.name}</span>
                <i style={{ background: category.color }} />
              </label>
            ))}
            <p className="sw-muted" style={{ marginTop: 15 }}>
              显示时区：Europe/Berlin
            </p>
          </div>
          <div className="sw-panel">
            <div className="sw-panel-heading">
              <h2>
                {Number(selectedDay.slice(5, 7))} 月{" "}
                {Number(selectedDay.slice(8))} 日
              </h2>
              <button
                className="sw-icon-button"
                aria-label="在所选日期添加日程"
                onClick={() => setEditing(true)}
              >
                <Plus size={17} />
              </button>
            </div>
            {dayEvents(selectedDay).length ? (
              dayEvents(selectedDay).map((event) => (
                <button
                  className="sw-day-agenda"
                  key={event.id}
                  onClick={() => setEditing(event)}
                >
                  <span
                    className="sw-color-dot"
                    style={{ background: event.categoryColor ?? "#93a67c" }}
                  />
                  <div>
                    <strong>{event.title}</strong>
                    <p>
                      {clock(event.startISO, zone)}–{clock(event.endISO, zone)}
                    </p>
                    {event.location ? (
                      <small>
                        <MapPin size={10} />
                        {event.location}
                      </small>
                    ) : null}
                  </div>
                </button>
              ))
            ) : (
              <p className="sw-muted">今天没有安排。也许，可以约个人见面。</p>
            )}
          </div>
          <Link href="/web/plans" className="sw-aside-note">
            <CalendarDays size={28} strokeWidth={1.3} />
            <h3>
              空闲的时间，
              <br />
              也可以是相遇的时间。
            </h3>
            <p>发起一个计划，看看朋友们什么时候有空。</p>
            <span className="sw-text-button">
              去安排一次见面
              <ArrowRight size={13} />
            </span>
          </Link>
        </aside>
      </div>
      {editing && schedule.data ? (
        <EventForm
          event={editing === true ? undefined : editing}
          day={selectedDay}
          payload={schedule.data}
          close={() => setEditing(null)}
          saved={schedule.reload}
        />
      ) : null}
      {smart ? (
        <SmartCalendar close={() => setSmart(false)} saved={schedule.reload} />
      ) : null}
      {settings && schedule.data ? (
        <CalendarSettings
          payload={schedule.data}
          close={() => setSettings(false)}
          saved={schedule.reload}
        />
      ) : null}
    </>
  );
}
