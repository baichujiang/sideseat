"use client";
import { useId, useRef, useState } from "react";
import { ArrowUpLeft, Check, ChevronDown, Heart, MapPin, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PollActivitySelection } from "@/lib/time-polls/browser-types";

export function ActivityIdeas({ activity, canEdit, busy, zh, initiallyExpanded = false, onSuggest, onInterest }: {
  activity: PollActivitySelection; canEdit: boolean; busy: boolean; zh: boolean; initiallyExpanded?: boolean;
  onSuggest: (title: string, location: string) => Promise<boolean>;
  onInterest: (ideaId: string, interested: boolean) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [composing, setComposing] = useState(false);
  const id = useId();
  const titleInput = useRef<HTMLInputElement>(null);
  const query = title.trim().toLocaleLowerCase();
  const completions = (zh ? ["逛展", "火锅", "羽毛球"] : ["Exhibition", "Hotpot", "Badminton"]).filter(value => value.toLocaleLowerCase().startsWith(query) && value.toLocaleLowerCase() !== query);
  function complete(value: string) { setTitle(value); titleInput.current?.focus(); }

  return <section className="border-y pb-2" data-testid="activity-panel">
    <form onSubmit={async event => {
      event.preventDefault();
      if (await onSuggest(title.trim(), location.trim())) { setTitle(""); setLocation(""); setComposing(false); setExpanded(true); }
    }}>
      <div className="flex items-baseline justify-between gap-2">
        <button type="button" aria-expanded={expanded} aria-controls={id + "-board"} onClick={() => setExpanded(!expanded)} className="inline-flex min-h-11 items-center gap-1 text-left text-sm font-medium" data-testid="activity-toggle">
          {activity.isOpen ? (zh ? "活动待定" : "Activity undecided") : (zh ? "活动提议" : "Activity ideas")} · {activity.ideaCount}<ChevronDown className={"h-3.5 w-3.5 shrink-0 " + (expanded ? "rotate-180" : "")} aria-hidden />
        </button>
        {activity.isOpen && canEdit ? composing ? <Button type="submit" size="sm" disabled={busy || !title.trim()} className="min-h-11 shrink-0 rounded-xl" data-testid="activity-suggest">{busy ? (zh ? "保存中…" : "Saving…") : (zh ? "确认" : "Add suggestion")}</Button> : <button type="button" disabled={busy} onClick={() => { setExpanded(true); setComposing(true); }} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium disabled:opacity-50" data-testid="activity-compose"><Plus className="h-4 w-4 shrink-0" aria-hidden />{zh ? "提议活动" : "Suggest an activity"}</button> : null}
      </div>
      {composing ? <div className="mb-3 space-y-2 rounded-xl border bg-muted/30 p-3" data-testid="activity-composer">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1"><label className="sr-only" htmlFor={id + "-title"}>{zh ? "我想提议" : "My activity idea"}</label>
            <input ref={titleInput} id={id + "-title"} autoFocus maxLength={120} required value={title} onChange={event => setTitle(event.target.value)} onKeyDown={event => {
              if (event.key === "Tab" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && !event.nativeEvent.isComposing && completions[0]) {
                event.preventDefault(); complete(completions[0]);
              }
            }} placeholder={zh ? "例如：逛展、火锅、羽毛球" : "Exhibition, dinner or badminton"} className="min-h-11 w-full rounded-lg border bg-background px-3 text-base" /></div>
          <button type="button" disabled={busy} aria-label={zh ? "取消" : "Cancel"} onClick={() => { setComposing(false); setTitle(""); setLocation(""); }} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg" data-testid="activity-cancel"><X className="h-4 w-4" aria-hidden /></button>
        </div>
        {completions.length ? <div className="flex flex-wrap items-center gap-2" role="group" aria-label={zh ? "快捷填入" : "Quick fill"} data-testid="activity-completions">
          <span className="text-xs text-muted-foreground">{zh ? "快捷填入" : "Quick fill"}</span>
          {completions.map(value => <button key={value} type="button" disabled={busy} onClick={() => complete(value)} aria-label={zh ? "填入" + value : "Fill with " + value} className="inline-flex min-h-11 items-center gap-1 rounded-full border bg-background px-3 text-xs font-medium disabled:opacity-50" data-testid={"activity-complete-" + value}><ArrowUpLeft className="h-3.5 w-3.5" aria-hidden />{value}</button>)}
        </div> : null}
        <label className="sr-only" htmlFor={id + "-location"}>{zh ? "地点（选填）" : "Place (optional)"}</label>
        <input id={id + "-location"} maxLength={200} value={location} onChange={event => setLocation(event.target.value)} placeholder={zh ? "地点（选填）" : "Place (optional)"} className="min-h-11 w-full rounded-lg border bg-background px-3 text-base" />
      </div> : null}
    </form>
    <div id={id + "-board"} hidden={!expanded} data-testid="activity-ideas">
      <ul className="grid grid-cols-2 items-start gap-2 max-[359px]:grid-cols-1" aria-label={zh ? "活动候选" : "Activity options"} data-testid="activity-board">
        {activity.ideas.map(idea => {
          const interested = idea.interestedBy.some(person => person.isMe);
          return <li key={idea.id} className="min-w-0 rounded-xl border bg-muted/30 px-3 pt-3" data-testid={"activity-idea-" + idea.id}>
            <h3 className="break-words text-sm font-semibold">{idea.title}{activity.selectedIdeaId === idea.id ? <span className="ml-1 inline-flex items-center gap-1 text-xs font-medium"><Check className="h-3.5 w-3.5" aria-hidden />{zh ? "已选定" : "Chosen"}</span> : null}</h3>
            {idea.location ? <p className="mt-1 flex items-start gap-1 break-words text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />{idea.location}</p> : null}
            <p className="mt-1 break-words text-xs text-muted-foreground">{idea.authorName}{zh ? " 提议" : " suggested this"}</p>
            {activity.isOpen ? <button type="button" aria-pressed={interested} aria-label={(interested ? (zh ? "已感兴趣" : "Interested") : (zh ? "感兴趣" : "I'm interested")) + " · " + idea.interestedBy.length} title={idea.interestedBy.map(person => person.displayName).join(zh ? "、" : ", ")} disabled={!canEdit || busy} onClick={() => void onInterest(idea.id, !interested)} data-testid={"activity-interest-" + idea.id}
              className="mt-1 inline-flex min-h-11 w-full items-center gap-1.5 text-left text-xs font-medium disabled:opacity-50">
              <Heart className={"h-4 w-4 shrink-0 " + (interested ? "fill-current" : "")} aria-hidden />{idea.interestedBy.length} {zh ? "人感兴趣" : "interested"}
            </button> : <p className="py-3 text-xs text-muted-foreground">{idea.interestedBy.length} {zh ? "人感兴趣" : "interested"}</p>}
          </li>;
        })}
      </ul>
      {!activity.ideas.length && !composing ? <p className="py-3 text-sm text-muted-foreground">{zh ? "还没有提议，先分享一个你想做的活动吧。" : "No ideas yet. Suggest something you'd enjoy doing together."}</p> : null}
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{zh ? "感兴趣不代表确认参加，发起人会在邀请时确定活动。" : "Interest is not attendance. The organizer confirms the activity when reviewing invitations."}</p>
    </div>
  </section>;
}
