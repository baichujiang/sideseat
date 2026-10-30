"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, Check, Clock3, Copy, MapPin, Pencil, Sparkles } from "lucide-react";
import { AvailabilityEditor } from "./availability-editor";
import { CollaborationOptions } from "./collaboration-options";
import type { useSharedTimePoll } from "./use-shared-time-poll";
import { POLL_LOCALE_COOKIE, pollClock, pollDate } from "@/lib/time-polls/browser-types";
import styles from "./collaborative-shared-plan.module.css";

export function CollaborativeSharedPlan({ token, state, zh, setZh, recoveryPage }: {
  token: string; state: ReturnType<typeof useSharedTimePoll>; zh: boolean; setZh: (value: boolean) => void; recoveryPage: boolean;
}) {
  const poll = state.poll!;
  const collaboration = poll.collaboration!;
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState(false);
  const [copiedFor, setCopiedFor] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const pendingName = !poll.viewerId || state.switchingParticipant;
  const disabled = state.busy || state.saving;
  const collecting = poll.phase === "COLLECTING";
  const closed = ["CANCELLED", "EXPIRED"].includes(poll.phase) || (poll.phase === "CONFIRMED" && !!poll.chosenStart && Date.parse(poll.chosenStart) <= Date.now());
  const mine = state.switchingParticipant ? undefined : poll.invitations.find(person => person.isMe);
  const occupied = poll.invitations.filter(person => person.selected).length;
  const remaining = poll.expectedCount === null ? null : Math.max(0, poll.expectedCount - occupied);
  const openLink = poll.planningMode === "FIXED" && (remaining === null || remaining > 0);
  const full = !mine?.selected && poll.planningMode === "FIXED" && remaining === 0;
  const canReply = !collecting && !closed && (mine?.selected || openLink);
  const dirty = state.hasChanges || state.preferencesDirty;
  const editorPoll = state.switchingParticipant ? { ...poll, viewerId: null, mySlotIds: [], didRespond: false, participants: poll.participants.map(person => ({ ...person, isMe: false })) } : poll;
  function requireName() {
    if (!pendingName || name.trim()) return true;
    setNameError(true); input.current?.focus(); return false;
  }
  function dateOf(instant: string) {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: poll.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(instant));
    return ["year", "month", "day"].map(key => parts.find(part => part.type === key)?.value).join("-");
  }
  const time = poll.chosenStart && poll.chosenEnd ? `${pollDate(dateOf(poll.chosenStart), zh)} · ${pollClock(poll.chosenStart, poll.timeZone)}–${dateOf(poll.chosenStart) !== dateOf(poll.chosenEnd) ? pollDate(dateOf(poll.chosenEnd), zh) + " · " : ""}${pollClock(poll.chosenEnd, poll.timeZone)}` : "";
  const phase = poll.phase === "CANCELLED" ? (zh ? "计划已取消" : "Plan cancelled") : poll.phase === "EXPIRED" ? (zh ? "计划已过期" : "Plan expired") : poll.phase === "CONFIRMED" ? (zh ? "发起人已确认发布" : "Published by organizer") : collecting ? (zh ? "一起商量" : "Choose together") : (zh ? "发起人已选定安排" : "Arrangement chosen by organizer");
  return <main lang={zh ? "zh-CN" : "en"} className={styles.page}>
    <div className={styles.content}>
      <header className={styles.header}>
        <Link href="/ios" className={styles.brand}><Image src="/icons/app-icon.png" width={29} height={29} alt="" />SideSeat</Link>
        <nav aria-label={zh ? "参与方式" : "Participation options"}>
          <button type="button" onClick={() => { setZh(!zh); document.cookie = `${POLL_LOCALE_COOKIE}=${zh ? "en" : "zh-CN"}; Path=/time-polls; Max-Age=31536000; SameSite=Lax`; }}>{zh ? "English" : "中文"}</button>
          {!recoveryPage ? <><a href={`sideseat://time-polls/${encodeURIComponent(token)}`}>App<ArrowUpRight size={13} aria-hidden /></a><Link href={`/web/plans/${encodeURIComponent(token)}`}>{zh ? "用账号参与" : "Sign in"}<ArrowUpRight size={13} aria-hidden /></Link></> : null}
        </nav>
      </header>
      <div className={styles.intro}><span>{phase}</span><h1>{poll.title}</h1>{collecting ? <p>{zh ? "选你倾向的，可多选。最后由发起人确认。" : "Choose your preferences. The organizer decides the final arrangement."}</p> : null}</div>
      {state.error ? <p className={styles.error} role="alert">{state.error}</p> : null}
      {!closed ? pendingName || state.editingName ? <div className={styles.identity}>
        <label htmlFor="collaboration-name">{zh ? "你的名字" : "Your name"}</label>
        <input ref={input} id="collaboration-name" maxLength={60} autoComplete="nickname" value={name} aria-invalid={nameError} aria-describedby={nameError ? "collaboration-name-error" : undefined} placeholder={zh ? "填写名字" : "Your name"} onChange={event => { setName(event.target.value); setNameError(false); }} />
        {state.editingName ? <button type="button" disabled={disabled || !name.trim()} onClick={() => void state.rename(name.trim())}>{zh ? "保存名字" : "Save name"}</button> : null}
        {poll.viewerId ? <button type="button" disabled={disabled} onClick={state.cancelNameEditing}>{zh ? "取消" : "Cancel"}</button> : null}
        {nameError ? <p id="collaboration-name-error" className={styles.error} role="alert">{zh ? "请先填写名字。" : "Please enter your name."}</p> : null}
        {poll.legacyGuestNeedsRecovery ? <p>{zh ? "请使用个人恢复链接找回旧记录。" : "Use your personal recovery link for an earlier response."}</p> : null}
      </div> : <div className={styles.identity}>
        <span>{poll.myDisplayName}</span><button type="button" disabled={disabled} aria-label={zh ? "编辑昵称" : "Edit nickname"} onClick={() => { setName(poll.myDisplayName); state.setEditingName(true); }}><Pencil size={13} aria-hidden />{zh ? "改名字" : "Edit name"}</button><button type="button" disabled={disabled} onClick={() => { setName(""); state.startSwitchingParticipant(); setNotice(""); }}>{zh ? "其他人填写" : "Create another response"}</button>
        {state.resumed ? <p role="status">{zh ? "已恢复填写" : "Response restored"}</p> : null}
      </div> : null}

      {collecting ? <>
        <CollaborationOptions poll={poll} selected={state.optionIds} onChange={ids => { state.saveOptionSelection(ids); setNotice(""); }} disabled={disabled || state.editingName} zh={zh} onSuggest={async (kind, value) => {
          if (!requireName()) return false;
          const result = await state.suggestOption(kind, value, name);
          if (result) setNotice(zh ? "提议已添加" : "Suggestion added");
          return result;
        }} />
        <section className={styles.time}>
          <h2><CalendarDays size={16} aria-hidden />{collaboration.time ? (zh ? "什么时候有空？" : "When are you free?") : (zh ? "活动时间" : "Activity time")}</h2>
          {collaboration.time ? <AvailabilityEditor poll={editorPoll} selected={state.selected} onChange={ids => { state.saveSelection(ids); setNotice(""); }} onEditingChange={state.setEditingAvailability} disabled={disabled || state.editingName} zh={zh} /> : <p className={styles.fixed}>{time}<small>{poll.timeZone}</small></p>}
        </section>
      </> : <dl className={styles.arrangement}>
        <div><dt><Sparkles size={15} aria-hidden />{zh ? "活动" : "Activity"}</dt><dd>{collaboration.activityType || poll.title}</dd></div>
        <div><dt><MapPin size={15} aria-hidden />{zh ? "地点" : "Place"}</dt><dd>{poll.location || (zh ? "地点稍后通知" : "To be announced")}</dd></div>
        {time ? <div><dt><Clock3 size={15} aria-hidden />{zh ? "时间" : "Time"}</dt><dd>{time}<small>{poll.timeZone}</small></dd></div> : null}
      </dl>}

      {!pendingName && poll.viewerId ? <details className={styles.recovery} data-testid="guest-recovery-panel">
        <summary>{zh ? "保存恢复链接" : "Save recovery link"}</summary>
        <p>{zh ? "换设备可恢复已提交的填写。此链接可修改你的记录，请勿转发。未提交草稿仅保存在当前浏览器。" : "Restore submitted responses on another device. Keep this editing link private. Unsubmitted drafts remain in this browser."}</p>
        <button type="button" data-testid="guest-recovery-copy" disabled={disabled} onClick={async () => { const link = await state.loadRecoveryLink(); if (link) { try { await navigator.clipboard.writeText(link); setCopiedFor(poll.viewerId); } catch { setCopiedFor(null); } } }}><Copy size={14} aria-hidden />{copiedFor === poll.viewerId ? (zh ? "已复制" : "Copied") : (zh ? "复制恢复链接" : "Copy recovery link")}</button>
        {state.recoveryLink && copiedFor !== poll.viewerId ? <input aria-label={zh ? "个人恢复链接" : "Personal recovery link"} readOnly value={state.recoveryLink} onFocus={event => event.target.select()} /> : null}
      </details> : collecting && !closed ? <details className={styles.recovery}><summary>{zh ? "恢复之前的填写" : "Restore an earlier response"}</summary><p>{zh ? "用个人恢复链接继续；同名不会自动恢复记录。" : "Use your personal recovery link. A matching name does not restore a response."}</p></details> : null}
      {notice ? <p className={styles.saved} role="status"><Check size={14} aria-hidden />{notice}</p> : null}

      {collecting && !closed ? <footer className={styles.actions}>
        <div><p role="status">{state.saving ? (zh ? "提交中…" : "Submitting…") : state.submissionFailed ? (zh ? "提交失败，选择仍保留" : "Could not submit; your choices are kept") : state.preferencesSaved ? (zh ? "已提交选择" : "Preferences submitted") : state.restoredDraft ? (zh ? "草稿已恢复 · 未提交" : "Draft restored · not submitted") : (zh ? "未提交" : "Not submitted")}</p><small>{zh ? "未选择的项目视为未表态" : "Unselected items mean no preference"}</small></div>
        <button type="button" data-testid="availability-submit" className={styles.primary} disabled={disabled || state.editingName || (!dirty && state.preferencesSaved)} onClick={async () => { if (requireName() && await state.submitPreferences(name)) setNotice(""); }}>{state.saving ? (zh ? "提交中…" : "Submitting…") : state.preferencesSaved || poll.didRespond ? (zh ? "保存我的修改" : "Save my changes") : (zh ? "提交我的选择" : "Submit my preferences")}</button>
      </footer> : canReply ? <footer className={styles.actions}>
        <div><p role="status">{mine?.status === "ACCEPTED" ? (zh ? "已确认参加" : "You're attending") : mine?.status === "DECLINED" ? (zh ? "已回复不参加" : "Declined") : (zh ? "确认这份完整安排" : "Confirm this complete arrangement")}</p><small>{poll.phase === "CONFIRMED" ? (zh ? "计划已发布" : "Plan published") : mine?.status === "DECLINED" ? (zh ? "可随时修改回复" : "You can change your reply") : (zh ? "等待发起人发布" : "Awaiting publication by organizer")}</small></div>
        <div className={styles.reply}><button type="button" disabled={disabled || mine?.status === "DECLINED"} onClick={() => { if (requireName()) void state.reply("DECLINED", name); }}>{mine?.status === "ACCEPTED" ? (zh ? "取消参加" : "Cancel attendance") : (zh ? "这次不参加" : "Decline")}</button>{mine?.status !== "ACCEPTED" ? <button type="button" className={styles.primary} disabled={disabled || state.editingName} onClick={() => { if (requireName()) void state.reply("ACCEPTED", name); }}>{zh ? "确认参加" : "Confirm participation"}</button> : null}</div>
      </footer> : full && !closed ? <p className={styles.error} role="status">{zh ? "当前名额已满，请联系发起人。" : "The plan is full. Contact the organizer."}</p> : null}
      <div className={styles.links}><Link href="/privacy">{zh ? "隐私" : "Privacy"}</Link><Link href="/support">{zh ? "帮助" : "Support"}</Link></div>
    </div>
  </main>;
}
