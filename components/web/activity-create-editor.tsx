"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { fromZonedTime } from "date-fns-tz";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  MapPin,
  Plus,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { browserTimeZone, dateKey, messageOf, refreshWebData, webRequest } from "@/lib/web/client";
import { useWebUser } from "./web-shell";
import styles from "./activity-editor.module.css";

type Topic = "activity" | "location" | "time";
type OptionTopic = Exclude<Topic, "time">;
type Draft = {
  version: 1;
  title: string;
  timeZone: string;
  open: Record<Topic, boolean>;
  activityType: string;
  location: string;
  activityOptions: string[];
  locationOptions: string[];
  pendingActivity: string;
  pendingLocation: string;
  from: string;
  through: string;
  start: string;
  end: string;
  fixedDate: string;
  fixedStart: string;
  fixedEnd: string;
  limitAttendees: boolean;
  capacity: number;
};

const topics = [
  { key: "activity", name: "活动类型", shortName: "活动", icon: Sparkles },
  { key: "location", name: "地点", shortName: "地点", icon: MapPin },
  { key: "time", name: "时间", shortName: "时间", icon: CalendarDays },
] as const;
const stringFields = ["title", "timeZone", "activityType", "location", "pendingActivity", "pendingLocation", "from", "through", "start", "end", "fixedDate", "fixedStart", "fixedEnd"] as const;

function initialDraft(): Draft {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const later = new Date(tomorrow);
  later.setDate(later.getDate() + 6);
  return {
    version: 1,
    title: "",
    timeZone: browserTimeZone(),
    open: { activity: true, location: true, time: true },
    activityType: "",
    location: "",
    activityOptions: [],
    locationOptions: [],
    pendingActivity: "",
    pendingLocation: "",
    from: dateKey(tomorrow),
    through: dateKey(later),
    start: "09:00",
    end: "22:00",
    fixedDate: dateKey(tomorrow),
    fixedStart: "14:00",
    fixedEnd: "15:30",
    limitAttendees: false,
    capacity: 6,
  };
}

function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<Draft>;
  return draft.version === 1
    && stringFields.every((field) => typeof draft[field] === "string")
    && !!draft.open && topics.every(({ key }) => typeof draft.open?.[key] === "boolean")
    && [draft.activityOptions, draft.locationOptions].every((options) => Array.isArray(options) && options.length <= 20 && options.every((option) => typeof option === "string" && option.length <= 120))
    && typeof draft.limitAttendees === "boolean" && typeof draft.capacity === "number" && Number.isFinite(draft.capacity);
}

function optionValues(draft: Draft, key: OptionTopic) {
  const existing = key === "activity" ? draft.activityOptions : draft.locationOptions;
  const pending = (key === "activity" ? draft.pendingActivity : draft.pendingLocation).trim();
  return pending && !existing.some((value) => value.toLocaleLowerCase() === pending.toLocaleLowerCase()) ? [...existing, pending] : existing;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value + "T12:00:00Z")) && new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
}

function minutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(match[2]) % 15 !== 0) throw new Error("请选择以 15 分钟为单位的时间。");
  return Number(match[1]) * 60 + Number(match[2]);
}

function candidateDates(from: string, through: string) {
  if (!validDate(from) || !validDate(through)) throw new Error("请选择有效的候选日期。");
  if (through < from) throw new Error("结束日期不能早于开始日期。");
  const dates: string[] = [];
  for (const day = new Date(from + "T12:00:00Z"); day.toISOString().slice(0, 10) <= through; day.setUTCDate(day.getUTCDate() + 1)) {
    dates.push(day.toISOString().slice(0, 10));
    if (dates.length > 31) throw new Error("最多选择 31 个候选日期。");
  }
  return dates;
}

function dateLabel(value: string) {
  return validDate(value) ? new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(value + "T12:00:00Z")) : "选择日期";
}

export function ActivityCreateEditor({ onCreated, onCancel }: { onCreated: (token: string) => void; onCancel: () => void }) {
  const user = useWebUser();
  const key = `sideseat:web:activity-create:v1:${encodeURIComponent(user.id)}`;
  const id = useId();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [edited, setEdited] = useState(false);
  const [storageState, setStorageState] = useState<"new" | "restored" | "saved" | "failed">("new");
  const [storageError, setStorageError] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<Topic | null>(null);
  const [composing, setComposing] = useState<OptionTopic | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const composer = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let next = initialDraft();
    setEdited(false);
    setStorageError("");
    setStorageState("new");
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const saved: unknown = JSON.parse(raw);
        if (!isDraft(saved)) throw new Error("Saved draft is invalid.");
        next = saved;
        setStorageState("restored");
      }
    } catch {
      setStorageState("failed");
      setStorageError("无法读取此浏览器的创建草稿，填写内容将先保留在当前页面。");
    }
    const pending = next.pendingActivity.trim() ? "activity" : next.pendingLocation.trim() ? "location" : null;
    setExpanded(pending);
    setComposing(pending);
    setDraft(next);
    setLoadedKey(key);
  }, [key]);

  useEffect(() => {
    if (!draft || loadedKey !== key || !edited) return;
    try {
      localStorage.setItem(key, JSON.stringify(draft));
      setStorageState("saved");
      setStorageError("");
    } catch {
      setStorageState("failed");
      setStorageError("浏览器无法保留创建草稿，请保持页面打开并完成创建。");
    }
  }, [draft, edited, key, loadedKey]);

  useEffect(() => {
    if (!edited || storageState !== "failed") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [edited, storageState]);

  useEffect(() => {
    if (composing && composing === expanded) composer.current?.focus();
  }, [composing, expanded]);

  function change(patch: Partial<Draft>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
    setEdited(true);
    setError("");
  }

  function toggle(topic: Topic) {
    if (!draft || busy) return;
    change({ open: { ...draft.open, [topic]: !draft.open[topic] } });
    setExpanded(null);
    setComposing(null);
  }

  function addOption(topic: OptionTopic) {
    if (!draft) return;
    const values = optionValues(draft, topic);
    const pendingKey = topic === "activity" ? "pendingActivity" : "pendingLocation";
    if (!draft[pendingKey].trim()) return;
    if (values.length > 20) { setError("每项最多添加 20 个候选。"); return; }
    change({ [topic === "activity" ? "activityOptions" : "locationOptions"]: values, [pendingKey]: "" });
    setComposing(null);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || loadedKey !== key || running.current) return;
    setError("");
    try {
      if (!draft.title.trim()) throw new Error("请填写活动名称。");
      if (!draft.open.activity && !draft.activityType.trim()) throw new Error("请填写已确定的活动类型，或邀请朋友一起商量。");
      if (draft.limitAttendees && (!Number.isInteger(draft.capacity) || draft.capacity < 2 || draft.capacity > 20)) throw new Error("人数上限需在 2 至 20 人之间，包括你。");
      const activityOptions = optionValues(draft, "activity"), locationOptions = optionValues(draft, "location");
      if (activityOptions.length > 20 || locationOptions.length > 20) throw new Error("每项最多添加 20 个候选。");
      const openTime = draft.open.time;
      const dates = openTime ? candidateDates(draft.from, draft.through) : candidateDates(draft.fixedDate, draft.fixedDate);
      if (dates[0] < dateKey(new Date())) throw new Error("候选日期不能早于今天，请调整日期。");
      const startMinute = minutes(openTime ? draft.start : draft.fixedStart), endMinute = minutes(openTime ? draft.end : draft.fixedEnd);
      if (endMinute <= startMinute) throw new Error("结束时间需要晚于开始时间。");
      const fixedStart = openTime ? undefined : fromZonedTime(`${draft.fixedDate}T${draft.fixedStart}:00`, draft.timeZone);
      const fixedEnd = openTime ? undefined : fromZonedTime(`${draft.fixedDate}T${draft.fixedEnd}:00`, draft.timeZone);
      const durationMinutes = fixedStart && fixedEnd ? (fixedEnd.getTime() - fixedStart.getTime()) / 60000 : undefined;
      if (fixedStart && (Number.isNaN(fixedStart.getTime()) || fixedStart <= new Date())) throw new Error("请选择未来的活动时间。");
      if (durationMinutes !== undefined && (durationMinutes < 30 || durationMinutes > 480 || durationMinutes % 15 !== 0)) throw new Error("已确定的活动时长需为 30 分钟至 8 小时，以 15 分钟为单位。");
      running.current = true;
      setBusy(true);
      const result = await webRequest<{ token: string }>("/api/v1/time-polls", "POST", {
        title: draft.title.trim(),
        location: draft.open.location ? "" : draft.location.trim(),
        timeZone: draft.timeZone,
        dates,
        startMinute,
        endMinute,
        planningMode: openTime ? "COLLECT" : "FIXED",
        ...(fixedStart ? { fixedStart: fixedStart.toISOString(), durationMinutes } : {}),
        ...(draft.limitAttendees || !openTime ? { expectedCount: draft.limitAttendees ? draft.capacity : 20 } : {}),
        collaboration: {
          activity: draft.open.activity,
          location: draft.open.location,
          time: draft.open.time,
          activityType: draft.activityType.trim(),
          activityOptions: draft.open.activity ? activityOptions : [],
          locationOptions: draft.open.location ? locationOptions : [],
        },
      });
      try { localStorage.removeItem(key); } catch { /* The created plan is now the authoritative copy. */ }
      refreshWebData();
      onCreated(result.token);
    } catch (cause) {
      setError(messageOf(cause));
      running.current = false;
      setBusy(false);
    }
  }

  if (!draft || loadedKey !== key) return <div className={styles.editor}><p className={styles.loading} role="status">正在打开活动草稿…</p></div>;

  const allFixed = topics.every(({ key: topic }) => !draft.open[topic]);
  const DraftStatusIcon = storageState === "saved" || storageState === "restored" ? CheckCircle2 : Circle;
  const status = storageState === "restored" ? "草稿已恢复" : storageState === "saved" ? "草稿已保存" : storageState === "failed" ? "草稿未保留" : "新活动";
  return <form className={styles.editor} onSubmit={(event) => void create(event)} data-testid="activity-create-editor">
    <header className={styles.topbar}>
      <button type="button" className={styles.textButton} onClick={onCancel} disabled={busy}><ArrowLeft size={16} aria-hidden />返回计划</button>
      <span className={styles.saveStatus} role="status"><DraftStatusIcon size={14} aria-hidden />{status}</span>
    </header>
    <div className={styles.canvas}>
      <label className={styles.titleLabel}>
        <span className={styles.srOnly}>活动名称</span>
        <input className={styles.title} value={draft.title} onChange={(event) => change({ title: event.target.value })} maxLength={120} required placeholder="想约大家做什么？" disabled={busy} />
      </label>
      <div className={styles.collaboration}>
        <div className={styles.collaborationLabel}><span>邀请朋友一起商量</span><small>最终由你确认</small></div>
        <div className={styles.topics} role="group" aria-label="邀请朋友商量的内容">
          {topics.map(({ key: topic, name, shortName, icon: Icon }) => <button type="button" key={topic} className={styles.topic} aria-label={`一起商量${name}`} aria-pressed={draft.open[topic]} onClick={() => toggle(topic)} disabled={busy}>
            <Icon size={16} aria-hidden /><span>{shortName}</span><span className={styles.topicCheck} aria-hidden>{draft.open[topic] ? <Check size={11} /> : null}</span>
          </button>)}
        </div>
      </div>
      {topics.map(({ key: topic, name, icon: Icon }) => {
        const open = draft.open[topic], isExpanded = expanded === topic;
        const values = topic === "activity" ? draft.activityOptions : topic === "location" ? draft.locationOptions : [];
        return <section className={styles.field} key={topic} aria-labelledby={`${id}-${topic}-heading`}>
          <div className={styles.fieldHeader}>
            <span className={styles.fieldIcon}><Icon size={17} aria-hidden /></span>
            <div className={styles.fieldMain}>
              <h2 id={`${id}-${topic}-heading`} className={styles.fieldLabel}>{name}</h2>
              {topic === "time" ? <p className={styles.fieldValue}>{open ? `${dateLabel(draft.from)}${draft.from !== draft.through ? `—${dateLabel(draft.through)}` : ""} · ${draft.start}–${draft.end}` : `${dateLabel(draft.fixedDate)} · ${draft.fixedStart}–${draft.fixedEnd}`}</p> : open ? <p className={styles.fieldValue}>{values.length ? `${values.length} 个候选` : "朋友可以自由提议"}</p> : <input className={styles.inlineInput} aria-label={`已确定的${name}`} value={topic === "activity" ? draft.activityType : draft.location} onChange={(event) => change({ [topic === "activity" ? "activityType" : "location"]: event.target.value })} placeholder={topic === "activity" ? "填写活动类型" : "添加地点（选填）"} maxLength={topic === "activity" ? 120 : 200} required={topic === "activity"} disabled={busy} />}
            </div>
            <div className={styles.fieldActions}>
              {open && topic !== "time" ? <button type="button" className={styles.iconButton} aria-label={`添加${name}候选`} onClick={() => { setExpanded(topic); setComposing(topic); }} disabled={busy}><Plus size={17} aria-hidden /></button> : null}
              {open || topic === "time" ? <button type="button" className={styles.textButton} aria-expanded={isExpanded} aria-controls={`${id}-${topic}-content`} onClick={() => { setExpanded(isExpanded ? null : topic); setComposing(null); }} disabled={busy}>{isExpanded ? "收起" : topic === "time" ? "调整" : "查看"}{isExpanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}</button> : null}
            </div>
          </div>
          {isExpanded ? <div className={styles.expanded} id={`${id}-${topic}-content`}>
            {topic === "time" ? <>
              <div className={styles.fieldGrid}>
                {open ? <>
                  <label className={styles.formField}>候选日期 · 从<input type="date" value={draft.from} onChange={(event) => change({ from: event.target.value })} min={dateKey(new Date())} required disabled={busy} /></label>
                  <label className={styles.formField}>到<input type="date" value={draft.through} onChange={(event) => change({ through: event.target.value })} min={draft.from || dateKey(new Date())} required disabled={busy} /></label>
                </> : <label className={`${styles.formField} ${styles.fullWidth}`}>活动日期<input type="date" value={draft.fixedDate} onChange={(event) => change({ fixedDate: event.target.value })} min={dateKey(new Date())} required disabled={busy} /></label>}
                <label className={styles.formField}>{open ? "每天开始" : "开始时间"}<input type="time" step={900} value={open ? draft.start : draft.fixedStart} onChange={(event) => change({ [open ? "start" : "fixedStart"]: event.target.value })} required disabled={busy} /></label>
                <label className={styles.formField}>{open ? "每天结束" : "结束时间"}<input type="time" step={900} value={open ? draft.end : draft.fixedEnd} onChange={(event) => change({ [open ? "end" : "fixedEnd"]: event.target.value })} required disabled={busy} /></label>
              </div>
              <p className={styles.hint}>时区：{draft.timeZone}</p>
            </> : <>
              {values.length ? <div className={styles.candidates}>{values.map((value) => <button type="button" key={value} className={styles.candidate} aria-label={`移除候选${value}`} onClick={() => {
                const existing = topic === "activity" ? draft.activityOptions : draft.locationOptions;
                const pendingKey = topic === "activity" ? "pendingActivity" : "pendingLocation";
                change({ [topic === "activity" ? "activityOptions" : "locationOptions"]: existing.filter((option) => option !== value), ...(draft[pendingKey].trim() === value ? { [pendingKey]: "" } : {}) });
              }} disabled={busy}>{value}<X size={13} aria-hidden /></button>)}</div> : <p className={styles.hint}>可先留空，让朋友添加提议。</p>}
              {composing === topic ? <div className={styles.candidateInput}>
                <input ref={composer} className={styles.input} aria-label={topic === "activity" ? "新的活动候选" : "新的地点候选"} value={topic === "activity" ? draft.pendingActivity : draft.pendingLocation} maxLength={120} placeholder={topic === "activity" ? "例如：喝咖啡、逛展" : "例如：校园咖啡馆"} onChange={(event) => change({ [topic === "activity" ? "pendingActivity" : "pendingLocation"]: event.target.value })} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); addOption(topic); } }} disabled={busy} />
                <button type="button" className={styles.secondaryButton} onClick={() => addOption(topic)} disabled={busy || !(topic === "activity" ? draft.pendingActivity : draft.pendingLocation).trim()}>添加</button>
                <button type="button" className={styles.iconButton} aria-label="取消添加候选" onClick={() => { change({ [topic === "activity" ? "pendingActivity" : "pendingLocation"]: "" }); setComposing(null); }} disabled={busy}><X size={16} aria-hidden /></button>
              </div> : <button type="button" className={styles.textButton} onClick={() => setComposing(topic)} disabled={busy}><Plus size={15} aria-hidden />添加候选</button>}
            </>}
          </div> : null}
        </section>;
      })}
      <details className={styles.more}>
        <summary><SlidersHorizontal size={15} aria-hidden />更多设置</summary>
        <label className={styles.checkRow}><input type="checkbox" checked={draft.limitAttendees} onChange={(event) => change({ limitAttendees: event.target.checked })} disabled={busy} />限制参加人数（可选）</label>
        {draft.limitAttendees ? <label className={styles.formField}>最多参加几人（包括你）<input type="number" min={2} max={20} step={1} value={draft.capacity} onChange={(event) => change({ capacity: Number(event.target.value) })} required disabled={busy} /></label> : null}
        <p className={styles.hint}>当前系统最多 20 人参加，包括发起人。</p>
      </details>
      {storageError ? <p className={styles.notice} role="alert">{storageError}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
    </div>
    <footer className={styles.footer}>
      <button className={styles.primaryButton} disabled={busy} data-testid="activity-create-submit">{busy ? "创建中…" : allFixed ? "确认安排并邀请" : "创建并分享"}<ArrowUpRight size={16} aria-hidden /></button>
    </footer>
  </form>;
}
