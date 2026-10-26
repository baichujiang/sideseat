"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, Check, CheckCircle2, Circle, Clock3, Loader2, MapPin, Pencil, Users, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvitationTimetable } from "@/components/time-polls/invitation-timetable";
import { AvailabilityEditor } from "@/components/time-polls/availability-editor";
import { ActivityIdeas } from "@/components/time-polls/activity-ideas";
import { useSharedTimePoll } from "@/components/time-polls/use-shared-time-poll";
import styles from "./shared-time-poll.module.css";
import { POLL_LOCALE_COOKIE, pollClock, pollDate } from "@/lib/time-polls/browser-types";

export function SharedTimePoll({ token, zh: initialZh, recoveryPage = false }: { token: string; zh: boolean; recoveryPage?: boolean }) {
  const [zh, setZh] = useState(initialZh);
  const state = useSharedTimePoll(token);
  const { poll, error, busy, saving, saved, selected, editingName, switchingParticipant, resumed } = state;
  const [name, setName] = useState("");
  const [deferred, setDeferred] = useState(false);
  const [copiedRecoveryID, setCopiedRecoveryID] = useState<string | null>(null);
  const table = useRef<HTMLElement>(null);
  const collecting = poll?.phase === "COLLECTING";
  const fixedTime = poll?.planningMode === "FIXED" && !!poll.chosenStart && !!poll.chosenEnd;
  const choosingActivity = collecting && poll?.activitySelection?.isOpen === true;
  const closed = poll?.phase === "CANCELLED" || poll?.phase === "EXPIRED" || (poll?.phase === "CONFIRMED" && !!poll.chosenStart && Date.parse(poll.chosenStart) <= Date.now());
  const mine = poll?.invitations.find((person) => person.isMe);
  const accepted = poll?.invitations.filter((person) => person.selected && person.status === "ACCEPTED").length ?? 0;
  const occupied = poll?.invitations.filter((person) => person.selected).length ?? 0;
  const target = poll?.planningMode === "FIXED" ? poll.expectedCount ?? 2 : occupied;
  const remaining = Math.max(0, target - occupied);
  const fullForViewer = poll?.planningMode === "FIXED" && !mine?.selected && remaining === 0;
  const included = mine?.selected || (poll?.planningMode === "FIXED" && remaining > 0);
  const fullMessage = zh ? "当前名额已满，请联系发起人。" : "This plan is full. Contact the organizer.";
  const people = collecting || (poll?.phase === "EXPIRED" && !poll.chosenStart) ? poll.participants : poll?.invitations;
  const disabled = busy || saving;
  const choosingName = !poll?.viewerId || editingName || switchingParticipant;
  const viewerId = poll?.viewerId;
  const recoveryCopied = !!viewerId && copiedRecoveryID === viewerId;
  useEffect(() => {
    if ((collecting || poll?.phase === "INVITING") && viewerId && !choosingName && poll?.didRespond) table.current?.scrollIntoView({ block: "start" });
  }, [collecting, viewerId, choosingName, poll?.phase, poll?.invitationVersion, poll?.didRespond]);
  const errorText = zh && error === "This device could not keep your draft. Keep this page open until you submit." ? "此设备无法保留草稿，请保持页面打开并手动提交。" : zh && error === "This recovery link is invalid or has been replaced. Use your personal recovery link."
    ? "这个恢复链接无效或已被替换，请使用你保存的个人恢复链接。" : zh && error === "Use your personal recovery link to restore your response."
    ? "请使用个人恢复链接恢复你的填写。" : error;
  const editing = collecting && !fixedTime && !!poll?.viewerId && !choosingName;
  const replying = (poll?.phase === "INVITING" || poll?.phase === "CONFIRMED") && !closed && !!poll.viewerId && included && !choosingName;
  const selectedSlots = poll?.slots.filter((slot) => selected.includes(slot.id)) ?? [];
  const selectedDays = new Set(selectedSlots.map((slot) => slot.date)).size;
  const selectedHours = new Intl.NumberFormat(zh ? "zh-CN" : "en", { maximumFractionDigits: 2 }).format(selectedSlots.reduce((sum, slot) => sum + (Date.parse(slot.end) - Date.parse(slot.start)) / 3600000, 0));
  const failed = state.submissionFailed && !saving;
  const saveTitle = saving ? (zh ? "提交中…" : "Submitting…") : failed ? (zh ? "提交失败" : "Couldn't submit") : poll?.didRespond && saved ? (zh ? "已提交空闲" : "Availability submitted") : state.restoredDraft ? (zh ? "已恢复草稿 · 未提交" : "Draft restored · not submitted") : (zh ? "未提交" : "Not submitted");
  const formatWindow = (start: string, end: string) => {
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: poll!.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    const first = formatter.format(new Date(start)), last = formatter.format(new Date(end));
    return pollDate(first, zh) + " · " + pollClock(start, poll!.timeZone) + "–" + (first === last ? "" : pollDate(last, zh) + " · ") + pollClock(end, poll!.timeZone);
  };
  const currentTask = fullForViewer && !closed ? fullMessage : choosingName
    ? recoveryPage
      ? (zh ? "填个名字，以网页访客参与。" : "Enter your name to join as a web guest.")
      : (zh ? "已有 App？点右上角「打开 App」使用原账号；也可以填名字，以网页访客参与。" : "Have the app? Open it above to use your account, or enter your name to join as a web guest.")
    : collecting
      ? fixedTime
        ? (zh ? "时间已定，展开活动建议，一起决定做什么；收到正式邀请后再确认参加。" : "The time is set. Open activity ideas to choose what to do; confirm attendance after the formal invitation.")
        : choosingActivity
        ? (zh ? "活动还没定，也可以先填空闲。展开活动建议，一起决定做什么。" : "Share free time now, even while choosing what to do. Open activity ideas to suggest or mark interest.")
        : (zh ? "在时间表里选好空闲并提交，收到最终邀请后再确认参加。" : "Select free time and submit it. Confirm participation when the final invitation arrives.")
      : replying && mine?.status !== "ACCEPTED"
        ? (zh ? "看清高亮的最终时段，再确认参加。" : "Review the highlighted final time, then confirm participation.")
        : (zh ? "在这里查看最新安排和确认进度。" : "See the latest arrangement and confirmation progress here.");

  return <main lang={zh ? "zh-CN" : "en"} className={styles.page + " min-h-dvh px-4 pt-4 sm:px-6 " + (editing || replying ? "pb-60" : "pb-12")}>
    <div className="mx-auto max-w-4xl lg:max-w-[1440px]">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <Link href="/ios" className="flex items-center gap-2 font-semibold"><Image src="/icons/app-icon.png" width={30} height={30} alt="" className="rounded-lg" />SideSeat</Link>
        <div className="flex items-center gap-2">
          <button type="button" className="min-h-11 text-sm" aria-label={zh ? "Switch to English" : "切换为中文"} onClick={() => { const next = !zh; setZh(next); document.cookie = POLL_LOCALE_COOKIE + "=" + (next ? "zh-CN" : "en") + "; Path=/time-polls; Max-Age=31536000; SameSite=Lax"; }}>{zh ? "English" : "中文"}</button>
          {!recoveryPage ? <a href={"sideseat://time-polls/" + encodeURIComponent(token)} className={styles.actionLink + " inline-flex min-h-11 items-center gap-1 text-sm"}>{zh ? "打开 App" : "Open app"}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></a> : null}
        </div>
      </header>
      {!poll ? <section className="rounded-2xl border bg-background p-6" aria-live="polite">
        <h1 className="text-2xl font-semibold">{error ? (zh ? "暂时无法打开计划" : "Plan unavailable") : (zh ? "正在打开计划…" : "Opening your plan…")}</h1>
        {error ? <p className="mt-3 text-sm text-muted-foreground">{error}</p> : null}
      </section> : <>
        <section className="mb-4 border-b pb-5" aria-label={zh ? "计划信息" : "Plan details"}>
          <p className="mb-2 text-xs font-medium text-muted-foreground">{choosingActivity ? (zh ? "朋友想和你一起决定做什么" : "A friend wants to choose an activity with you") : collecting ? (zh ? "朋友想和你找个合适的时间" : "A friend wants to find a time with you") : (zh ? "朋友发来的活动安排" : "An activity shared by a friend")}</p>
          <h1 className="break-words text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">{poll.title}</h1>
          {collecting && !fixedTime ? <>
            {poll.location ? <p className="mt-3 flex items-start gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /><span className="min-w-0 break-words">{poll.location}</span></p> : null}
            <div className="mt-3" data-testid="plan-collection-metadata">
              <p className="flex items-start gap-2 text-sm" data-testid="time-poll-date-range"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /><span className="min-w-0 break-words">{(zh ? "候选日期：" : "Possible days: ") + pollDate(poll.dates[0], zh) + (poll.dates.length > 1 ? " – " + pollDate(poll.dates.at(-1)!, zh) : "")}</span></p>
              <p className="mt-1 flex items-start gap-2 text-xs leading-5 text-muted-foreground" data-testid="plan-display-status"><span className="mt-[7.5px] h-[5px] w-[5px] shrink-0 rounded-full bg-current" aria-hidden /><span className="min-w-0 break-words">{choosingActivity ? (zh ? "选择活动" : "Choosing an activity") : (zh ? "收集空闲" : "Collecting availability")} · {poll.timeZone}</span></p>
            </div>
          </> : <>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /><span>{(!collecting || fixedTime) && poll.chosenStart && poll.chosenEnd ? formatWindow(poll.chosenStart, poll.chosenEnd) : (zh ? "候选日期：" : "Possible days: ") + pollDate(poll.dates[0], zh) + (poll.dates.length > 1 ? " – " + pollDate(poll.dates.at(-1)!, zh) : "")}</span></p>
              {poll.location ? <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /><span className="break-words">{poll.location}</span></p> : null}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{zh ? "时区：" : "Time zone: "}{poll.timeZone}</p>
          </>}
        </section>

        {!closed ? <p className="mb-5 text-sm leading-6 text-muted-foreground" role="status" data-testid="plan-next-step">{currentTask}</p> : null}

        {error ? <div role="alert" className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-stone-900">{errorText}{!saved && !editing ? <button type="button" disabled={saving} onClick={() => void state.retry()} className="ml-3 min-h-11 underline">{zh ? "重试保存" : "Retry save"}</button> : null}</div> : null}
        <div className={"grid grid-cols-1 items-start gap-5 " + (collecting && fixedTime ? "" : "md:grid-cols-[minmax(0,1fr)_minmax(240px,0.7fr)] lg:grid-cols-[minmax(0,1fr)_224px]")}>
          <div className="min-w-0 space-y-4">
            {!closed ? choosingName ? <section className="rounded-2xl border bg-background p-5 sm:p-6">
              <h2 className="text-xl font-semibold">{editingName ? (zh ? "修改这次活动中的名字" : "Edit your name for this activity") : collecting ? (zh ? "先告诉朋友你是谁" : "First, tell your friends who you are") : (zh ? "填个名字，再确认参加" : "Enter your name, then confirm")}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{fixedTime && collecting ? (zh ? "填个名字，就能提出活动或标记兴趣。时间已定，无需再填写空闲。" : "Enter your name to suggest activities or mark interest. The time is set; no availability form is needed.") : choosingActivity ? (zh ? "填个名字，就能提出活动、标记兴趣；空闲也能提前填写。" : "Enter your name to suggest activities and mark interest. You can share free time too.") : collecting ? (zh ? "接下来勾选你有空的时间，最终活动时间之后再确认。" : "Next, mark when you're free. You'll confirm the final activity time later.") : (zh ? "无需注册或下载 App，就能在这里回复邀请。" : "Reply here without an account or app download.")}</p>
              <form onSubmit={(event) => { event.preventDefault(); void (editingName ? state.rename(name.trim()) : state.join(name.trim())); }} className="mt-5 space-y-3">
                <label htmlFor="poll-nickname" className="block text-sm font-medium">{zh ? "你的名字" : "Your name"}</label>
                <input id="poll-nickname" autoComplete="nickname" maxLength={60} required value={name} onChange={(event) => setName(event.target.value)} placeholder={zh ? "例如：小林" : "For example: Lin"} className="min-h-12 w-full rounded-xl border bg-background px-3 text-base" />
                <p className="text-xs leading-5 text-muted-foreground">{zh ? "名字只用于展示，同名也会分别记录。填过的话，请用你保存的个人恢复链接返回。" : "Names are display labels; matching names stay separate. To return to a previous response, use your personal recovery link."}</p>
                {poll.legacyGuestNeedsRecovery ? <p role="status" className="text-sm leading-6" data-testid="legacy-guest-recovery">{zh ? "旧填写仍保留。为防止认错人，请让发起人从参与名单为你发送个人恢复链接。" : "Your old response is kept. To restore it safely, ask the organizer to send you a personal recovery link from the participant list."}</p> : null}
                <div className="flex flex-wrap gap-3"><Button type="submit" disabled={disabled || !name.trim()} className={"min-h-12 w-full rounded-xl sm:w-auto " + styles.finishButton}>{busy ? (zh ? "保存中…" : "Saving…") : editingName ? (zh ? "保存昵称" : "Save name") : choosingActivity ? (zh ? "加入一起选活动" : "Join the activity ideas") : collecting ? (zh ? "下一步：选择我的空闲" : "Next: choose my free time") : (zh ? "继续查看邀请" : "Continue to invitation")}</Button>{poll.viewerId ? <Button type="button" variant="ghost" onClick={state.cancelNameEditing}>{zh ? "取消" : "Cancel"}</Button> : null}</div>
              </form>
            </section> : <section className="flex flex-wrap items-center justify-between gap-x-4 border-b py-2">
              <p className="break-words text-sm"><span className="text-muted-foreground">{zh ? "当前填写人：" : "Filling in as: "}</span><strong>{poll.myDisplayName}</strong></p>
              <div className="flex gap-3"><button type="button" disabled={disabled} aria-label={zh ? "编辑昵称" : "Edit nickname"} onClick={() => { setName(poll.myDisplayName); state.setEditingName(true); }} className="inline-flex min-h-11 items-center gap-1 text-xs"><Pencil className="h-3.5 w-3.5" aria-hidden />{zh ? "改名字" : "Edit name"}</button><button type="button" disabled={disabled} className="min-h-11 text-xs text-muted-foreground underline underline-offset-4" onClick={() => { setName(""); state.setSwitchingParticipant(true); setCopiedRecoveryID(null); }}>{zh ? "其他人填写" : "Create another response"}</button></div>
              {resumed ? <p className={"w-full pb-1 text-xs " + styles.savedText}>{zh ? "已恢复你的填写，可以继续修改。" : "Your response is restored. You can continue editing."}</p> : null}
            </section> : null}

            {poll.viewerId && !choosingName ? <details className="rounded-xl border bg-background p-4" open={!poll.didRespond || undefined} data-testid="guest-recovery-panel">
              <summary className="min-h-11 cursor-pointer text-sm font-medium">{zh ? "保留我的个人恢复链接" : "Keep my personal recovery link"}</summary>
              <p className="my-3 text-xs leading-5 text-muted-foreground">{zh ? "清除浏览器数据或换手机后，用此链接恢复已提交的填写。请保存到自己的备忘录；持有链接的人可以修改你的填写，请勿转发给其他人。未提交草稿只保存在当前浏览器。" : "Use this link after clearing browser data or changing phones to restore your submitted response. Save it privately: anyone holding it can edit your response. Unsubmitted drafts stay in this browser."}</p>
              <Button type="button" variant="outline" disabled={disabled} data-testid="guest-recovery-copy" onClick={async () => {
                const link = await state.loadRecoveryLink();
                if (link) { try { await navigator.clipboard.writeText(link); setCopiedRecoveryID(poll.viewerId); } catch { setCopiedRecoveryID(null); } }
              }}>{recoveryCopied ? (zh ? "已复制，请私密保存" : "Copied. Keep it private") : (zh ? "复制个人恢复链接" : "Copy personal recovery link")}</Button>
              {state.recoveryLink && !recoveryCopied ? <div><p className="mt-3 text-xs">{zh ? "若未自动复制，请选中下方链接手动复制。" : "If it was not copied automatically, select the link below to copy it."}</p><input className="mt-2 min-h-11 w-full rounded-lg border px-3 text-sm" readOnly aria-label={zh ? "个人恢复链接" : "Personal recovery link"} value={state.recoveryLink} onFocus={event => event.target.select()} /></div> : null}
            </details> : null}

            {collecting && poll.activitySelection && !choosingName ? <div ref={choosingActivity ? (node) => { table.current = node; } : undefined} className="scroll-mt-4">
              <ActivityIdeas activity={poll.activitySelection} canEdit={!!poll.viewerId && !disabled && choosingActivity} busy={busy} zh={zh} initiallyExpanded={fixedTime && choosingActivity} onSuggest={state.suggestActivity} onInterest={state.setActivityInterest} />
            </div> : null}

            {collecting && fixedTime && !choosingName && poll.chosenStart && poll.chosenEnd ? <InvitationTimetable start={poll.chosenStart} end={poll.chosenEnd} timeZone={poll.timeZone} zh={zh} isDraft /> : null}
            {collecting && !fixedTime && !choosingName ? <section ref={choosingActivity ? undefined : table} className="scroll-mt-4 bg-background py-3" data-testid="plan-collection-timetable">
              <div className="mb-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-xl font-semibold">{zh ? "大家的时间表" : "Group timetable"}</h2>
                  <p className="text-xs text-muted-foreground">{poll.summary.participantCount} {zh ? "人已填写" : "people responded"}</p>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{zh ? "直接点选你有空的时间，再点一次取消。你也能同时看到朋友的空闲。" : "Tap when you're free; tap again to clear. See your friends' availability in the same timetable."}</p>
              </div>
              <AvailabilityEditor poll={poll} selected={selected} onChange={state.saveSelection} onEditingChange={state.setEditingAvailability} disabled={busy || editingName || switchingParticipant} zh={zh} />
            </section> : null}

            {!collecting ? <section className="space-y-4 rounded-2xl border bg-background p-5 sm:p-6" data-testid="plan-invitation">
              <h2 className="text-2xl font-semibold">{poll.phase === "CONFIRMED" ? (zh ? "计划已确定" : "Plan confirmed") : poll.phase === "CANCELLED" ? (zh ? "计划已取消" : "Plan cancelled") : poll.phase === "EXPIRED" ? (zh ? "计划已过期" : "Plan expired") : mine?.status === "ACCEPTED" ? (zh ? "你已接受，等待发起人正式发出" : "You accepted. Waiting for the organizer.") : (zh ? "最后一步：确认最终时间" : "Last step: confirm the final time")}</h2>
              {poll.chosenStart && poll.chosenEnd ? <p className="text-lg font-semibold leading-7">{formatWindow(poll.chosenStart, poll.chosenEnd)}</p> : null}
              {poll.chosenStart && poll.chosenEnd ? <section ref={table} className="scroll-mt-4">
                <InvitationTimetable start={poll.chosenStart} end={poll.chosenEnd} timeZone={poll.timeZone} zh={zh} />
              </section> : null}
              {poll.phase === "EXPIRED" ? <p role="status" className="text-sm leading-6 text-muted-foreground">{zh ? "这次安排在确认前已过期，没有加入任何人的日历。请联系发起人重新约时间。" : "This plan expired before confirmation. No calendar entries were added. Ask the organizer to arrange another time."}</p> : poll.phase === "CANCELLED" ? <p className="text-sm text-muted-foreground">{zh ? "发起人已取消这次安排，请联系对方重新约时间。" : "This activity was cancelled. Contact the organizer to arrange another time."}</p> : <>
                <p className={"inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium " + styles.phase}><Users className="h-4 w-4" aria-hidden />{accepted}/{target ?? 0} {zh ? "人已确认" : "confirmed"}</p>
                {poll.planningMode === "FIXED" && remaining > 0 ? <p className="text-sm leading-6 text-muted-foreground" data-testid="plan-invitation-remaining">{zh ? `还有 ${remaining} 个名额` : remaining === 1 ? "1 place available" : `${remaining} places available`}</p> : null}
                {fullForViewer ? <p className="text-sm leading-6 text-muted-foreground" data-testid="plan-invitation-full">{fullMessage}</p> : poll.phase === "CONFIRMED" && mine?.status === "ACCEPTED" ? <><p className="text-sm leading-6">{zh ? "发起人已正式发出，你已接受参加。按上面的时间地点参加即可。" : "The organizer sent the final plan and you accepted. Follow the time and place above."}</p><p className="text-sm leading-6 text-muted-foreground">{zh ? "保留此链接，之后可随时查看活动详情。" : "Keep this link to return to the activity details."}</p></> : poll.viewerId ? included ? <>
                  <p className="text-sm leading-6">{mine?.status === "ACCEPTED" ? (zh ? "你已接受。由发起人决定何时正式发出，无需等待所有人回复。" : "You accepted. The organizer decides when to send the final plan, without waiting for everyone.") : (zh ? "现在确认的是上面的具体安排，请看好日期、时间和地点后回复。" : "You're confirming the specific arrangement above. Check the date, time and place before replying.")}</p>
                  <p className="text-sm leading-6 text-muted-foreground">{zh ? "发起人可随时正式发出。已接受的 App 用户会收到通知并同步 SideSeat 日历；网页访客请保留此链接查看更新。未回复或拒绝不会阻塞，开始前仍可接受。" : "The organizer can send at any time. Accepted app users are notified and added to their SideSeat calendars; web guests can return to this link for updates. Pending or declined replies do not block sending, and you may accept before the activity starts."}</p>
                </> : <p className="text-sm leading-6 text-muted-foreground">{zh ? "你尚未接受这次邀请，不会收到成行通知，也不会加入日历。你填写的空闲仍然保留。" : "You have not accepted this invitation, so you won't receive the final alert or a calendar entry. Your availability is saved."}</p> : <p className="text-sm leading-6 text-muted-foreground">{zh ? "请先填写上面的名字，再回复这次邀请。" : "Enter your name above to reply to this invitation."}</p>}
              </>}
            </section> : null}
          </div>
          {poll.viewerId && !choosingName && !(collecting && fixedTime) ? <aside className="border-t py-4 md:border-t-0 md:border-l md:pl-5">
            <h2 className="flex items-center gap-2 text-base font-semibold"><Users className="h-4 w-4" aria-hidden />{collecting ? (zh ? "已填写空闲的人" : "Availability responses") : (zh ? "受邀名单" : "Invitation list")}<span className="text-sm font-normal text-muted-foreground">{people?.length ?? 0}</span></h2>
            <ul className="mt-3 divide-y">{people?.map((person) => <li key={person.id} className="flex items-center justify-between gap-3 py-3">
              <div><p className="break-words text-sm font-medium">{person.displayName}{person.isMe ? <span className="ml-2 text-xs font-normal text-muted-foreground">{zh ? "你" : "You"}</span> : null}</p><p className="mt-1 text-xs text-muted-foreground">{person.isGuest ? (zh ? "通过链接参加" : "Joined by link") : "SideSeat"}</p></div>
              {"status" in person ? <span className="shrink-0 text-xs text-muted-foreground">{person.status === "ACCEPTED" ? <Check className="h-4 w-4" aria-label={zh ? "已确认" : "Confirmed"} /> : person.status === "DECLINED" ? (zh ? "无法参加" : "Declined") : (zh ? "待确认" : "Awaiting reply")}</span> : <span className="shrink-0 text-xs text-muted-foreground">{Math.round(person.slotIds.length * 15 / 60 * 10) / 10} h</span>}
            </li>)}</ul>
            {!people?.length ? <p className="mt-4 text-sm text-muted-foreground">{zh ? "还没有填写记录。" : "No responses yet."}</p> : null}
          </aside> : null}
        </div>

        {editing ? <div className={styles.saveBar + " fixed inset-x-0 bottom-0 z-40 border-t bg-background px-4 pt-3 shadow-[0_-4px_24px_rgb(0_0_0_/_0.05)] sm:px-6"}>
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              {saving ? <Loader2 className="h-5 w-5 shrink-0 motion-safe:animate-spin" aria-hidden /> : failed ? <AlertCircle className="h-5 w-5 shrink-0 text-amber-700" aria-hidden /> : poll.didRespond && saved ? <CheckCircle2 className={"h-5 w-5 shrink-0 " + styles.savedText} aria-hidden /> : <Circle className="h-5 w-5 shrink-0" aria-hidden />}
              <div><p role="status" aria-live="polite" aria-atomic="true" className={"text-sm font-semibold " + (saved && poll.didRespond ? styles.savedText : "")}>{saveTitle}</p><p className="mt-0.5 text-xs text-muted-foreground">{failed ? (zh ? "选择仍保留，请重试" : "Your choices are kept. Please retry.") : (zh ? "已选 " + selectedDays + " 天 · " + selectedHours + " 小时" : selectedDays + " days · " + selectedHours + " hours selected")}</p></div>
            </div>
            {!saved ? <Button data-testid="availability-submit" disabled={!state.hasChanges || saving || busy} onClick={() => void state.submit()} className={"min-h-12 w-full shrink-0 rounded-xl sm:w-auto " + styles.finishButton}>{saving ? (zh ? "提交中…" : "Submitting…") : poll.didRespond ? (zh ? "保存修改" : "Save changes") : (zh ? "提交我的空闲" : "Submit my availability")}</Button> : null}
            <p data-testid="availability-next-step" className="w-full text-xs leading-5 text-muted-foreground">{choosingActivity ? (zh ? "选好后点击「提交我的空闲」。等发起人选定活动和最终时间后，还需明确确认参加。" : "Click Submit my availability when ready. Confirm participation after the organizer chooses the activity and final time.") : zh ? "填写空闲不代表确认参加。等发起人选定最终时间后，请回到这里点「确认参加」。保留此链接，可随时查看和修改。" : "Sharing free time doesn't confirm attendance. Return here to confirm participation after the organizer picks the final time. Keep this link to view and edit."}</p>
          </div>
        </div> : null}
        {replying ? <div className={styles.saveBar + " fixed inset-x-0 bottom-0 z-40 border-t bg-background px-4 pt-3 shadow-[0_-4px_24px_rgb(0_0_0_/_0.05)] sm:px-6"}>
          <div className="mx-auto max-w-4xl">
            {deferred ? <div className="flex flex-wrap items-center justify-between gap-2"><p role="status" className="text-sm">{zh ? "暂不回复，不影响发起人继续安排。" : "Reply later. The organizer can continue without your response."}</p><Button variant="ghost" onClick={() => setDeferred(false)}>{zh ? "回复邀请" : "Reply to invitation"}</Button></div> : <>
              {mine?.status === "ACCEPTED" ? <p role="status" className="mb-2 flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-5 w-5" aria-hidden />{poll.phase === "CONFIRMED" ? (zh ? "已接受参加 · 安排已正式发出" : "You're attending · final plan sent") : (zh ? "你已接受，等待发起人正式发出" : "You accepted. Waiting for the organizer.")}</p> : null}
              <div className={mine?.status === "ACCEPTED" ? "flex justify-end" : "grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3"}>
                <Button variant="outline" disabled={disabled || mine?.status === "DECLINED"} onClick={() => void state.reply("DECLINED")} className="h-auto min-h-12 min-w-0 whitespace-normal rounded-xl px-3 py-2 leading-snug">{mine?.status === "DECLINED" ? (zh ? "已拒绝" : "Declined") : (zh ? "无法参加" : "I can't attend")}</Button>
                {mine?.status !== "ACCEPTED" ? <Button disabled={disabled} onClick={() => void state.reply("ACCEPTED")} className={"h-auto min-h-12 min-w-0 whitespace-normal rounded-xl px-3 py-2 leading-snug " + styles.finishButton}>{zh ? "确认参加" : "Confirm participation"}</Button> : null}
              </div>
              {!mine || mine.status === "INVITED" ? <Button variant="ghost" className="mt-1 min-h-11 w-full" onClick={() => setDeferred(true)}>{zh ? "暂不回复" : "Reply later"}</Button> : null}
            </>}
          </div>
        </div> : null}
      </>}
      <footer className="mt-8 flex gap-5 text-xs text-muted-foreground"><Link href="/privacy">{zh ? "隐私" : "Privacy"}</Link><Link href="/support">{zh ? "帮助" : "Support"}</Link></footer>
    </div>
  </main>;
}
