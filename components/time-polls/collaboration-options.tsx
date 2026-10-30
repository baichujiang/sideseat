"use client";

import { useState } from "react";
import { Check, LockKeyhole, MapPin, Plus, Sparkles, X } from "lucide-react";
import type { SharedTimePoll } from "@/lib/time-polls/browser-types";
import styles from "./collaboration-options.module.css";

type Kind = "ACTIVITY" | "LOCATION";
export function ownCollaborationChoices(poll: SharedTimePoll) {
  return (poll.collaboration?.options ?? []).filter(option => option.interestedBy.some(person => person.isMe)).map(option => option.id).sort();
}

export function CollaborationOptions({ poll, selected, onChange, onSuggest, disabled = false, zh = true, showCounts = false }: {
  poll: SharedTimePoll;
  selected: string[];
  onChange: (ids: string[]) => void;
  onSuggest: (kind: Kind, value: string) => Promise<boolean>;
  disabled?: boolean;
  zh?: boolean;
  showCounts?: boolean;
}) {
  const [composing, setComposing] = useState<Kind | null>(null);
  const [value, setValue] = useState("");
  const collaboration = poll.collaboration;
  if (!collaboration) return null;
  return <div className={styles.questions}>
    {(["ACTIVITY", "LOCATION"] as const).map(kind => {
      const open = !collaboration.finalized && (kind === "ACTIVITY" ? collaboration.activity : collaboration.location);
      const options = collaboration.options.filter(option => option.kind === kind);
      const fixed = kind === "ACTIVITY" ? collaboration.activityType : poll.location;
      return <section key={kind} className={styles.question} aria-label={kind === "ACTIVITY" ? (zh ? "活动偏好" : "Activity preferences") : (zh ? "地点偏好" : "Place preferences")}>
        <div className={styles.heading}><h2>{kind === "ACTIVITY" ? <Sparkles size={16} aria-hidden /> : <MapPin size={16} aria-hidden />}{kind === "ACTIVITY" ? (zh ? "想做什么？" : "What would you like to do?") : (zh ? "在哪里？" : "Where shall we meet?")}</h2>{!open ? <span>{zh ? "发起人已定" : "Chosen by organizer"}</span> : null}</div>
        {open ? <>
          <div className={styles.options}>
            {options.map(option => {
              const active = selected.includes(option.id);
              const count = option.interestedBy.filter(person => !person.isMe).length + Number(active);
              return <button key={option.id} type="button" className={styles.option} aria-pressed={active} disabled={disabled} onClick={() => onChange(active ? selected.filter(id => id !== option.id) : [...selected, option.id])}>
                <span>{option.value}</span>{showCounts ? <small>{zh ? `${count} 人倾向` : `${count} interested`}</small> : null}{active ? <Check size={14} aria-hidden /> : null}
              </button>;
            })}
            {composing !== kind ? <button type="button" className={styles.add} disabled={disabled} aria-label={kind === "ACTIVITY" ? (zh ? "提议其他活动" : "Suggest another activity") : (zh ? "提议其他地点" : "Suggest another place")} onClick={() => { setComposing(kind); setValue(""); }}><Plus size={15} aria-hidden />{zh ? "其他" : "Other"}</button> : null}
          </div>
          {composing === kind ? <form className={styles.composer} onSubmit={async event => { event.preventDefault(); if (value.trim() && await onSuggest(kind, value.trim())) { setValue(""); setComposing(null); } }}>
            <label className={styles.srOnly} htmlFor={`collaboration-${kind}`}>{kind === "ACTIVITY" ? (zh ? "新的活动提议" : "New activity suggestion") : (zh ? "新的地点提议" : "New place suggestion")}</label>
            <input id={`collaboration-${kind}`} autoFocus maxLength={120} value={value} required disabled={disabled} onChange={event => setValue(event.target.value)} placeholder={kind === "ACTIVITY" ? (zh ? "例如：羽毛球" : "For example: badminton") : (zh ? "例如：校园咖啡馆" : "For example: campus café")} />
            <button type="submit" disabled={disabled || !value.trim()} className={styles.option}>{zh ? "添加" : "Add"}</button>
            <button type="button" className={styles.close} disabled={disabled} aria-label={zh ? "取消添加" : "Cancel suggestion"} onClick={() => { setValue(""); setComposing(null); }}><X size={17} aria-hidden /></button>
          </form> : null}
        </> : <p className={styles.fixed}><span>{fixed || (zh ? "地点稍后通知" : "Place to be announced")}</span><LockKeyhole size={14} aria-hidden /></p>}
      </section>;
    })}
  </div>;
}
