"use client";
import { useEffect, useRef } from "react";
import { CalendarDays } from "lucide-react";
import { invitationTimetableRows, pollClock, pollDate } from "@/lib/time-polls/browser-types";
import styles from "./shared-time-poll.module.css";

export function InvitationTimetable({ title, location, start, end, timeZone, zh, needsConfirmation, isDraft = false }: {
  title: string; location: string | null; start: string; end: string; timeZone: string; zh: boolean; needsConfirmation: boolean; isDraft?: boolean;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; }, [start, end]);
  const rows = invitationTimetableRows(start, end, timeZone);
  const dates = [...new Set(rows.map(row => row.date))];
  const heading = isDraft ? (zh ? "时间已定" : "Time already set") : (zh ? "受邀时间表" : "Invited timetable");
  const timeLabel = isDraft ? (zh ? "已定时段" : "Set time") : (zh ? "受邀时段" : "Invited time");
  return <section className="space-y-3" aria-label={heading} data-testid="plan-invitation-timetable">
    <h3 className="text-lg font-semibold">{heading}</h3>
    <p className="break-words font-semibold">{title}</p>
    {location ? <p className="break-words text-sm text-muted-foreground">{location}</p> : null}
    <p className="text-sm leading-6 text-muted-foreground">{isDraft ? (zh ? "时间已定，大家先选活动；收到正式邀请后再确认参加。" : "The time is set. Choose an activity together; confirm attendance after the formal invitation.") : needsConfirmation ? (zh ? "高亮部分是受邀时段。看清时间后，再点击下方「确认参加」。" : "The highlighted time is the invitation. Review it, then confirm participation below.") : (zh ? "高亮部分表示最终活动时段。" : "Highlighted cells show the final activity time.")}</p>
    <div ref={scroll} className="max-h-[min(44dvh,360px)] overflow-auto rounded-xl border bg-background" tabIndex={0} aria-label={isDraft ? (zh ? "只读已定时间表，可滚动查看" : "Read-only set time; scroll to view") : (zh ? "只读受邀时间表，可滚动查看" : "Read-only invited timetable; scroll to view")}>
      {dates.map(date => {
        const day = rows.filter(row => row.date === date);
        const dayStart = new Date(Math.max(Date.parse(start), Date.parse(day[0].start))).toISOString();
        const dayEnd = new Date(Math.min(Date.parse(end), Date.parse(day.at(-1)!.end))).toISOString();
        const until = dayEnd === day.at(-1)!.end && pollClock(dayEnd, timeZone) === "00:00" ? "24:00" : pollClock(dayEnd, timeZone);
        const first = day.findIndex(row => row.through > row.from);
        const highlightedRows = day.filter(row => row.through > row.from);
        const count = highlightedRows.length;
        return <table key={date} className="w-full table-fixed border-collapse text-sm" aria-label={pollDate(date, zh)}>
          <colgroup><col className="w-16" /><col /></colgroup>
          <thead className="sticky top-0 z-10 bg-background"><tr><th colSpan={2} className="border-b p-3 text-left font-medium">
            <span className="block">{pollDate(date, zh)} · {pollClock(dayStart, timeZone)}–{until}</span>
            <span className="mt-1 block text-xs font-normal text-muted-foreground">{timeZone}</span>
          </th></tr></thead>
          <tbody>{day.map((row, index) => {
            const highlighted = row.through > row.from;
            return <tr key={row.start} data-testid={`plan-invitation-cell-${rows.indexOf(row)}`} data-highlighted={highlighted} aria-label={`${pollDate(row.date, zh)}, ${row.label}, ${highlighted ? timeLabel : (zh ? "邀请时段之外" : "Outside the invited time")}`}>
              <th scope="row" className="h-11 w-16 border-b bg-background px-1 text-xs font-normal tabular-nums">{row.label}</th>
              {!highlighted || index === first ? <td rowSpan={highlighted ? count : 1} className="relative border-b border-l bg-muted/20 p-0">
                {highlighted ? <div data-testid="plan-invitation-window" className={styles.invitationWindow + " absolute inset-x-0 flex items-center justify-center gap-1.5 overflow-hidden px-1 text-xs font-semibold"} style={{ top: `${day[first].from / count * 100}%`, height: `${(count - 1 + highlightedRows.at(-1)!.through - day[first].from) / count * 100}%` }}>
                  <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden /><span>{timeLabel}</span>
                </div> : null}
              </td> : null}
            </tr>;
          })}</tbody>
        </table>;
      })}
    </div>
  </section>;
}
