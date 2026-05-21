"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CalendarClock, CalendarRange, Check, Image, MapPin, Share2 } from "lucide-react";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import type { InboxDirectPreview } from "@/lib/chat/inbox-direct-preview";
import { cn } from "@/lib/utils";

function PreviewPill({
  tone,
  icon: Icon,
  children,
  emphasize,
}: {
  tone: "sky" | "amber" | "emerald" | "muted";
  icon: LucideIcon;
  children: ReactNode;
  emphasize?: boolean;
}) {
  const toneClass = {
    sky: "border-sky-200/90 bg-sky-50 text-sky-900 dark:border-sky-800/55 dark:bg-sky-950/40 dark:text-sky-100",
    amber:
      "border-amber-200/90 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100",
    emerald:
      "border-emerald-200/90 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100",
    muted: "border-[#E7E0D6] bg-[#FAF9F6] text-[#5F6B7A] dark:border-border dark:bg-muted/35 dark:text-zinc-300",
  }[tone];

  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 align-middle",
        toneClass,
        emphasize && "font-semibold shadow-[0_0_0_1px_rgba(0,0,0,0.02)]",
      )}
    >
      <Icon className="h-3 w-3 shrink-0 opacity-90" strokeWidth={2.25} aria-hidden />
      <span className="flex min-w-0 items-center gap-1 truncate text-[12px] leading-tight">{children}</span>
    </span>
  );
}

export function InboxDirectMessagePreview({
  fromMe,
  preview,
  emphasize = false,
}: {
  fromMe: boolean;
  preview: InboxDirectPreview;
  emphasize?: boolean;
}) {
  const { messages: m } = useLocaleContext();
  const p = m.inbox.preview;
  const youPrefix = fromMe ? (
    <span className="shrink-0 text-[12px] font-medium text-[#6B7280] dark:text-zinc-500">You:</span>
  ) : null;

  if (preview.kind === "text") {
    return (
      <p
        className={cn(
          "mt-0.5 truncate text-[13px] leading-snug text-[#5F6B7A] dark:text-zinc-400",
          emphasize && "font-semibold text-[#374151] dark:text-zinc-300",
        )}
      >
        {fromMe ? `You: ${preview.text}` : preview.text}
      </p>
    );
  }

  let pill: ReactNode = null;

  switch (preview.kind) {
    case "schedule_share":
      pill = (
        <PreviewPill tone="sky" icon={Share2} emphasize={emphasize}>
          <span className="font-semibold">{p.scheduleShared}</span>
        </PreviewPill>
      );
      break;
    case "plan_request":
      pill = (
        <PreviewPill tone="amber" icon={CalendarClock} emphasize={emphasize}>
          <span className="font-semibold">{p.planInvite}</span>
          <span className="opacity-80">·</span>
          <span className="truncate font-medium">{preview.title}</span>
          {preview.when ? (
            <>
              <span className="opacity-70">·</span>
              <span className="truncate text-[11px] font-normal opacity-90">{preview.when}</span>
            </>
          ) : null}
          {preview.needsYourReply ? (
            <span className="ml-0.5 shrink-0 rounded-full bg-amber-600/15 px-1.5 py-px text-[10px] font-semibold text-amber-900 dark:text-amber-200">
              {p.reply}
            </span>
          ) : null}
        </PreviewPill>
      );
      break;
    case "plan_confirmed":
      pill = (
        <PreviewPill tone="emerald" icon={Check} emphasize={emphasize}>
          <span className="font-semibold">{p.planConfirmed}</span>
          <span className="opacity-80">·</span>
          <span className="truncate font-medium">{preview.title}</span>
          {preview.when ? (
            <>
              <span className="opacity-70">·</span>
              <span className="truncate text-[11px] font-normal opacity-90">{preview.when}</span>
            </>
          ) : null}
        </PreviewPill>
      );
      break;
    case "availability":
      pill = (
        <PreviewPill tone="sky" icon={CalendarRange} emphasize={emphasize}>
          <span className="font-semibold">{p.availabilityShared}</span>
        </PreviewPill>
      );
      break;
    case "image":
      pill = (
        <PreviewPill tone="muted" icon={Image} emphasize={emphasize}>
          <span className="font-semibold">{p.photo}</span>
        </PreviewPill>
      );
      break;
    case "location":
      pill = (
        <PreviewPill tone="emerald" icon={MapPin} emphasize={emphasize}>
          <span className="font-semibold">{p.location}</span>
          {preview.place ? (
            <>
              <span className="opacity-80">·</span>
              <span className="truncate font-normal">{preview.place}</span>
            </>
          ) : null}
        </PreviewPill>
      );
      break;
    default:
      return null;
  }

  return (
    <div
      className={cn(
        "mt-0.5 flex min-w-0 items-center gap-1.5",
        emphasize && "font-semibold",
      )}
    >
      {youPrefix}
      {pill}
    </div>
  );
}
