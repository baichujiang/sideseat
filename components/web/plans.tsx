"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck2,
  CalendarDays,
  Check,
  Copy,
  MapPin,
  Plus,
  Send,
  Users,
} from "lucide-react";
import { AvailabilityEditor } from "@/components/time-polls/availability-editor";
import { ActivityIdeas } from "@/components/time-polls/activity-ideas";
import type { SharedTimePoll } from "@/lib/time-polls/browser-types";
import {
  browserTimeZone,
  clock,
  dateKey,
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
type PollSummary = {
  token: string;
  title: string;
  dates: string[];
  phase: string;
  planningMode: string;
  chosenStart: string | null;
  chosenEnd: string | null;
  respondedCount: number;
  acceptedCount: number;
  invitedCount: number;
  isOwner: boolean;
  myInvitationStatus: string | null;
  organizer: {
    displayName: string;
    avatarUrl: string | null;
  };
  peoplePreview: {
    displayName: string;
    avatarUrl: string | null;
  }[];
};
export type DirectPlan = {
  id: string;
  connectionId: string;
  title: string;
  location: string | null;
  message: string | null;
  status: string;
  startTime: string;
  endTime: string;
  proposer: {
    id: string;
    nickname: string | null;
    username: string;
  };
  receiver: {
    id: string;
    nickname: string | null;
    username: string;
  };
};
type PollDetail = SharedTimePoll & {
  isOwner: boolean;
  shareUrl: string;
  invitees?: {
    id: string;
    displayName: string;
    didRespond: boolean;
    isMe: boolean;
  }[];
};
const phaseNames: Record<string, string> = {
  COLLECTING: "收集空闲",
  INVITING: "等待确认",
  CONFIRMED: "已确定",
  CANCELLED: "已取消",
  EXPIRED: "已结束",
  PENDING: "待回复",
  ACCEPTED: "已确定",
  DECLINED: "已婉拒",
  CANCELED: "已取消",
  COUNTERED: "已提议调整",
};
function CreatePlan({ close }: { close: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const later = new Date(tomorrow);
  later.setDate(later.getDate() + 6);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const first = String(data.get("from")),
        last = String(data.get("to"));
      if (last < first) throw new Error("结束日期不能早于开始日期。");
      const dates: string[] = [];
      for (
        let day = new Date(first + "T12:00:00");
        dateKey(day) <= last;
        day.setDate(day.getDate() + 1)
      ) {
        dates.push(dateKey(day));
        if (dates.length > 31) throw new Error("最多选择 31 个候选日期。");
      }
      const minutes = (key: string) => {
        const [h, m] = String(data.get(key)).split(":").map(Number);
        return h * 60 + m;
      };
      const result = await webRequest<PollDetail>(
        "/api/v1/time-polls",
        "POST",
        {
          title: data.get("title"),
          location: data.get("location"),
          timeZone: browserTimeZone(),
          dates,
          startMinute: minutes("start"),
          endMinute: minutes("end"),
          planningMode: "COLLECT",
          chooseActivityTogether: data.get("ideas") === "on",
        },
      );
      refreshWebData();
      close();
      router.push(`/web/plans/${result.token}`);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="让想法，变成一个计划。" onClose={close}>
      <form onSubmit={(event) => void create(event)}>
        <Field label="计划名称">
          <input
            name="title"
            required
            maxLength={120}
            placeholder="例如：周末一起去逛美术馆"
            autoFocus
          />
        </Field>
        <Field label="地点（选填）">
          <input
            name="location"
            maxLength={200}
            placeholder="可以先留空，之后一起商量"
          />
        </Field>
        <div className="sw-form-row">
          <Field label="候选日期 · 从">
            <input
              name="from"
              type="date"
              defaultValue={dateKey(tomorrow)}
              min={dateKey(new Date())}
              required
            />
          </Field>
          <Field label="到">
            <input
              name="to"
              type="date"
              defaultValue={dateKey(later)}
              min={dateKey(new Date())}
              required
            />
          </Field>
        </div>
        <div className="sw-form-row">
          <Field label="每天可填写的时间 · 从">
            <input
              name="start"
              type="time"
              step={900}
              defaultValue="09:00"
              required
            />
          </Field>
          <Field label="到">
            <input
              name="end"
              type="time"
              step={900}
              defaultValue="22:00"
              required
            />
          </Field>
        </div>
        <label className="sw-check">
          <input name="ideas" type="checkbox" />
          也让朋友一起提议活动
        </label>
        <p className="sw-muted">
          创建后直接进入时间表。填写并提交自己的空闲，再分享给朋友。时区：
          {browserTimeZone()}
        </p>
        <ErrorNotice message={error} />
        <div className="sw-form-actions">
          <button type="button" className="sw-button" onClick={close}>
            取消
          </button>
          <button className="sw-button sw-primary" disabled={busy}>
            {busy ? "创建中…" : "创建时间表"}
            <ArrowRight size={15} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function PlansPage() {
  const search = useSearchParams();
  const [create, setCreate] = useState(search.get("create") === "1"),
    [tab, setTab] = useState("planning"),
    [direct, setDirect] = useState<DirectPlan | null>(null);
  useEffect(() => {
    const open = () => setCreate(true);
    window.addEventListener("sideseat:create-plan", open);
    return () => window.removeEventListener("sideseat:create-plan", open);
  }, []);
  const polls = useWebResource<{
      polls: PollSummary[];
    }>("/api/v1/time-polls"),
    directs = useWebResource<{
      plans: DirectPlan[];
    }>("/api/v1/plans");
  const history = (phase: string, end: string | null) =>
    ["CANCELLED", "CANCELED", "EXPIRED", "DECLINED"].includes(phase) ||
    (!!end && Date.parse(end) < Date.now());
  const visible = (phase: string, end: string | null) =>
    tab === "history"
      ? history(phase, end)
      : tab === "confirmed"
        ? !history(phase, end) && ["CONFIRMED", "ACCEPTED"].includes(phase)
        : !history(phase, end) && !["CONFIRMED", "ACCEPTED"].includes(phase);
  const items = (polls.data?.polls ?? []).filter((row) =>
    visible(row.phase, row.chosenEnd),
  );
  const pairs = (directs.data?.plans ?? []).filter((row) =>
    visible(row.status, row.endTime),
  );
  return (
    <>
      <PageHeading
        eyebrow="MAKE IT HAPPEN"
        title="把「改天见」，变成有日期的约定。"
        description="和手机端共用每一个计划，从找时间到真正见面。"
      >
        <button
          className="sw-button sw-primary"
          onClick={() => setCreate(true)}
        >
          <Plus size={16} />
          发起计划
        </button>
      </PageHeading>
      <div className="sw-tabs">
        {[
          ["planning", "筹划中"],
          ["confirmed", "已确定"],
          ["history", "历史计划"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "is-active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      <ErrorNotice
        message={polls.error || directs.error}
        retry={() => {
          polls.reload();
          directs.reload();
        }}
      />
      {polls.loading || directs.loading ? (
        <Loading />
      ) : (
        <>
          <div className="sw-plan-grid">
            {items.map((row) => (
              <Link
                href={`/web/plans/${row.token}`}
                key={row.token}
                className="sw-plan-card"
              >
                <div className="sw-plan-card-art">
                  <CalendarCheck2 size={36} strokeWidth={1.25} />
                  <span
                    className={`sw-label ${row.phase === "INVITING" ? "orange" : ""}`}
                  >
                    {phaseNames[row.phase] ?? row.phase}
                  </span>
                </div>
                <div className="sw-plan-card-body">
                  <p className="sw-eyebrow">
                    {row.isOwner ? "我发起的计划" : "朋友的邀请"}
                  </p>
                  <h2>{row.title}</h2>
                  <p className="sw-plan-date">
                    <CalendarDays size={14} />
                    {row.chosenStart
                      ? `${prettyDate(row.chosenStart)} · ${clock(row.chosenStart)}`
                      : `${row.dates[0]?.slice(5)} — ${row.dates.at(-1)?.slice(5)}`}
                  </p>
                  <div className="sw-plan-card-bottom">
                    <div className="sw-row">
                      <Avatar
                        name={row.organizer.displayName}
                        url={row.organizer.avatarUrl}
                        size="small"
                      />
                      <span>{row.organizer.displayName}</span>
                    </div>
                    <span>
                      {row.phase === "COLLECTING"
                        ? `${row.respondedCount} 人已填写`
                        : `${row.acceptedCount} 人已确认`}
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
            {pairs.map((row) => (
              <button
                key={row.id}
                className="sw-plan-card"
                onClick={() => setDirect(row)}
              >
                <div className="sw-plan-card-art direct">
                  <Users size={36} strokeWidth={1.25} />
                  <span className="sw-label">
                    {phaseNames[row.status] ?? row.status}
                  </span>
                </div>
                <div className="sw-plan-card-body">
                  <p className="sw-eyebrow">双人计划</p>
                  <h2>{row.title}</h2>
                  <p className="sw-plan-date">
                    <CalendarDays size={14} />
                    {prettyDate(row.startTime)} · {clock(row.startTime)}
                  </p>
                  <div className="sw-plan-card-bottom">
                    <span>
                      {row.proposer.nickname || row.proposer.username} &{" "}
                      {row.receiver.nickname || row.receiver.username}
                    </span>
                    <ArrowRight size={14} />
                  </div>
                </div>
              </button>
            ))}
          </div>
          {!items.length && !pairs.length ? (
            <section className="sw-panel">
              <Empty
                icon={CalendarCheck2}
                title={
                  tab === "confirmed"
                    ? "期待下一次，真的见面。"
                    : tab === "history"
                      ? "一起经历过的，都会留在这里。"
                      : "好想法，值得一个具体的时间。"
                }
                action={
                  tab !== "history" ? (
                    <button
                      className="sw-button sw-primary"
                      onClick={() => setCreate(true)}
                    >
                      <Plus size={15} />
                      发起第一个计划
                    </button>
                  ) : undefined
                }
              >
                发起计划后，分享给朋友，一起找到合适的时间。已确认的安排也会出现在你的手机日历里。
              </Empty>
            </section>
          ) : null}
        </>
      )}
      {create ? <CreatePlan close={() => setCreate(false)} /> : null}
      {direct ? (
        <DirectPlanModal
          plan={direct}
          close={() => setDirect(null)}
          changed={() => {
            directs.reload();
            refreshWebData();
          }}
        />
      ) : null}
    </>
  );
}
export function DirectPlanModal({
  plan,
  close,
  changed,
}: {
  plan: DirectPlan;
  close: () => void;
  changed: () => void;
}) {
  const user = useWebUser();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  async function respond(action: string, body: unknown = {}) {
    setBusy(true);
    setError("");
    try {
      await webRequest(`/api/v1/plans/${plan.id}/${action}`, "POST", body);
      changed();
      close();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={plan.title} onClose={close}>
      <span className="sw-label">{phaseNames[plan.status] ?? plan.status}</span>
      <p className="sw-detail-line">
        <CalendarDays size={17} />
        {prettyDate(plan.startTime)} {clock(plan.startTime)}–
        {clock(plan.endTime)}
      </p>
      {plan.location ? (
        <p className="sw-detail-line">
          <MapPin size={17} />
          {plan.location}
        </p>
      ) : null}
      {plan.message ? <p className="sw-quote">{plan.message}</p> : null}
      {cancelling ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void respond("cancel", {
              reasonCode: form.get("reason"),
              note: form.get("note") || null,
            });
          }}
        >
          <div className="sw-line" />
          <p className="sw-muted">
            取消后会通知对方，并更新双方的相关日历安排。
          </p>
          <Field label="取消原因">
            <select name="reason" required>
              <option value="SCHEDULE_CHANGED">时间安排有变</option>
              <option value="UNWELL">身体不适</option>
              <option value="SAFETY">安全原因</option>
              <option value="OTHER">其他</option>
            </select>
          </Field>
          <Field label="补充说明（选填）">
            <textarea name="note" maxLength={240} />
          </Field>
          <div className="sw-form-actions">
            <button
              className="sw-button"
              type="button"
              onClick={() => setCancelling(false)}
            >
              保留计划
            </button>
            <button className="sw-button sw-danger" disabled={busy}>
              确认取消计划
            </button>
          </div>
        </form>
      ) : null}
      <ErrorNotice message={error} />
      <div className="sw-form-actions">
        <Link
          className="sw-button"
          href={`/web/messages?chat=${plan.connectionId}`}
        >
          打开聊天
        </Link>
        {!cancelling &&
        Date.parse(plan.startTime) > Date.now() &&
        (plan.status === "ACCEPTED" ||
          (plan.status === "PENDING" && plan.proposer.id === user.id)) ? (
          <button
            className="sw-button sw-danger"
            disabled={busy}
            onClick={() => setCancelling(true)}
          >
            {plan.status === "PENDING" ? "撤回邀请" : "取消计划"}
          </button>
        ) : null}
        {plan.status === "PENDING" && plan.receiver.id === user.id ? (
          <>
            <button
              className="sw-button"
              disabled={busy}
              onClick={() => void respond("decline")}
            >
              婉拒
            </button>
            <button
              className="sw-button sw-primary"
              disabled={busy}
              onClick={() => void respond("accept")}
            >
              确认参加
            </button>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
export function PlanDetailPage({ token }: { token: string }) {
  const resource = useWebResource<PollDetail>(
    `/api/v1/time-polls/${encodeURIComponent(token)}`,
  );
  return (
    <>
      <Link href="/web/plans" className="sw-text-button">
        <ArrowLeft size={15} />
        返回计划
      </Link>
      <ErrorNotice message={resource.error} retry={resource.reload} />
      {resource.loading ? (
        <Loading />
      ) : resource.data ? (
        <PollWorkspace
          key={token}
          poll={resource.data}
          reload={resource.reload}
        />
      ) : null}
    </>
  );
}
function PollWorkspace({
  poll,
  reload,
}: {
  poll: PollDetail;
  reload: () => void;
}) {
  const user = useWebUser(),
    router = useRouter();
  const initialSlots = useRef(poll.slots);
  const draftKey = `sideseat:web:availability:${user.id}:${poll.token}`;
  const [selected, setSelected] = useState<number[]>(poll.mySlotIds),
    [dirty, setDirty] = useState(false),
    [restoredDraftKey, setRestoredDraftKey] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [showFinal, setShowFinal] = useState(false),
    [showShare, setShowShare] = useState(false),
    [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null),
    [edit, setEdit] = useState(false);
  const [openInviteLink, setOpenInviteLink] = useState(true),
    [limitAttendees, setLimitAttendees] = useState(false);
  const contacts = useWebResource<{
    contacts: {
      connectionId: string;
      displayName?: string;
      nickname?: string;
      username?: string;
      peer?: {
        nickname: string | null;
        username: string;
      };
    }[];
  }>(showShare ? "/api/v1/contacts" : null, 0);
  const [contactIds, setContactIds] = useState<string[]>([]);
  const [invitees, setInvitees] = useState<string[]>(
    (poll.invitees ?? [])
      .filter((person) => person.didRespond)
      .map((person) => person.id),
  );
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const ids: unknown = JSON.parse(raw);
        if (
          Array.isArray(ids) &&
          ids.every(
            (id) =>
              typeof id === "number" &&
              initialSlots.current.some((slot) => slot.id === id),
          )
        ) {
          setSelected(ids);
          setDirty(true);
          setNotice("已恢复此浏览器的空闲草稿，尚未提交。");
        }
      }
    } catch {
      setError("浏览器无法读取草稿，请保持页面打开并手动提交。");
    } finally {
      setRestoredDraftKey(draftKey);
    }
  }, [draftKey]); // one account + plan, never shared across accounts
  useEffect(() => {
    if (restoredDraftKey === draftKey && !dirty) setSelected(poll.mySlotIds);
  }, [draftKey, restoredDraftKey, poll.mySlotIds, dirty]);
  function choose(ids: number[]) {
    setSelected(ids);
    setDirty(true);
    setNotice("草稿已保存在此浏览器，提交后朋友才能看到。");
    try {
      localStorage.setItem(draftKey, JSON.stringify(ids));
    } catch {
      setError("此浏览器无法保留草稿，离开前请手动提交。");
    }
  }
  async function action<T = PollDetail>(
    path: string,
    method: string,
    body?: unknown,
  ) {
    setBusy(true);
    setError("");
    try {
      const result = await webRequest<T>(
        `/api/v1/time-polls/${poll.token}${path}`,
        method,
        body,
      );
      refreshWebData();
      reload();
      return result;
    } catch (cause) {
      setError(messageOf(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    const result = await action("/response", "PUT", {
      displayName: poll.myDisplayName || user.nickname || user.username,
      slotIds: selected,
    });
    if (result) {
      setDirty(false);
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* server acknowledgement remains authoritative */
      }
      setNotice("空闲已提交，手机端也能看到。");
      if (poll.isOwner && !poll.didRespond) setShowShare(true);
    }
  }
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const start = fromZonedTime(
        String(form.get("start")),
        poll.timeZone,
      ).toISOString(),
      end = fromZonedTime(String(form.get("end")), poll.timeZone).toISOString();
    const result = await action("/invitations", "POST", {
      start,
      end,
      attendeeIds: invitees,
      version: poll.invitationVersion,
      ...(openInviteLink
        ? { linkParticipantCount: limitAttendees ? Number(form.get("capacity")) : null }
        : {}),
    });
    if (result) setShowFinal(false);
  }
  const closed =
    ["CANCELLED", "EXPIRED"].includes(poll.phase) ||
    (poll.phase === "CONFIRMED" &&
      !!poll.chosenStart &&
      Date.parse(poll.chosenStart) < Date.now());
  const mine = poll.invitations.find((person) => person.isMe);
  const first = poll.slots.find((slot) => Date.parse(slot.start) > Date.now());
  const firstDayEnd = first && poll.slots.filter((slot) => slot.date === first.date).at(-1)?.end;
  const initialStart = poll.chosenStart ?? first?.start;
  const initialEnd = poll.chosenEnd ?? firstDayEnd;
  const minimumAttendees = Math.max(
    2,
    1 + invitees.filter((id) => !poll.invitees?.some((person) => person.id === id && person.isMe)).length,
  );
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE PLAN, A REAL CONNECTION"
        title={poll.title}
        description={`${poll.location || "地点可以一起商量"} · ${poll.timeZone}`}
      >
        <button className="sw-button" onClick={() => setShowShare(true)}>
          <Copy size={15} />
          分享
        </button>
        {poll.isOwner && !closed ? (
          <button
            className="sw-icon-button"
            aria-label="编辑计划"
            onClick={() => setEdit(true)}
          >
            ···
          </button>
        ) : null}
      </PageHeading>
      <div className="sw-grid sw-poll-layout">
        <section className="sw-panel">
          <div className="sw-panel-heading">
            <div>
              <span className="sw-label orange">
                {phaseNames[poll.phase] ?? poll.phase}
              </span>
              <h2 style={{ marginTop: 12 }}>
                {poll.phase === "COLLECTING"
                  ? "大家的时间表"
                  : poll.phase === "INVITING"
                    ? "拟定时间，待确认"
                    : poll.phase === "CONFIRMED"
                      ? "这次，我们约好了。"
                      : "计划详情"}
              </h2>
            </div>
            <span className="sw-muted">
              {poll.dates[0]?.slice(5)} — {poll.dates.at(-1)?.slice(5)}
            </span>
          </div>
          {poll.chosenStart && poll.chosenEnd ? (
            <div className="sw-confirmed-time">
              <CalendarCheck2 size={30} strokeWidth={1.3} />
              <div>
                <strong>{prettyDate(poll.chosenStart, poll.timeZone)}</strong>
                <p>
                  {clock(poll.chosenStart, poll.timeZone)} —{" "}
                  {prettyDate(poll.chosenEnd, poll.timeZone)}{" "}
                  {clock(poll.chosenEnd, poll.timeZone)}
                </p>
              </div>
            </div>
          ) : null}
          <ErrorNotice message={error} />
          {notice ? (
            <p className="sw-save-status" role="status">
              <Check size={13} />
              {notice}
            </p>
          ) : null}
          {poll.activitySelection ? (
            <>
              <ActivityIdeas
                activity={poll.activitySelection}
                canEdit={!closed}
                busy={busy}
                zh
                initiallyExpanded
                onSuggest={async (title, location) => {
                  return !!(await action("/activities", "POST", {
                    title,
                    location,
                  }));
                }}
                onInterest={async (ideaId, interested) => {
                  return !!(await action("/activities/interest", "POST", {
                    ideaId,
                    interested,
                  }));
                }}
              />
              {poll.isOwner && poll.activitySelection.isOpen ? (
                <div className="sw-activity-choices">
                  <p className="sw-muted">发邀请前，先确定这次活动：</p>
                  {poll.activitySelection.ideas.map((idea) => (
                    <button
                      key={idea.id}
                      className="sw-button sw-small"
                      disabled={busy}
                      onClick={() =>
                        void action("/activities/choose", "POST", {
                          ideaId: idea.id,
                        })
                      }
                    >
                      选定：{idea.title}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {poll.planningMode !== "FIXED" && poll.phase === "COLLECTING" ? (
            <>
              <AvailabilityEditor
                poll={poll}
                selected={selected}
                onChange={choose}
                onEditingChange={() => undefined}
                disabled={busy || closed}
                zh
              />
              <div className="sw-poll-submit">
                <p>
                  <strong>{selected.length / 4} 小时</strong>
                  <span>
                    {dirty
                      ? "草稿 · 未提交"
                      : poll.didRespond
                        ? "已提交空闲"
                        : "还没有提交空闲"}
                  </span>
                </p>
                <button
                  className="sw-button sw-primary"
                  disabled={busy || (!dirty && poll.didRespond)}
                  onClick={() => void submit()}
                >
                  {busy
                    ? "提交中…"
                    : poll.isOwner && !poll.didRespond
                      ? "提交并分享"
                      : poll.didRespond
                        ? "保存修改"
                        : "提交我的空闲"}
                  <Check size={15} />
                </button>
              </div>
            </>
          ) : null}
          {!poll.isOwner &&
          !closed &&
          ["INVITING", "CONFIRMED"].includes(poll.phase) ? (
            <div className="sw-rsvp">
              <p>
                {mine?.status === "ACCEPTED"
                  ? "你已确认参加。安排将同步到 SideSeat 日历。"
                  : "看清最终时间，确认后才会加入你的 SideSeat 日历。"}
              </p>
              <div className="sw-row">
                <button
                  className="sw-button"
                  disabled={busy || mine?.status === "DECLINED"}
                  onClick={() =>
                    void action("/invitation-response", "PUT", {
                      status: "DECLINED",
                      version: poll.invitationVersion,
                    })
                  }
                >
                  这次不参加
                </button>
                <button
                  className="sw-button sw-primary"
                  disabled={busy || mine?.status === "ACCEPTED"}
                  onClick={() =>
                    void action("/invitation-response", "PUT", {
                      status: "ACCEPTED",
                      version: poll.invitationVersion,
                    })
                  }
                >
                  {mine?.status === "ACCEPTED" ? "已确认参加" : "确认参加"}
                  <Check size={15} />
                </button>
              </div>
            </div>
          ) : null}
        </section>
        <aside className="sw-stack">
          <section className="sw-panel">
            <div className="sw-panel-heading">
              <h2>一起的人</h2>
              <Users size={17} color="#9ba58b" />
            </div>
            {(poll.phase === "COLLECTING"
              ? poll.participants
              : poll.invitations
            ).map((person) => (
              <div key={person.id} className="sw-participant">
                <Avatar name={person.displayName} size="small" />
                <span>
                  {person.displayName}
                  {person.isMe ? "（我）" : ""}
                </span>
                <small>
                  {"status" in person
                    ? (phaseNames[person.status] ??
                      { INVITED: "待确认", SHARED: "已分享" }[person.status] ??
                      person.status)
                    : "已填写"}
                </small>
              </div>
            ))}
            {!poll.participants.length && poll.phase === "COLLECTING" ? (
              <p className="sw-muted">还没有人填写。你可以先选好自己的空闲。</p>
            ) : null}
            <p className="sw-muted" style={{ marginTop: 18 }}>
              填写空闲不等于确认参加。收到最终邀请后，每个人都要明确确认。
            </p>
          </section>
          {poll.isOwner && !closed ? (
            <section className="sw-panel">
              <h2 className="sw-section-title">下一步</h2>
              <p className="sw-muted">
                即使还没有人填写，也可以直接选定最终时间并发出邀请。
              </p>
              <button
                className="sw-button sw-primary"
                style={{ width: "100%", marginTop: 18 }}
                disabled={busy || !!poll.activitySelection?.isOpen}
                onClick={() => {
                  setInvitees(
                    (poll.invitees ?? [])
                      .filter(
                        (person) =>
                          person.didRespond ||
                          poll.invitations.some(
                            (invitation) =>
                              invitation.id === person.id &&
                              invitation.selected,
                          ),
                      )
                      .map((person) => person.id),
                  );
                  setOpenInviteLink(poll.phase === "COLLECTING" || poll.planningMode === "FIXED");
                  setLimitAttendees(poll.planningMode === "FIXED" && poll.expectedCount !== null);
                  setShowFinal(true);
                }}
              >
                <CalendarDays size={15} />
                {poll.chosenStart ? "调整时间与邀请" : "选定时间并邀请"}
              </button>
              {poll.phase === "INVITING" ? (
                <button
                  className="sw-button sw-soft"
                  style={{ width: "100%", marginTop: 10 }}
                  disabled={busy}
                  onClick={() =>
                    void action("/publish", "POST", {
                      version: poll.invitationVersion,
                    })
                  }
                >
                  <Send size={15} />
                  正式发出计划
                </button>
              ) : null}
              <p className="sw-muted" style={{ marginTop: 12 }}>
                正式发出后，仅已确认参加的账号用户会收到日历安排。
              </p>
            </section>
          ) : null}
          <Link href="/web/calendar" className="sw-banner">
            <CalendarDays size={20} />
            <span>确认的安排，在日历里等你。</span>
            <ArrowRight size={15} />
          </Link>
        </aside>
      </div>
      {showShare ? (
        <Modal title="给朋友，留一个位置。" onClose={() => setShowShare(false)}>
          <p className="sw-muted">
            网页链接可让朋友免下载参与。已有 SideSeat
            账号的朋友可以在新版网页端登录后填写。
          </p>
          <Field label="公开计划链接">
            <input
              readOnly
              value={poll.shareUrl}
              onFocus={(event) => event.target.select()}
            />
          </Field>
          <button
            className="sw-button sw-primary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(poll.shareUrl);
                setNotice("计划链接已复制。");
                setShowShare(false);
              } catch {
                setError("无法自动复制，请选中链接手动复制。");
              }
            }}
          >
            <Copy size={15} />
            复制链接
          </button>
          <ErrorNotice
            message={error}
            retry={() => {
              setError("");
              setShowShare(false);
              reload();
            }}
          />
          <div className="sw-line" />
          <h3>直接发给 App 联系人</h3>
          <ErrorNotice message={contacts.error} />
          {contacts.loading ? (
            <Loading />
          ) : (
            (contacts.data?.contacts ?? []).map((person) => (
              <label className="sw-check" key={person.connectionId}>
                <input
                  type="checkbox"
                  checked={contactIds.includes(person.connectionId)}
                  onChange={(event) =>
                    setContactIds((ids) =>
                      event.target.checked
                        ? [...ids, person.connectionId]
                        : ids.filter((id) => id !== person.connectionId),
                    )
                  }
                />
                {person.displayName ||
                  person.nickname ||
                  person.peer?.nickname ||
                  person.username ||
                  person.peer?.username}
              </label>
            ))
          )}
          <div className="sw-form-actions">
            <button
              className="sw-button sw-soft"
              disabled={busy || !contactIds.length}
              onClick={async () => {
                setBusy(true);
                setError("");
                let sent = 0;
                let processed = 0;
                try {
                  // The API accepts up to 19 contacts per request, not per plan.
                  for (let offset = 0; offset < contactIds.length; offset += 19) {
                    const batch = contactIds.slice(offset, offset + 19);
                    const result = await webRequest<{ deliveries: { connectionId: string }[] }>(
                      `/api/v1/time-polls/${poll.token}/contacts`, "POST",
                      { connectionIds: batch, version: poll.invitationVersion },
                    );
                    sent += result.deliveries.length;
                    processed += batch.length;
                  }
                  refreshWebData();
                  reload();
                  setShowShare(false);
                  setNotice(
                    sent === 0
                      ? "这些联系人之前已收到该计划，本次没有重复发送。"
                      : sent < contactIds.length
                        ? `已发送给 ${sent} 位联系人，其余联系人之前已收到该计划。`
                        : "已发送到朋友的 SideSeat 聊天和计划中。",
                  );
                } catch (cause) {
                  refreshWebData();
                  reload();
                  setError(processed
                    ? `已处理 ${processed} 位联系人，其中 ${sent} 位新收到计划。其余发送失败，可重新尝试：${messageOf(cause)}`
                    : messageOf(cause));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Send size={15} />
              发送给所选联系人
            </button>
          </div>
        </Modal>
      ) : null}
      {showFinal ? (
        <Modal
          title="选一个真正见面的时间。"
          onClose={() => setShowFinal(false)}
        >
          <form onSubmit={(event) => void invite(event)}>
            <p className="sw-muted" style={{ marginBottom: 20 }}>
              时间按 {poll.timeZone} 填写，需在候选日期内，以 15 分钟为单位。
            </p>
            <Field label="开始">
              <input
                type="datetime-local"
                step={900}
                name="start"
                required
                defaultValue={initialStart ? formatInTimeZone(
                  initialStart,
                  poll.timeZone,
                  "yyyy-MM-dd'T'HH:mm",
                ) : ""}
              />
            </Field>
            <Field label="结束">
              <input
                type="datetime-local"
                step={900}
                name="end"
                required
                defaultValue={initialEnd ? formatInTimeZone(
                  initialEnd,
                  poll.timeZone,
                  "yyyy-MM-dd'T'HH:mm",
                ) : ""}
              />
            </Field>
            <h3 className="sw-section-title">邀请名单</h3>
            {(poll.invitees ?? []).map((person) => (
              <label key={person.id} className="sw-check">
                <input
                  type="checkbox"
                  disabled={person.isMe}
                  checked={person.isMe || invitees.includes(person.id)}
                  onChange={(event) =>
                    setInvitees((ids) =>
                      event.target.checked
                        ? [...ids, person.id]
                        : ids.filter((id) => id !== person.id),
                    )
                  }
                />
                {person.displayName}
                {person.isMe
                  ? " · 发起人"
                  : person.didRespond
                    ? " · 已填写"
                    : " · 尚未填写"}
              </label>
            ))}
            <label className="sw-check">
              <input
                type="checkbox"
                checked={openInviteLink}
                onChange={(event) => setOpenInviteLink(event.target.checked)}
              />
              允许朋友通过链接加入
            </label>
            {openInviteLink ? (
              <>
                <p className="sw-muted">默认不限参加人数。</p>
                <label className="sw-check">
                  <input
                    type="checkbox"
                    checked={limitAttendees}
                    onChange={(event) => setLimitAttendees(event.target.checked)}
                  />
                  限制参加人数（可选）
                </label>
                {limitAttendees ? (
                  <Field
                    label="最多参加几人（包括你）"
                    hint={`至少 ${minimumAttendees} 人，包含你和已选中的朋友。`}
                  >
                    <input
                      name="capacity"
                      type="number"
                      min={minimumAttendees}
                      defaultValue={Math.max(poll.expectedCount ?? minimumAttendees, minimumAttendees)}
                      required
                    />
                  </Field>
                ) : null}
              </>
            ) : null}
            <ErrorNotice message={error} />
            <div className="sw-form-actions">
              <button
                type="button"
                className="sw-button"
                onClick={() => setShowFinal(false)}
              >
                取消
              </button>
              <button className="sw-button sw-primary" disabled={busy}>
                发送正式邀请
                <Send size={15} />
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {edit ? (
        <Modal title="编辑计划" onClose={() => setEdit(false)}>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const result = await action("/details", "PATCH", {
                title: data.get("title"),
                location: data.get("location"),
              });
              if (result) setEdit(false);
            }}
          >
            <Field label="名称">
              <input
                name="title"
                defaultValue={poll.title}
                required
                maxLength={120}
              />
            </Field>
            <Field label="地点">
              <input
                name="location"
                defaultValue={poll.location ?? ""}
                maxLength={200}
              />
            </Field>
            <ErrorNotice message={error} />
            <div className="sw-form-actions">
              <button
                className="sw-button sw-danger"
                type="button"
                onClick={() => {
                  setEdit(false);
                  setConfirm(poll.invitationVersion > 0 ? "cancel" : "delete");
                }}
              >
                取消或删除计划
              </button>
              <button className="sw-button sw-primary" disabled={busy}>
                保存修改
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {confirm ? (
        <Modal
          title={confirm === "cancel" ? "取消这次计划？" : "删除这个计划？"}
          onClose={() => setConfirm(null)}
        >
          <p className="sw-muted">
            {confirm === "cancel"
              ? "参与者会看到取消结果，相关 SideSeat 日历安排将一并更新。"
              : "这会删除你发起的计划，分享链接也将失效。"}
          </p>
          <ErrorNotice message={error} />
          <div className="sw-form-actions">
            <button className="sw-button" onClick={() => setConfirm(null)}>
              保留计划
            </button>
            <button
              className="sw-button sw-danger"
              disabled={busy}
              onClick={async () => {
                const result = await action(
                  confirm === "cancel" ? "/cancel" : "",
                  confirm === "cancel" ? "POST" : "DELETE",
                  confirm === "cancel"
                    ? { version: poll.invitationVersion }
                    : undefined,
                );
                if (result) router.push("/web/plans");
              }}
            >
              确认{confirm === "cancel" ? "取消" : "删除"}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
