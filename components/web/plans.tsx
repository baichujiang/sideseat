"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
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
import { CollaborationOptions, ownCollaborationChoices } from "@/components/time-polls/collaboration-options";
import { ActivityCreateEditor } from "./activity-create-editor";
import { CollaborativeFinalFields } from "./collaboration-final-fields";
import workspaceStyles from "./collaboration-workspace.module.css";
import type { SharedTimePoll } from "@/lib/time-polls/browser-types";
import {
  clock,
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
    selected?: boolean;
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
function InvitationEditor({ inline, title, onClose, children }: { inline: boolean; title: string; onClose: () => void; children: ReactNode }) {
  if (!inline) return <Modal title={title} onClose={onClose}>{children}</Modal>;
  return <section className={workspaceStyles.inlineInvite}>
    <button type="button" className="sw-text-button" onClick={onClose}><ArrowLeft size={15} />返回活动</button>
    <p className="sw-muted">{title}</p>
    {children}
  </section>;
}
export function PlansPage() {
  const search = useSearchParams();
  const router = useRouter();
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
  if (create) return <ActivityCreateEditor onCancel={() => {
    setCreate(false);
    if (search.has("create")) { const params = new URLSearchParams(search.toString()); params.delete("create"); router.replace(`/web/plans${params.size ? "?" + params : ""}`, { scroll: false }); }
  }} onCreated={token => { refreshWebData(); router.push(`/web/plans/${encodeURIComponent(token)}?share=1`); }} />;
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
  const search = useSearchParams();
  const isCollaboration = !!poll.collaboration;
  const initialSlots = useRef(poll.slots);
  const draftKey = `sideseat:web:availability:${user.id}:${poll.token}`;
  const [selected, setSelected] = useState<number[]>(poll.mySlotIds),
    [dirty, setDirty] = useState(false),
    [restoredDraftKey, setRestoredDraftKey] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [showFinal, setShowFinal] = useState(false),
    [showShare, setShowShare] = useState(poll.isOwner && search.get("share") === "1"),
    [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null),
    [edit, setEdit] = useState(false);
  useEffect(() => {
    if (search.get("share") !== "1") return;
    const params = new URLSearchParams(search.toString()); params.delete("share");
    router.replace(`/web/plans/${poll.token}${params.size ? "?" + params : ""}`, { scroll: false });
  }, [search, router, poll.token]);
  const choiceKey = `sideseat:web:choices:v1:${user.id}:${poll.token}`;
  const initialOptions = useRef(poll.collaboration?.options ?? []);
  const [choiceIds, setChoiceIds] = useState<string[]>(() => ownCollaborationChoices(poll));
  const [choiceDirty, setChoiceDirty] = useState(false);
  const [choicesReady, setChoicesReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(choiceKey);
      if (raw) { const draft = JSON.parse(raw); if (draft.version === 1 && Array.isArray(draft.ids) && draft.ids.every((id: unknown) => typeof id === "string")) { const valid = new Set(initialOptions.current.map(option => option.id)); setChoiceIds(draft.ids.filter((id: string) => valid.has(id))); setChoiceDirty(true); } }
    } catch { setError("浏览器无法恢复选择草稿，请保持页面打开并手动提交。"); }
    setChoicesReady(true);
  }, [choiceKey]);
  useEffect(() => { if (choicesReady && !choiceDirty) setChoiceIds(ownCollaborationChoices(poll)); }, [choicesReady, choiceDirty, poll]);
  function chooseOptions(ids: string[]) {
    const next = [...new Set(ids)].sort(); setChoiceIds(next); setChoiceDirty(true); setNotice("");
    try { localStorage.setItem(choiceKey, JSON.stringify({ version: 1, ids: next })); }
    catch { setError("此浏览器无法保留选择草稿，离开前请手动提交。"); }
  }
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
      .filter((person) => isCollaboration
        ? poll.phase === "COLLECTING" || person.selected
        : person.didRespond)
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
          setNotice("草稿已恢复，尚未提交。");
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
    setNotice("");
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
    setNotice("");
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
    const result = isCollaboration
      ? await action("/preferences", "POST", { optionIds: choiceIds, ...(dirty && poll.collaboration?.time ? { slotIds: selected } : {}) })
      : await action("/response", "PUT", { displayName: poll.myDisplayName || user.nickname || user.username, slotIds: selected });
    if (result) {
      setDirty(false); setChoiceDirty(false);
      try {
        localStorage.removeItem(draftKey); localStorage.removeItem(choiceKey);
      } catch {
        /* server acknowledgement remains authoritative */
      }
      setNotice("");
      if (!isCollaboration && poll.isOwner && !poll.didRespond) setShowShare(true);
      if (isCollaboration) setNotice("选择已提交。");
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
      ...(isCollaboration ? { arrangement: { title: String(form.get("title") ?? "").trim(), activityType: String(form.get("activityType") ?? "").trim(), location: String(form.get("location") ?? "").trim() } } : {}),
      ...(openInviteLink
        ? { linkParticipantCount: limitAttendees ? Number(form.get("capacity")) : isCollaboration ? 20 : null }
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
  const canInvite = poll.isOwner && !closed && ["COLLECTING", "INVITING"].includes(poll.phase);
  const minimumAttendees = Math.max(
    2,
    1 + invitees.filter((id) => !poll.invitees?.some((person) => person.id === id && person.isMe)).length,
  );
  return (
    <>
      {(!isCollaboration || !showFinal) ? <div className={isCollaboration ? workspaceStyles.heading : undefined}><PageHeading
        title={poll.title}
        description={isCollaboration ? undefined : [poll.location, poll.timeZone].filter(Boolean).join(" · ")}
      >
        <button className="sw-button" onClick={() => setShowShare(true)}>
          <Copy size={15} />
          分享计划
        </button>
        {poll.isOwner && !closed ? (
          <button
            className={isCollaboration && poll.phase !== "COLLECTING" ? "sw-text-button" : "sw-icon-button"}
            aria-label={isCollaboration && poll.phase !== "COLLECTING" ? "取消计划" : "编辑计划"}
            onClick={() => isCollaboration && poll.phase !== "COLLECTING" ? setConfirm("cancel") : setEdit(true)}
          >
            {isCollaboration && poll.phase !== "COLLECTING" ? "取消计划" : "···"}
          </button>
        ) : null}
      </PageHeading></div> : null}
      <div className={"sw-grid sw-poll-layout " + (isCollaboration ? workspaceStyles.workspace : "")} hidden={isCollaboration && showFinal}>
        <section className="sw-panel">
          <div className="sw-panel-heading">
            <div>
              <h2>
                {poll.phase === "COLLECTING"
                  ? "收集空闲时间"
                  : poll.phase === "INVITING"
                    ? "拟定时间，待确认"
                    : poll.phase === "CONFIRMED"
                      ? "这次，我们约好了。"
                      : poll.phase === "CANCELLED"
                        ? "计划已取消"
                        : poll.phase === "EXPIRED"
                          ? "计划已过期"
                          : "计划详情"}
              </h2>
            </div>
            {!poll.chosenStart ? <span className="sw-muted">
              {poll.dates[0]?.slice(5)}{poll.dates.length > 1 ? ` — ${poll.dates.at(-1)?.slice(5)}` : ""}
            </span> : null}
          </div>
          {isCollaboration && poll.phase !== "COLLECTING" ? <dl className={workspaceStyles.arrangement}>
            <div><dt>活动</dt><dd>{poll.collaboration?.activityType || poll.title}</dd></div><div><dt>地点</dt><dd>{poll.location || "地点稍后通知"}</dd></div>
          </dl> : null}
          {poll.chosenStart && poll.chosenEnd ? (
            <div className="sw-confirmed-time">
              <CalendarCheck2 size={30} strokeWidth={1.3} />
              <div>
                <strong>{prettyDate(poll.chosenStart, poll.timeZone)}</strong>
                <p>
                  {clock(poll.chosenStart, poll.timeZone)} —{" "}
                  {formatInTimeZone(poll.chosenStart, poll.timeZone, "yyyy-MM-dd") !== formatInTimeZone(poll.chosenEnd, poll.timeZone, "yyyy-MM-dd") ? prettyDate(poll.chosenEnd, poll.timeZone) + " " : ""}
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
          {isCollaboration && poll.phase === "COLLECTING" ? <CollaborationOptions poll={poll} selected={choiceIds} onChange={chooseOptions} disabled={busy} zh onSuggest={async (kind, value) => {
            const result = await action("/options", "POST", { kind, value });
            const added = result?.collaboration?.options.find(option => option.kind === kind && option.value === value && option.isMine);
            if (added) chooseOptions([...choiceIds, added.id]);
            return !!result;
          }} /> : null}
          {!isCollaboration && poll.activitySelection ? (
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
                  <h3 className="sw-section-title">选定活动</h3>
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
                      选择「{idea.title}」
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {(isCollaboration ? poll.collaboration?.time : poll.planningMode !== "FIXED") && poll.phase === "COLLECTING" ? (
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
                        : "未提交"}
                  </span>
                </p>
                <button
                  className={"sw-button " + (isCollaboration && poll.isOwner ? "" : "sw-primary")}
                  disabled={busy || (!dirty && !choiceDirty && (poll.didRespond || (isCollaboration && poll.invitations.some(person => person.isMe))))}
                  onClick={() => void submit()}
                >
                  {busy
                    ? "提交中…"
                    : !isCollaboration && poll.isOwner && !poll.didRespond
                      ? "提交并分享"
                      : poll.didRespond
                        ? "保存修改"
                        : isCollaboration ? "提交我的选择" : "提交我的空闲"}
                  <Check size={15} />
                </button>
              </div>
            </>
          ) : null}
          {isCollaboration && !poll.collaboration?.time && poll.phase === "COLLECTING" ? <div className="sw-poll-submit"><span className="sw-muted">{choiceDirty ? "选择尚未提交" : "未选择的项目视为未表态"}</span><button className="sw-button" disabled={busy || (!choiceDirty && poll.invitations.some(person => person.isMe))} onClick={() => void submit()}>提交我的选择</button></div> : null}
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
          {isCollaboration ? <details className={workspaceStyles.responses}><summary>参与回复 · {(poll.phase === "COLLECTING" ? poll.invitees ?? [] : poll.invitations).length} 人</summary>{(poll.phase === "COLLECTING" ? poll.invitees ?? [] : poll.invitations).map(person => <div key={person.id} className="sw-participant"><span>{person.displayName}{person.isMe ? "（我）" : ""}</span><small>{"status" in person ? (({ INVITED: "待回复", ACCEPTED: "已确认参加", DECLINED: "已婉拒", SHARED: "未受邀" } as Record<string, string>)[person.status] ?? person.status) : person.didRespond ? "已提交空闲" : "参与商量"}</small></div>)}</details> : <section className="sw-panel">
            <div className="sw-panel-heading">
              <h2>{poll.phase === "COLLECTING" ? "空闲提交" : "邀请回复"}</h2>
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
                    ? (({ INVITED: "待回复", ACCEPTED: "已确认参加", DECLINED: "已婉拒", SHARED: "未受邀" } as Record<string, string>)[person.status] ?? person.status)
                    : "已提交"}
                </small>
              </div>
            ))}
            {!poll.participants.length && poll.phase === "COLLECTING" ? (
              <p className="sw-muted">暂无提交</p>
            ) : null}
          </section>}
          {canInvite ? (
            <section className="sw-panel sw-stack" aria-label="计划操作">
              {isCollaboration || poll.phase === "COLLECTING" || poll.planningMode !== "FIXED" ? (
              <button
                className={`sw-button ${poll.phase === "COLLECTING" ? "sw-primary" : ""}`}
                style={{ width: "100%" }}
                disabled={busy || (!isCollaboration && !!poll.activitySelection?.isOpen)}
                onClick={() => {
                  setInvitees(
                    (poll.invitees ?? [])
                      .filter(
                        (person) =>
                          (isCollaboration ? poll.phase === "COLLECTING" || person.selected : person.didRespond || poll.invitations.some(
                            (invitation) =>
                              invitation.id === person.id &&
                              invitation.selected,
                          )),
                      )
                      .map((person) => person.id),
                  );
                  setOpenInviteLink(poll.phase === "COLLECTING" || poll.planningMode === "FIXED");
                  setLimitAttendees(poll.planningMode === "FIXED" && poll.expectedCount !== null && (!isCollaboration || poll.expectedCount < 20));
                  setShowFinal(true);
                }}
              >
                <CalendarDays size={15} />
                {isCollaboration ? poll.phase === "INVITING" ? "修改最终安排" : "确认最终安排" : poll.activitySelection?.isOpen ? "选定活动后邀请" : poll.phase === "INVITING" ? "修改邀请" : poll.chosenStart ? "设置邀请" : "设置时间与邀请"}
              </button>
              ) : null}
              {poll.phase === "INVITING" ? (
                <button
                  className="sw-button sw-primary"
                  style={{ width: "100%" }}
                  disabled={busy}
                  onClick={() =>
                    void action("/publish", "POST", {
                      version: poll.invitationVersion,
                    })
                  }
                >
                  <Send size={15} />
                  {isCollaboration ? "确认并发布" : "发布最终计划"}
                </button>
              ) : null}
              {poll.phase === "INVITING" ? <p className="sw-muted">
                仅已确认参加的账号用户会同步日历。
              </p> : null}
            </section>
          ) : null}
          <Link href="/web/calendar" className="sw-banner">
            <CalendarDays size={20} />
            <span>查看日历</span>
            <ArrowRight size={15} />
          </Link>
        </aside>
      </div>
      {showShare ? (
        <Modal title="分享计划" onClose={() => setShowShare(false)}>
          <Field label="计划链接">
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
          {poll.isOwner && !closed ? <>
          <div className="sw-line" />
          <h3>分享给联系人</h3>
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
                      ? "所选联系人已收到计划。"
                      : sent < contactIds.length
                        ? `已发送给 ${sent} 人，其余人已收到。`
                        : `已发送给 ${sent} 位联系人。`,
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
              发送计划卡片
            </button>
          </div>
          </> : null}
        </Modal>
      ) : null}
      {showFinal ? (
        <InvitationEditor inline={isCollaboration}
          title={isCollaboration ? "确认完整活动安排" : poll.phase === "INVITING" ? "修改邀请" : poll.planningMode === "FIXED" ? "设置邀请" : "设置时间与邀请"}
          onClose={() => setShowFinal(false)}
        >
          <form onSubmit={(event) => void invite(event)}><fieldset disabled={busy} className={workspaceStyles.fieldset}>
            {isCollaboration ? <CollaborativeFinalFields poll={poll} /> : null}
            <p className="sw-muted" style={{ marginBottom: 20 }}>
              {poll.timeZone} · 仅限候选日期 · 15 分钟为单位
            </p>
            {poll.invitationVersion > 0 ? <p className="sw-muted">修改后，参与者需要重新确认。</p> : null}
            <Field label="开始时间">
              <input
                type="datetime-local"
                step={900}
                name="start"
                readOnly={poll.planningMode === "FIXED" && !isCollaboration}
                required
                defaultValue={initialStart ? formatInTimeZone(
                  initialStart,
                  poll.timeZone,
                  "yyyy-MM-dd'T'HH:mm",
                ) : ""}
              />
            </Field>
            <Field label="结束时间">
              <input
                type="datetime-local"
                step={900}
                name="end"
                readOnly={poll.planningMode === "FIXED" && !isCollaboration}
                required
                defaultValue={initialEnd ? formatInTimeZone(
                  initialEnd,
                  poll.timeZone,
                  "yyyy-MM-dd'T'HH:mm",
                ) : ""}
              />
            </Field>
            {poll.invitees?.length ? <h3 className="sw-section-title">邀请名单</h3> : null}
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
                    ? " · 已提交空闲"
                    : " · 未提交空闲"}
              </label>
            ))}
            <label className="sw-check">
              <input
                type="checkbox"
                checked={openInviteLink}
                onChange={(event) => setOpenInviteLink(event.target.checked)}
              />
              允许通过链接参加
            </label>
            {openInviteLink ? (
              <>
                <p className="sw-muted">{isCollaboration ? "系统最多 20 人，可按需设置更小的上限。" : "不设人数上限"}</p>
                <label className="sw-check">
                  <input
                    type="checkbox"
                    checked={limitAttendees}
                    onChange={(event) => setLimitAttendees(event.target.checked)}
                  />
                  自定人数上限
                </label>
                {limitAttendees ? (
                  <Field
                    label="人数上限（含你）"
                    hint={`至少 ${minimumAttendees} 人`}
                  >
                    <input
                      name="capacity"
                      type="number"
                      min={minimumAttendees}
                      max={isCollaboration ? 20 : undefined}
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
                {busy ? "发送中…" : isCollaboration ? poll.phase === "INVITING" ? "更新安排，重新确认" : "确认内容并发送邀请" : poll.phase === "INVITING" ? "重新发送邀请" : "发送邀请"}
                <Send size={15} />
              </button>
            </div>
          </fieldset></form>
        </InvitationEditor>
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
            <Field label="计划名称">
              <input
                name="title"
                defaultValue={poll.title}
                required
                maxLength={120}
              />
            </Field>
            <Field label="地点（选填）">
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
                {poll.invitationVersion > 0 ? "取消计划" : "删除计划"}
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
          title={confirm === "cancel" ? "取消计划？" : "删除计划？"}
          onClose={() => setConfirm(null)}
        >
          <p className="sw-muted">
            {confirm === "cancel"
              ? "链接仍可查看取消状态，日历安排将移除。"
              : "计划将被删除，分享链接随即失效。"}
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
