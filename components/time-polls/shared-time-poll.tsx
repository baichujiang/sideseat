"use client";
import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowUpRight, CalendarDays, Check, CheckCircle2, Circle, Loader2, MapPin, Pencil, Users, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AvailabilityEditor } from "@/components/time-polls/availability-editor";
import { useSharedTimePoll } from "@/components/time-polls/use-shared-time-poll";
import styles from "./shared-time-poll.module.css";
import { POLL_LOCALE_COOKIE, pollClock, pollDate } from "@/lib/time-polls/browser-types";

export function SharedTimePoll({ token, zh: initialZh }: { token: string; zh: boolean }) {
  const [zh, setZh] = useState(initialZh);
  const state = useSharedTimePoll(token);
  const { poll, error, busy, saving, saved, selected, editingName, switchingParticipant, resumed } = state;
  const [name, setName] = useState("");
  const table = useRef<HTMLElement>(null);
  const [finished, setFinished] = useState(false);
  const [view, setView] = useState<"mine" | "group">("mine");
  const closed = poll?.phase === "CONFIRMED" || poll?.phase === "CANCELLED";
  const mine = poll?.invitations.find((person) => person.isMe);
  const included = mine?.selected || poll?.planningMode === "FIXED";
  const accepted = poll?.invitations.filter((person) => person.selected && person.status === "ACCEPTED").length ?? 0;
  const target = poll?.planningMode === "FIXED" ? poll.expectedCount : poll?.invitations.filter((person) => person.selected).length;
  const people = poll?.phase === "COLLECTING" ? poll.participants : poll?.invitations;
  const disabled = busy || saving || !saved;
  const choosingName = !poll?.viewerId || editingName || switchingParticipant;
  const errorText = zh && error === "This name already has a response. Switch participant to continue it, or choose a different name."
    ? "这个名字已有填写。请点击“切换填写人”继续修改该记录，或使用另一个名字。" : error;
  const editing = poll?.phase === "COLLECTING" && !!poll.viewerId && !choosingName && view === "mine";
  const selectedSlots = poll?.slots.filter((slot) => selected.includes(slot.id)) ?? [];
  const selectedDays = new Set(selectedSlots.map((slot) => slot.date)).size;
  const selectedHours = new Intl.NumberFormat(zh ? "zh-CN" : "en", { maximumFractionDigits: 2 }).format(selectedSlots.reduce((sum, slot) => sum + (Date.parse(slot.end) - Date.parse(slot.start)) / 3600000, 0));
  const failed = !saved && !saving && !!error;
  const saveTitle = saving ? (zh ? "正在保存…" : "Saving…") : failed ? (zh ? "保存失败" : "Couldn't save") : poll?.didRespond && saved ? (zh ? "已自动保存" : "Saved automatically") : (zh ? "选择你有空的时间" : "Choose when you're free");
  const showResults = () => { setFinished(true); setView("group"); table.current?.scrollIntoView({ block: "start" }); };
  const formatWindow = (start: string, end: string) => {
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: poll!.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    const first = formatter.format(new Date(start)), last = formatter.format(new Date(end));
    return `${pollDate(first, zh)} · ${pollClock(start, poll!.timeZone)}–${first === last ? "" : pollDate(last, zh) + " · "}${pollClock(end, poll!.timeZone)}`;
  };
  return <main lang={zh ? "zh-CN" : "en"} className={`${styles.page} min-h-dvh px-4 ${editing ? "pb-36" : "pb-12"} pt-4 sm:px-6`}>
    <div className="mx-auto max-w-4xl lg:max-w-[1440px]">
      <header className="mb-5 flex items-center justify-between gap-4"><Link href="/ios" className="flex items-center gap-2 font-semibold"><Image src="/icons/app-icon.png" width={34} height={34} alt="" className="rounded-lg" />SideSeat</Link><div className="flex items-center gap-3 sm:gap-5"><button type="button" className="min-h-11 text-sm" aria-label={zh ? "Switch to English" : "切换为中文"} onClick={() => { const next = !zh; setZh(next); document.cookie = `${POLL_LOCALE_COOKIE}=${next ? "zh-CN" : "en"}; Path=/time-polls; Max-Age=31536000; SameSite=Lax`; }}>{zh ? "English" : "中文"}</button><a href={`sideseat://time-polls/${encodeURIComponent(token)}`} className="inline-flex min-h-11 items-center gap-1 text-sm">{zh ? "在 App 中打开" : "Open in app"}<ArrowUpRight className="h-4 w-4" aria-hidden /></a></div></header>
      {!poll ? <section className="rounded-2xl border bg-background p-7" aria-live="polite"><h1 className="text-2xl font-semibold">{error ? (zh ? "暂时无法打开计划" : "Plan unavailable") : (zh ? "正在打开计划…" : "Opening your plan…")}</h1>{error ? <p className="mt-3 text-sm text-muted-foreground">{error}</p> : null}</section> : <>
        <section className="mb-5 rounded-2xl border bg-background p-5 sm:p-6" aria-label={zh ? "计划信息" : "Plan details"}>
          <p className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${styles.phase}`}>{poll.phase === "COLLECTING" ? (zh ? "正在征集时间" : "Collecting availability") : poll.phase === "CONFIRMED" ? (zh ? "计划已确定" : "Plan confirmed") : poll.phase === "CANCELLED" ? (zh ? "计划已取消" : "Plan cancelled") : (zh ? "等待参加确认" : "Awaiting confirmations")}</p>
          <h1 className="break-words text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">{poll.title}</h1>
          <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
            {poll.dates.length ? <p className="flex items-start gap-2"><CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /><span>{pollDate(poll.dates[0], zh)}{poll.dates.length > 1 ? ` – ${pollDate(poll.dates.at(-1)!, zh)}` : ""}</span></p> : null}
            {poll.location ? <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /><span className="break-words">{poll.location}</span></p> : null}
          </div>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{zh ? `所有时间以 ${poll.timeZone} 为准` : `All times in ${poll.timeZone}`}</p>
          {poll.phase === "COLLECTING" ? <p className="mt-4 border-t pt-3 text-sm leading-6">{zh ? "先填写你有空的时间，再一起商量活动安排。" : "Share when you're free, then decide the activity together."}</p> : null}
        </section>
        <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-[minmax(0,1fr)_minmax(240px,0.7fr)] lg:grid-cols-[minmax(0,1fr)_224px]">
          <div className="min-w-0 space-y-5">
            {!closed ? <section className="rounded-2xl border bg-background px-5 py-3 sm:px-6">
              {choosingName ? <form onSubmit={(event) => { event.preventDefault(); void (editingName ? state.rename(name.trim()) : state.join(name.trim())); }} className="space-y-3">
                <label htmlFor="poll-nickname" className="block text-sm font-medium">{zh ? "本次计划中的昵称" : "Your name in this plan"}</label>
                <input id="poll-nickname" autoComplete="nickname" maxLength={60} required value={name} onChange={(event) => setName(event.target.value)} placeholder={zh ? "让朋友认出你，例如：小林" : "A name your friends will recognize"} className="min-h-12 w-full rounded-xl border bg-background px-3" />
                <p className="text-xs leading-5 text-muted-foreground">{zh ? "无需下载或注册。输入之前填写的名字即可继续修改；不同的人请用可区分的名字，例如：小林（同班）。" : "No download or account needed. Enter your previous name to continue editing. Different people should use distinct names, such as Lin (classmate)."}</p>
                <div className="flex gap-3"><Button type="submit" disabled={disabled || !name.trim()} className="min-h-11 rounded-xl">{busy ? (zh ? "保存中…" : "Saving…") : editingName ? (zh ? "保存昵称" : "Save name") : (zh ? "开始 / 继续填写" : "Start or continue")}</Button>{poll.viewerId ? <Button type="button" variant="ghost" onClick={state.cancelNameEditing}>{zh ? "取消" : "Cancel"}</Button> : null}</div>
              </form> : <div>
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                  <div className="min-w-0"><p className="text-xs text-muted-foreground">{zh ? "当前填写人" : "Filling in as"}</p><p className="break-words font-medium">{poll.myDisplayName}<span className="ml-2 text-xs font-normal text-muted-foreground">{zh ? "游客" : "Guest"}</span></p></div>
                  <div className="flex gap-4"><button type="button" disabled={disabled} aria-label={zh ? "编辑昵称" : "Edit nickname"} onClick={() => { setName(poll.myDisplayName); state.setEditingName(true); }} className="inline-flex min-h-11 items-center gap-1.5 text-sm"><Pencil className="h-3.5 w-3.5" aria-hidden />{zh ? "修改昵称" : "Edit name"}</button><button type="button" disabled={disabled} className="min-h-11 text-sm text-muted-foreground underline underline-offset-4" onClick={() => { setName(""); state.setSwitchingParticipant(true); }}>{zh ? "切换填写人" : "Switch participant"}</button></div>
                </div>
                {resumed ? <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-300">{zh ? "已找到这个名字的参与记录，可以继续操作。" : "Found your previous participation. You can continue here."}</p> : null}
              </div>}
            </section> : null}
            {error ? <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-stone-900">{errorText}{!saved && !editing ? <button type="button" disabled={saving} onClick={() => void state.retry()} className="ml-3 min-h-11 underline">{zh ? "重试保存" : "Retry save"}</button> : null}</div> : null}
            {poll.phase === "COLLECTING" ? <section ref={table} className="scroll-mt-4 rounded-2xl border bg-background p-4 sm:p-6">
              <div className="mb-5 flex rounded-xl bg-muted p-1" role="group" aria-label={zh ? "时间视图" : "Availability view"}>{(["mine", "group"] as const).map((tab) => <button key={tab} type="button" aria-pressed={view === tab} onClick={() => { setView(tab); if (tab === "mine") setFinished(false); }} className={`min-h-11 flex-1 rounded-lg px-3 text-sm ${view === tab ? "bg-background font-semibold shadow-sm" : "text-muted-foreground"}`}>{tab === "mine" ? (zh ? "我的时间" : "My availability") : (zh ? "大家的结果" : "Group results")}</button>)}</div>
              {view === "group" && finished ? <div className={`mb-5 flex items-start gap-3 rounded-xl p-4 ${styles.savedNotice}`}><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /><div><p className="font-semibold">{zh ? "填写完成" : "You're all set"}</p><p className="mt-1 text-sm leading-5">{zh ? "你的可用时间已保存，可随时返回「我的时间」修改。" : "Your availability is saved. Return to My availability to make changes anytime."}</p></div></div> : null}
              <div className="mb-3"><h2 className="text-lg font-semibold">{view === "group" ? (zh ? "大家的时间表" : "Group timetable") : (zh ? "选择你有空的时间" : "Choose when you're free")}</h2>{view === "group" ? <p className="mt-1 text-sm text-muted-foreground">{poll.summary.participantCount}/{poll.expectedCount ?? poll.summary.participantCount} {zh ? "人已填写" : "responses"}</p> : null}</div>
              {poll.viewerId || view === "group" ? <AvailabilityEditor poll={poll} selected={selected} onChange={state.saveSelection} onEditingChange={state.setEditingAvailability} disabled={busy || editingName || switchingParticipant} zh={zh} results={view === "group"} /> : <p className="py-8 text-sm text-muted-foreground">{zh ? "填写上方昵称后，就可以选择可用时间。" : "Enter your name above to select available times."}</p>}
            </section> : <section className="space-y-5 rounded-2xl border bg-background p-5 sm:p-6"><h2 className="text-xl font-semibold">{poll.phase === "CONFIRMED" ? (zh ? "计划已确定" : "Plan confirmed") : poll.phase === "CANCELLED" ? (zh ? "计划已取消" : "Plan cancelled") : (zh ? "请确认这个时间" : "Confirm this time")}</h2>{poll.chosenStart && poll.chosenEnd ? <p className="font-medium">{formatWindow(poll.chosenStart, poll.chosenEnd)}</p> : null}<p className="text-sm text-muted-foreground">{accepted}/{target ?? 0} {zh ? "人已确认" : "confirmed"}</p>
              {poll.phase === "INVITING" && poll.viewerId ? included ? <><p className="text-sm text-muted-foreground">{zh ? "每个人都确认后，计划才会确定。你可以直接在此网页回复。" : "The plan is confirmed after everyone accepts. Reply directly on this page."}</p><div className="flex flex-col gap-3"><Button disabled={disabled || choosingName || mine?.status === "ACCEPTED"} onClick={() => void state.reply("ACCEPTED")} className="min-h-12 rounded-xl">{mine?.status === "ACCEPTED" ? (zh ? "你已确认参加" : "You've confirmed") : (zh ? "确认参加" : "Confirm participation")}</Button><Button variant="outline" disabled={disabled || choosingName || mine?.status === "DECLINED"} onClick={() => void state.reply("DECLINED")} className="min-h-12 rounded-xl">{mine?.status === "DECLINED" ? (zh ? "你已回复无法参加" : "You've declined") : (zh ? "无法参加" : "I can't attend")}</Button></div></> : <p className="text-sm text-muted-foreground">{zh ? "这次邀请未包含你，你的可用时间仍已保存。" : "You aren't included in this invitation. Your availability remains saved."}</p> : null}
              {poll.phase === "CONFIRMED" ? <p className="text-sm text-muted-foreground">{zh ? "保留此链接即可随时查看活动详情。" : "Keep this link to return to the plan details."}</p> : null}
            </section>}
          </div>
          <aside className="rounded-2xl border bg-background p-5 sm:p-6"><h2 className="flex items-center gap-2 text-base font-semibold"><Users className="h-4 w-4" aria-hidden />{zh ? "参与者" : "Participants"}<span className="text-sm font-normal text-muted-foreground">{people?.length ?? 0}</span></h2><ul className="mt-4 divide-y">{people?.map((person) => <li key={person.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium">{person.displayName}{person.isMe ? <span className="ml-2 text-xs font-normal text-muted-foreground">{zh ? "你" : "You"}</span> : null}</p><p className="mt-0.5 text-xs text-muted-foreground">{person.isGuest ? (zh ? "游客" : "Guest") : "SideSeat"}</p></div>{"status" in person ? <span className="text-xs text-muted-foreground">{person.status === "ACCEPTED" ? <Check className="h-4 w-4" aria-label={zh ? "已确认" : "Confirmed"} /> : person.status === "DECLINED" ? (zh ? "无法参加" : "Declined") : (zh ? "待确认" : "Awaiting reply")}</span> : <span className="text-xs text-muted-foreground">{Math.round(person.slotIds.length * 15 / 60 * 10) / 10} h</span>}</li>)}</ul>{!people?.length ? <p className="mt-4 text-sm text-muted-foreground">{zh ? "还没有人填写，你可以成为第一个。" : "No responses yet. You can be the first."}</p> : null}</aside>
        </div>
      </>}
      {editing ? <div className={`${styles.saveBar} fixed inset-x-0 bottom-0 z-40 border-t bg-background px-4 pt-3 shadow-[0_-4px_24px_rgb(0_0_0_/_0.05)] sm:px-6`}>
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {saving ? <Loader2 className="h-5 w-5 shrink-0 motion-safe:animate-spin" aria-hidden /> : failed ? <AlertCircle className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden /> : saved && poll?.didRespond ? <CheckCircle2 className={`h-5 w-5 shrink-0 ${styles.savedText}`} aria-hidden /> : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />}
            <div><p role="status" aria-live="polite" aria-atomic="true" className={`text-sm font-semibold ${saved && poll?.didRespond ? styles.savedText : ""}`}>{saveTitle}</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">{failed ? (zh ? "选择仍保留，请重试" : "Your choices are kept. Please retry.") : saving ? (zh ? "保存后即可完成填写" : "Finish once saving completes") : poll?.didRespond ? (zh ? `已选 ${selectedDays} 天 · ${selectedHours} 小时` : `${selectedDays} days · ${selectedHours} hours selected`) : (zh ? "修改会自动保存" : "Changes save automatically")}</p></div>
          </div>
          {failed ? <Button onClick={() => void state.retry()} className={`min-h-12 shrink-0 rounded-xl ${styles.finishButton}`}>{zh ? "重试保存" : "Retry save"}</Button> : <Button disabled={disabled || !poll?.didRespond} onClick={showResults} className={`min-h-12 shrink-0 rounded-xl ${styles.finishButton}`}>{zh ? "完成填写" : "Done selecting"}</Button>}
        </div>
      </div> : null}
      <footer className="mt-10 flex gap-5 text-xs text-muted-foreground"><Link href="/privacy">{zh ? "隐私" : "Privacy"}</Link><Link href="/support">{zh ? "帮助" : "Support"}</Link></footer>
    </div>
  </main>;
}
