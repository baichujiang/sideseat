"use client";

import { useId, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp, MapPin, Sparkles } from "lucide-react";
import type { SharedTimePoll } from "@/lib/time-polls/browser-types";
import styles from "./collaboration-final-fields.module.css";

export function CollaborativeFinalFields({ poll }: { poll: SharedTimePoll }) {
  const id = useId();
  const [title, setTitle] = useState(poll.title);
  const [activityType, setActivityType] = useState(poll.collaboration?.activityType ?? "");
  const [location, setLocation] = useState(poll.location ?? "");
  const [open, setOpen] = useState<"ACTIVITY" | "LOCATION" | null>(poll.collaboration?.activityType ? null : "ACTIVITY");
  const activityInput = useRef<HTMLInputElement>(null);
  const locationInput = useRef<HTMLInputElement>(null);
  const options = poll.collaboration?.options ?? [];
  const activities = options.filter((option) => option.kind === "ACTIVITY");
  const locations = options.filter((option) => option.kind === "LOCATION");

  return <div className={styles.fields} data-testid="collaboration-final-fields">
    <label className={styles.titleField}>
      <span>活动名称</span>
      <input name="title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required />
    </label>
    {options.length ? <p className={styles.hint}>倾向人数仅供参考，可采用提议或自行填写。</p> : null}
    {(["ACTIVITY", "LOCATION"] as const).map((kind) => {
      const activity = kind === "ACTIVITY";
      const candidates = activity ? activities : locations;
      const value = activity ? activityType : location;
      const expanded = open === kind && candidates.length > 0;
      const Icon = activity ? Sparkles : MapPin;
      return <section className={styles.field} key={kind} aria-labelledby={`${id}-${kind}-label`}>
        <div className={styles.heading}>
          <label id={`${id}-${kind}-label`} htmlFor={`${id}-${kind}-input`}><Icon size={15} aria-hidden />{activity ? "活动类型" : "地点（选填）"}</label>
          {candidates.length ? <button type="button" className={styles.toggle} aria-expanded={expanded} aria-controls={`${id}-${kind}-options`} onClick={() => setOpen(expanded ? null : kind)}>
            {expanded ? "收起候选" : value.trim() ? "更换" : "从提议中选"}{expanded ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          </button> : null}
        </div>
        <input
          ref={activity ? activityInput : locationInput}
          id={`${id}-${kind}-input`}
          className={styles.input}
          name={activity ? "activityType" : "location"}
          value={value}
          onChange={(event) => activity ? setActivityType(event.target.value) : setLocation(event.target.value)}
          required={activity}
          maxLength={activity ? 120 : 200}
          placeholder={activity ? candidates.length ? "选择提议，或自己填写" : "填写最终活动类型" : "地点可留空，稍后通知"}
        />
        {expanded ? <div className={styles.options} id={`${id}-${kind}-options`} role="group" aria-label={activity ? "活动提议" : "地点提议"}>
          {candidates.map((option) => <button
            type="button"
            key={option.id}
            className={styles.option}
            aria-pressed={value.trim() === option.value}
            data-testid={`final-option-${option.id}`}
            onClick={() => {
              if (activity) setActivityType(option.value);
              else setLocation(option.value);
              setOpen(null);
              (activity ? activityInput : locationInput).current?.focus();
            }}
          >
            <span>{option.value}</span><small>{value.trim() === option.value ? "已选定" : `${option.interestedBy.length} 人倾向`}</small>{value.trim() === option.value ? <Check size={13} aria-hidden /> : null}
          </button>)}
        </div> : null}
      </section>;
    })}
  </div>;
}
