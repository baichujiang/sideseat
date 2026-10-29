"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Check,
  Clock3,
  Coffee,
  Compass,
  Dumbbell,
  MessageCircle,
  Plus,
  Sparkles,
  Utensils,
  PartyPopper,
  Pencil,
  Pause,
  Play,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  browserTimeZone,
  clock,
  dateKey,
  localInput,
  messageOf,
  prettyDate,
  refreshWebData,
  useWebResource,
  webRequest,
} from "@/lib/web/client";
import {
  Avatar,
  Empty,
  ErrorNotice,
  Field,
  Loading,
  Modal,
  PageHeading,
} from "./ui";
import { useWebUser } from "./web-shell";
export const topics: Record<
  string,
  {
    name: string;
    icon: LucideIcon;
  }
> = {
  COFFEE: { name: "喝杯咖啡", icon: Coffee },
  STUDY: { name: "一起学习", icon: BookOpen },
  SPORTS: { name: "动起来", icon: Dumbbell },
  EXPLORE: { name: "出去走走", icon: Compass },
  FOOD: { name: "一起吃饭", icon: Utensils },
  EVENTS: { name: "参加活动", icon: PartyPopper },
};
type Timing = {
  kind: string;
  startDate?: string | null;
  endDate?: string | null;
  period?: string;
  timeZone?: string;
};
export type Intention = {
  id: string;
  topic: string;
  activityText: string | null;
  studyGoal: string | null;
  sportOtherNote?: string | null;
  sportTag?: string | null;
  note: string | null;
  status: string;
  version: number;
  timeZone: string;
  timeWindows: {
    startAt: string;
    endAt: string;
  }[];
  timePreference: Timing;
  exploreVisible: boolean;
  automaticMatching: boolean;
  courseId?: string | null;
  togetherMode?: string;
};
export type Opportunity = {
  id: string;
  topic: string;
  activityText: string | null;
  peerStudyGoal?: string | null;
  sharedContext?: string;
  startsAt: string | null;
  endsAt: string | null;
  timeContext?: Timing | null;
  isBookmarked: boolean;
  state: string;
  isExpired?: boolean;
  peer: {
    displayName: string;
    avatarUrl: string | null;
    campus: string | null;
    verifiedStudent: boolean;
    major: string | null;
  };
  peerIntention?: {
    descriptionPreview?: string | null;
  } | null;
  messageRequest: {
    direction: string;
    status: string;
    body: string;
    createdAt: string;
  } | null;
  coordination: {
    connectionId: string;
  } | null;
};
type Explore = {
  id: string;
  topic: string;
  activityText: string | null;
  studyGoal: string | null;
  descriptionPreview: string | null;
  campus: string | null;
  verifiedStudent: boolean;
  isExample: boolean;
  time: Timing;
};
export function timingLabel(
  value: Timing | null | undefined,
  windows?: {
    startAt: string;
    endAt: string;
  }[],
  zone?: string,
) {
  if (value?.kind === "UNDECIDED") return "时间一起商量";
  if (value?.kind === "FLEXIBLE")
    return `${value.startDate?.slice(5)} – ${value.endDate?.slice(5)} · ${{ ANY: "时间灵活", MORNING: "上午", AFTERNOON: "下午", EVENING: "晚上" }[value.period ?? "ANY"] ?? "时间灵活"}`;
  if (windows?.length)
    return `${prettyDate(windows[0].startAt, zone)} ${clock(windows[0].startAt, zone)}–${clock(windows[0].endAt, zone)}${windows.length > 1 ? ` 等 ${windows.length} 个时段` : ""}`;
  return "时间一起商量";
}
function IntentForm({
  intent,
  close,
  saved,
}: {
  intent?: Intention;
  close: () => void;
  saved: () => void;
}) {
  const [topic, setTopic] = useState(intent?.topic ?? "COFFEE"),
    [kind, setKind] = useState(intent?.timePreference?.kind ?? "UNDECIDED");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const detail = String(data.get("detail") ?? "").trim();
      const timing =
        kind === "EXACT"
          ? { kind: "EXACT" }
          : kind === "FLEXIBLE"
            ? {
                kind,
                startDate: data.get("from"),
                endDate: data.get("to"),
                period: data.get("period"),
              }
            : { kind: "UNDECIDED" };
      const body = {
        topic,
        studyGoal: topic === "STUDY" ? detail || null : null,
        activityText: !["STUDY", "SPORTS"].includes(topic)
          ? detail || null
          : null,
        sportTag: topic === "SPORTS" && detail ? "OTHER" : null,
        sportOtherNote: topic === "SPORTS" ? detail || null : null,
        note: String(data.get("note") ?? "") || null,
        timeZone: browserTimeZone(),
        timePreference: timing,
        timeWindows:
          kind === "EXACT"
            ? [
                {
                  startAt: new Date(String(data.get("start"))).toISOString(),
                  endAt: new Date(String(data.get("end"))).toISOString(),
                },
              ]
            : [],
        exploreVisible: data.get("visible") === "on",
        automaticMatching: true,
      };
      await webRequest(
        `/api/v1/me/weekly-intents${intent ? `/${intent.id}` : ""}`,
        intent ? "PATCH" : "POST",
        intent
          ? { action: "EDIT", expectedVersion: intent.version, ...body }
          : body,
      );
      saved();
      close();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={intent ? "编辑我的意愿" : "最近，想找个人一起…"}
      onClose={close}
    >
      <form onSubmit={(event) => void submit(event)}>
        <div className="sw-topic-filters">
          {Object.entries(topics).map(([key, item]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTopic(key)}
              className={topic === key ? "is-active" : ""}
            >
              <item.icon size={14} />
              {item.name}
            </button>
          ))}
        </div>
        <Field
          label={
            topic === "STUDY"
              ? "想学些什么？"
              : topic === "SPORTS"
                ? "想做什么运动？"
                : "具体想做什么？"
          }
        >
          <input
            name="detail"
            maxLength={60}
            defaultValue={
              intent?.activityText ||
              intent?.studyGoal ||
              intent?.sportOtherNote ||
              ""
            }
            placeholder={
              topic === "STUDY"
                ? "例如：一起复习线性代数"
                : "例如：去校园附近试一家新咖啡店"
            }
          />
        </Field>
        <Field label="什么时候？">
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            <option value="UNDECIDED">还没定，可以一起商量</option>
            <option value="FLEXIBLE">一段时间内都可以</option>
            <option value="EXACT">有明确的空闲时段</option>
          </select>
        </Field>
        {kind === "EXACT" ? (
          <div className="sw-form-row">
            <Field label="开始">
              <input
                name="start"
                type="datetime-local"
                required
                defaultValue={
                  intent?.timeWindows[0]
                    ? localInput(intent.timeWindows[0].startAt)
                    : ""
                }
              />
            </Field>
            <Field label="结束">
              <input
                name="end"
                type="datetime-local"
                required
                defaultValue={
                  intent?.timeWindows[0]
                    ? localInput(intent.timeWindows[0].endAt)
                    : ""
                }
              />
            </Field>
          </div>
        ) : null}
        {kind === "FLEXIBLE" ? (
          <>
            <div className="sw-form-row">
              <Field label="从">
                <input
                  type="date"
                  name="from"
                  min={dateKey(new Date())}
                  defaultValue={
                    intent?.timePreference.startDate ?? dateKey(new Date())
                  }
                  required
                />
              </Field>
              <Field label="到">
                <input
                  type="date"
                  name="to"
                  min={dateKey(new Date())}
                  defaultValue={intent?.timePreference.endDate ?? ""}
                  required
                />
              </Field>
            </div>
            <Field label="偏好的时段">
              <select
                name="period"
                defaultValue={intent?.timePreference.period ?? "ANY"}
              >
                <option value="ANY">都可以</option>
                <option value="MORNING">上午</option>
                <option value="AFTERNOON">下午</option>
                <option value="EVENING">晚上</option>
              </select>
            </Field>
          </>
        ) : null}
        <Field label="再说一点（选填）">
          <textarea
            name="note"
            maxLength={160}
            defaultValue={intent?.note ?? ""}
            placeholder="你想让同行的人知道什么？"
          />
        </Field>
        <label className="sw-check">
          <input
            type="checkbox"
            name="visible"
            defaultChecked={intent?.exploreVisible ?? true}
          />
          让同校同学在「主动寻找」里发现这个意愿
        </label>
        <p className="sw-muted">
          发布意愿不代表接受邀请，见面前仍需双方明确确认。
        </p>
        <ErrorNotice message={error} />
        <div className="sw-form-actions">
          <button className="sw-button" type="button" onClick={close}>
            取消
          </button>
          <button className="sw-button sw-primary" disabled={busy}>
            {busy ? "保存中…" : intent ? "保存修改" : "发布意愿"}
            <ArrowRight size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function GreetingModal({
  opportunity,
  close,
  onSaved,
}: {
  opportunity: Opportunity;
  close: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const incoming = opportunity.messageRequest?.direction === "INCOMING";
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = new FormData(event.currentTarget);
      const result = await webRequest<Opportunity>(
        `/api/v1/me/mutual-opportunities/${opportunity.id}/interaction`,
        "POST",
        { action: incoming ? "REPLY" : "SEND", body: data.get("body") },
      );
      refreshWebData();
      onSaved?.();
      close();
      if (result.coordination)
        router.push(
          `/web/messages?chat=${encodeURIComponent(result.coordination.connectionId)}`,
        );
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={incoming ? "回复这声招呼" : "从一声招呼开始"} onClose={close}>
      <div className="sw-row">
        <Avatar
          name={opportunity.peer.displayName}
          url={opportunity.peer.avatarUrl}
        />
        <div>
          <strong>{opportunity.peer.displayName}</strong>
          <p className="sw-muted">
            {opportunity.activityText || topics[opportunity.topic]?.name}
          </p>
        </div>
      </div>
      {incoming ? (
        <blockquote className="sw-quote">
          {opportunity.messageRequest?.body}
        </blockquote>
      ) : (
        <p className="sw-muted" style={{ margin: "18px 0" }}>
          围绕这个意愿聊一句，对方回复后就能继续聊天和安排计划。
        </p>
      )}
      <form onSubmit={(event) => void send(event)}>
        <Field label={incoming ? "你的回复" : "想说的话"}>
          <textarea
            name="body"
            maxLength={500}
            minLength={1}
            required
            autoFocus
            placeholder="你好，我也想一起…"
          />
        </Field>
        <ErrorNotice message={error} />
        <div className="sw-form-actions">
          {incoming ? (
            <button
              className="sw-button"
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  await webRequest(
                    `/api/v1/me/mutual-opportunities/${opportunity.id}/interaction`,
                    "POST",
                    { action: "IGNORE" },
                  );
                  refreshWebData();
                  onSaved?.();
                  close();
                } catch (cause) {
                  setError(messageOf(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              暂不回应
            </button>
          ) : null}
          <button className="sw-button" type="button" onClick={close}>
            取消
          </button>
          <button className="sw-button sw-primary" disabled={busy}>
            {busy ? "发送中…" : incoming ? "回复并开始聊天" : "发送招呼"}
            <MessageCircle size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function TogetherPage() {
  const user = useWebUser(),
    router = useRouter();
  const mine = useWebResource<{
    intents: Intention[];
    expiredIntents: Intention[];
  }>("/api/v1/me/weekly-intents");
  const recommendations = useWebResource<{
    opportunities: Opportunity[];
  }>("/api/v1/me/mutual-opportunities", 30000);
  const explore = useWebResource<{
    intents: Explore[];
    hasMore: boolean;
  }>("/api/v1/explore/intents?limit=12", 30000);
  const [tab, setTab] = useState("recommended"),
    [topic, setTopic] = useState("ALL"),
    [editing, setEditing] = useState<Intention | true | null>(null),
    [greeting, setGreeting] = useState<Opportunity | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState<string | null>(null),
    [endIntent, setEndIntent] = useState<Intention | null>(null);
  const refresh = () => {
    mine.reload();
    recommendations.reload();
    explore.reload();
  };
  async function mutate(
    path: string,
    method: string,
    body: unknown,
    id: string,
  ) {
    setBusy(id);
    setError("");
    try {
      await webRequest(path, method, body);
      refresh();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }
  async function contact(intent: Explore) {
    setBusy(intent.id);
    setError("");
    try {
      const result = await webRequest<Opportunity>(
        `/api/v1/explore/intents/${intent.id}/contact`,
        "POST",
        {},
      );
      if (result.coordination)
        router.push(`/web/messages?chat=${result.coordination.connectionId}`);
      else setGreeting(result);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(null);
    }
  }
  const opportunities = (recommendations.data?.opportunities ?? []).filter(
    (row) =>
      (topic === "ALL" || row.topic === topic) &&
      (tab !== "saved" || row.isBookmarked),
  );
  return (
    <>
      <PageHeading
        eyebrow="FIND YOUR PEOPLE"
        title="同行，从共同的想法开始。"
        description="先有一件想做的事，再遇见刚好也想的人。"
      >
        <button
          className="sw-button sw-primary"
          onClick={() => setEditing(true)}
        >
          <Plus size={16} />
          添加意愿
        </button>
      </PageHeading>
      <div className="sw-grid">
        <div>
          <section className="sw-welcome">
            <h2>
              {user.nickname || user.username}，<br />
              给今天留一点「一起」的可能。
            </h2>
            <p>小小的共同意愿，可以成为一段真实的校园故事。</p>
            <div className="sw-welcome-art" aria-hidden>
              <Coffee size={67} strokeWidth={1.1} />
            </div>
          </section>
          <div className="sw-tabs" role="tablist" aria-label="同行列表">
            {[
              ["recommended", "为你推荐"],
              ["explore", "主动寻找"],
              ["saved", "我的收藏"],
            ].map(([key, name]) => (
              <button
                type="button"
                key={key}
                role="tab"
                aria-selected={tab === key}
                className={tab === key ? "is-active" : ""}
                onClick={() => setTab(key)}
              >
                {name}
                {key === "saved" ? (
                  <span>
                    {recommendations.data?.opportunities.filter(
                      (row) => row.isBookmarked,
                    ).length ?? 0}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          <div className="sw-topic-filters">
            <button
              className={topic === "ALL" ? "is-active" : ""}
              onClick={() => setTopic("ALL")}
            >
              全部
            </button>
            {Object.entries(topics).map(([key, item]) => (
              <button
                key={key}
                className={topic === key ? "is-active" : ""}
                onClick={() => setTopic(key)}
              >
                <item.icon size={13} />
                {item.name}
              </button>
            ))}
          </div>
          <ErrorNotice message={error} />
          <ErrorNotice
            message={tab === "explore" ? explore.error : recommendations.error}
            retry={refresh}
          />
          {(tab === "explore" ? explore.loading : recommendations.loading) ? (
            <Loading />
          ) : tab === "explore" ? (
            <div className="sw-opportunity-grid">
              {(explore.data?.intents ?? [])
                .filter((row) => topic === "ALL" || row.topic === topic)
                .map((row) => {
                  const Icon = topics[row.topic]?.icon ?? Compass;
                  return (
                    <article className="sw-person-card" key={row.id}>
                      <div className="sw-row">
                        <span className={`sw-activity-icon ${row.topic}`}>
                          <Icon size={23} strokeWidth={1.5} />
                        </span>
                        <div>
                          <h3>
                            {row.activityText ||
                              row.studyGoal ||
                              topics[row.topic]?.name}
                          </h3>
                          <p className="sw-muted">
                            {row.campus} ·{" "}
                            {row.isExample
                              ? "示例意愿"
                              : row.verifiedStudent
                                ? "已认证同学"
                                : "校园同学"}
                          </p>
                        </div>
                      </div>
                      <span className="sw-label">
                        <Clock3 size={11} />
                        {timingLabel(row.time)}
                      </span>
                      {row.descriptionPreview ? (
                        <p>{row.descriptionPreview}</p>
                      ) : null}
                      <div className="sw-intent-actions">
                        <span className="sw-muted">先聊意愿，再认识彼此</span>
                        {!row.isExample ? (
                          <button
                            className="sw-text-button"
                            disabled={busy === row.id}
                            onClick={() => void contact(row)}
                          >
                            打个招呼
                            <ArrowRight size={14} />
                          </button>
                        ) : (
                          <span className="sw-muted">仅供了解</span>
                        )}
                      </div>
                    </article>
                  );
                })}
            </div>
          ) : (
            <div className="sw-opportunity-grid">
              {opportunities.map((row) => {
                const Icon = topics[row.topic]?.icon ?? Compass;
                return (
                  <article key={row.id} className="sw-person-card">
                    <div className="sw-row">
                      <Avatar
                        name={row.peer.displayName}
                        url={row.peer.avatarUrl}
                      />
                      <div className="sw-grow">
                        <h3>
                          {row.peer.displayName}
                          {row.peer.verifiedStudent ? (
                            <Check size={13} className="sw-inline-check" />
                          ) : null}
                        </h3>
                        <p className="sw-muted">
                          {[row.peer.campus, row.peer.major]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <button
                        className="sw-icon-button"
                        aria-label={row.isBookmarked ? "取消收藏" : "收藏"}
                        disabled={busy === row.id}
                        onClick={() =>
                          void mutate(
                            `/api/v1/me/mutual-opportunities/${row.id}/interaction`,
                            "POST",
                            {
                              action: row.isBookmarked
                                ? "UNBOOKMARK"
                                : "BOOKMARK",
                            },
                            row.id,
                          )
                        }
                      >
                        <Bookmark
                          size={17}
                          fill={row.isBookmarked ? "currentColor" : "none"}
                        />
                      </button>
                    </div>
                    <span className="sw-label orange">
                      <Icon size={11} />
                      {row.activityText ||
                        row.peerStudyGoal ||
                        topics[row.topic]?.name}
                    </span>
                    <p>
                      {row.peerIntention?.descriptionPreview ||
                        "也想找个同路的人，让这件小事更有意思。"}
                    </p>
                    <div className="sw-intent-meta">
                      <Clock3 size={12} />
                      {row.startsAt
                        ? `${prettyDate(row.startsAt)} ${clock(row.startsAt)}`
                        : timingLabel(row.timeContext)}
                    </div>
                    <div className="sw-intent-actions">
                      <span className="sw-muted">
                        {row.isExpired
                          ? "意愿已过期"
                          : row.coordination
                            ? "已经可以聊天"
                            : row.messageRequest?.direction === "OUTGOING"
                              ? "招呼已发出"
                              : "共同意愿，刚好同路"}
                      </span>
                      {row.coordination ? (
                        <Link
                          href={`/web/messages?chat=${row.coordination.connectionId}`}
                          className="sw-button sw-soft sw-small"
                        >
                          继续聊
                          <ArrowRight size={13} />
                        </Link>
                      ) : (
                        <button
                          className="sw-button sw-soft sw-small"
                          disabled={
                            !!row.isExpired ||
                            busy === row.id ||
                            row.messageRequest?.direction === "OUTGOING"
                          }
                          onClick={() => setGreeting(row)}
                        >
                          <MessageCircle size={13} />
                          {row.messageRequest?.direction === "INCOMING"
                            ? "回复招呼"
                            : "打个招呼"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {!recommendations.loading &&
          tab !== "explore" &&
          opportunities.length === 0 ? (
            <Empty
              icon={tab === "saved" ? Bookmark : Compass}
              title={
                tab === "saved"
                  ? "把感兴趣的同行，留在这里。"
                  : "合适的人，也许正好在路上。"
              }
              action={
                tab !== "saved" ? (
                  <button
                    className="sw-button sw-soft"
                    onClick={() => setTab("explore")}
                  >
                    主动寻找
                    <ArrowRight size={14} />
                  </button>
                ) : undefined
              }
            >
              {tab === "saved"
                ? "收藏是私密的。遇到想认识的人，点一下书签，下次再来看看。"
                : user.verifiedStudent
                  ? "添加具体的意愿，或去主动寻找看看同学们最近想做什么。"
                  : "完成学生认证后，就能发现同校同学和共同意愿。"}
            </Empty>
          ) : null}
          {!explore.loading &&
          tab === "explore" &&
          !(explore.data?.intents ?? []).some(
            (row) => topic === "ALL" || row.topic === topic,
          ) ? (
            <Empty icon={Compass} title="这里还没有新的意愿。">
              换个分类看看，也可以先发布你的想法。
            </Empty>
          ) : null}
        </div>
        <aside className="sw-stack">
          <section className="sw-panel">
            <div className="sw-panel-heading">
              <h2>我的意愿</h2>
              <button
                className="sw-icon-button"
                aria-label="添加意愿"
                onClick={() => setEditing(true)}
              >
                <Plus size={17} />
              </button>
            </div>
            <ErrorNotice message={mine.error} retry={mine.reload} />
            {mine.loading ? (
              <Loading />
            ) : mine.data?.intents.length ? (
              mine.data.intents.map((intent) => {
                const Icon = topics[intent.topic]?.icon ?? Coffee;
                return (
                  <article className="sw-intent-card" key={intent.id}>
                    <div className="sw-intent-top">
                      <span className={`sw-activity-icon ${intent.topic}`}>
                        <Icon size={20} />
                      </span>
                      <div>
                        <h3>
                          {intent.activityText ||
                            intent.studyGoal ||
                            intent.sportOtherNote ||
                            topics[intent.topic]?.name}
                        </h3>
                        <span
                          className={`sw-label ${intent.status === "PAUSED" ? "gray" : ""}`}
                        >
                          {intent.status === "PAUSED" ? "已暂停" : "正在找同行"}
                        </span>
                      </div>
                    </div>
                    <p>
                      {timingLabel(
                        intent.timePreference,
                        intent.timeWindows,
                        intent.timeZone,
                      )}
                    </p>
                    {intent.note ? <p>{intent.note}</p> : null}
                    <div className="sw-intent-actions">
                      <button
                        className="sw-text-button"
                        onClick={() => setEditing(intent)}
                      >
                        <Pencil size={12} />
                        编辑
                      </button>
                      <button
                        className="sw-icon-button"
                        disabled={busy === intent.id}
                        aria-label={
                          intent.status === "PAUSED" ? "恢复意愿" : "暂停意愿"
                        }
                        onClick={() =>
                          void mutate(
                            `/api/v1/me/weekly-intents/${intent.id}`,
                            "PATCH",
                            {
                              action:
                                intent.status === "PAUSED" ? "RESUME" : "PAUSE",
                              expectedVersion: intent.version,
                            },
                            intent.id,
                          )
                        }
                      >
                        {intent.status === "PAUSED" ? (
                          <Play size={13} />
                        ) : (
                          <Pause size={13} />
                        )}
                      </button>
                      <button
                        className="sw-icon-button"
                        aria-label="结束意愿"
                        onClick={() => setEndIntent(intent)}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="sw-empty" style={{ padding: "20px 0" }}>
                <Sparkles size={26} color="#b6bda6" />
                <p>
                  一件具体的小事，
                  <br />
                  就是认识新朋友的好开始。
                </p>
                <button
                  className="sw-text-button"
                  onClick={() => setEditing(true)}
                >
                  添加你的第一个意愿
                  <Plus size={13} />
                </button>
              </div>
            )}
          </section>
          <section className="sw-aside-note">
            <div className="sw-tip-number">A LITTLE REMINDER · 01</div>
            <Sparkles size={28} strokeWidth={1.2} />
            <h3>
              不必很特别，
              <br />
              只要是你想做的。
            </h3>
            <p>
              一起安静自习，饭后散个步，或者只是喝杯咖啡。共同的小事，会让校园慢慢熟悉起来。
            </p>
          </section>
        </aside>
      </div>
      {editing ? (
        <IntentForm
          intent={editing === true ? undefined : editing}
          close={() => setEditing(null)}
          saved={refresh}
        />
      ) : null}
      {greeting ? (
        <GreetingModal
          opportunity={greeting}
          close={() => setGreeting(null)}
          onSaved={refresh}
        />
      ) : null}
      {endIntent ? (
        <Modal title="结束这个意愿？" onClose={() => setEndIntent(null)}>
          <p className="sw-muted">
            结束后将停止寻找这个意愿的同行，已有聊天和计划仍会保留。
          </p>
          <div className="sw-form-actions">
            <button className="sw-button" onClick={() => setEndIntent(null)}>
              再想想
            </button>
            <button
              className="sw-button sw-primary"
              disabled={!!busy}
              onClick={async () => {
                await mutate(
                  `/api/v1/me/weekly-intents/${endIntent.id}`,
                  "DELETE",
                  { expectedVersion: endIntent.version },
                  endIntent.id,
                );
                setEndIntent(null);
              }}
            >
              结束意愿
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
