"use client";
import { useState } from "react";
import { Check, Heart, Lightbulb, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PollActivitySelection } from "@/lib/time-polls/browser-types";

export function ActivityIdeas({ activity, canEdit, busy, zh, onSuggest, onInterest }: {
  activity: PollActivitySelection; canEdit: boolean; busy: boolean; zh: boolean;
  onSuggest: (title: string, location: string) => Promise<boolean>;
  onInterest: (ideaId: string, interested: boolean) => Promise<boolean>;
}) {
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  return <section className="rounded-2xl border bg-background p-4 sm:p-6" data-testid="activity-ideas">
    <h2 className="flex items-center gap-2 text-xl font-semibold"><Lightbulb className="h-5 w-5 shrink-0" aria-hidden />{activity.isOpen ? (zh ? "一起决定做什么" : "Choose what to do together") : (zh ? "大家的活动提议" : "Everyone’s activity ideas")}</h2>
    <p className="mt-2 text-sm leading-6 text-muted-foreground">{activity.isOpen ? (zh ? "每个人都能提议，也可以对多个活动标记感兴趣。发起人会参考大家的想法定案。" : "Everyone can suggest an activity and mark interest in several options. The organizer makes the final choice.") : (zh ? "活动已选定。之前的提议与兴趣仍保留，下面可以继续填写空闲。" : "The activity is chosen. Your ideas and interests are kept; continue with free time below.")}</p>
    <p className="mt-2 text-xs font-medium leading-5">{zh ? "感兴趣不代表确认参加，最终安排之后再确认。" : "Interest does not confirm attendance. Confirm the final arrangement later."}</p>
    <ul className="mt-4 divide-y" aria-label={zh ? "活动候选" : "Activity options"}>
      {activity.ideas.map(idea => {
        const interested = idea.interestedBy.some(person => person.isMe);
        return <li key={idea.id} className="py-4" data-testid={"activity-idea-" + idea.id}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1"><h3 className="break-words font-semibold">{idea.title}{activity.selectedIdeaId === idea.id ? <span className="ml-2 inline-flex items-center gap-1 text-xs font-medium"><Check className="h-3.5 w-3.5" aria-hidden />{zh ? "已选定" : "Chosen"}</span> : null}</h3>
              {idea.location ? <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />{idea.location}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">{idea.authorName}{zh ? " 提议" : " suggested this"}</p>
            </div>
            {activity.isOpen ? <button type="button" aria-pressed={interested} disabled={!canEdit || busy} onClick={() => void onInterest(idea.id, !interested)} data-testid={"activity-interest-" + idea.id}
              className={"inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm font-medium disabled:opacity-50 " + (interested ? "bg-muted" : "bg-background")}>
              {interested ? <Check className="h-4 w-4" aria-hidden /> : <Heart className="h-4 w-4" aria-hidden />}{interested ? (zh ? "已感兴趣" : "Interested") : (zh ? "感兴趣" : "I'm interested")}<span>{idea.interestedBy.length}</span>
            </button> : null}
          </div>
          <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">{idea.interestedBy.length ? idea.interestedBy.map(person => person.displayName).join(zh ? "、" : ", ") + (zh ? " 感兴趣" : " interested") : (zh ? "还没有人标记兴趣" : "No interests yet")}</p>
        </li>;
      })}
    </ul>
    {!activity.ideas.length ? <p className="py-5 text-sm text-muted-foreground">{zh ? "还没有提议，先分享一个你想做的活动吧。" : "No ideas yet. Suggest something you'd enjoy doing together."}</p> : null}
    {activity.isOpen && canEdit ? <form className="mt-2 space-y-3 border-t pt-4" onSubmit={async event => {
      event.preventDefault(); if (await onSuggest(title.trim(), location.trim())) { setTitle(""); setLocation(""); }
    }}>
      <label className="block text-sm font-medium" htmlFor="activity-title">{zh ? "我想提议" : "My activity idea"}</label>
      <input id="activity-title" maxLength={120} required value={title} onChange={event => setTitle(event.target.value)} placeholder={zh ? "例如：逛展、火锅、羽毛球" : "For example: an exhibition, dinner or badminton"} className="min-h-12 w-full rounded-xl border bg-background px-3 text-base" />
      <label className="block text-sm font-medium" htmlFor="activity-location">{zh ? "地点（选填）" : "Place (optional)"}</label>
      <input id="activity-location" maxLength={200} value={location} onChange={event => setLocation(event.target.value)} className="min-h-12 w-full rounded-xl border bg-background px-3 text-base" />
      <Button type="submit" variant="outline" disabled={busy || !title.trim()} className="min-h-12 gap-2 rounded-xl" data-testid="activity-suggest"><Plus className="h-4 w-4" aria-hidden />{busy ? (zh ? "保存中…" : "Saving…") : (zh ? "添加提议" : "Add suggestion")}</Button>
    </form> : null}
  </section>;
}
