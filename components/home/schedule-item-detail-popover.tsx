"use client";

import Link from "next/link";
import type { Route } from "next";
import { format } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { Clock3, Loader2, MapPin, Repeat2, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { useGhostClickGuard } from "@/lib/ui/suppress-ghost-click";
import { isIcsFeedStudyEntryId } from "@/lib/calendar/ics-feed-event-id";
import { formatMessage } from "@/lib/i18n/messages";
import { useAppLocale, useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

import type { ScheduleDetailItem } from "@/components/home/schedule-item-detail-sheet";

export function ScheduleItemDetailPopover({
  item,
  anchorEl,
  open,
  deleting = false,
  chatReturnTo = "/home",
  onClose,
  onEdit,
  onDelete,
  planInvitePeer,
  onSendPlanInvite,
  planInviteBusy = false,
  planInviteError,
}: {
  item: ScheduleDetailItem | null;
  anchorEl: HTMLElement | null;
  open: boolean;
  deleting?: boolean;
  chatReturnTo?: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  planInvitePeer?: { userId: string; name: string } | null;
  onSendPlanInvite?: () => void;
  planInviteBusy?: boolean;
  planInviteError?: string | null;
}) {
  const { locale } = useAppLocale();
  const { schedule: s } = useAppMessages();
  const dfLocale = locale === "zh-CN" ? zhCN : enUS;
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const guardAction = useGhostClickGuard(open && item ? item.id : null);
  const itemId = item?.id;

  useLayoutEffect(() => {
    if (!open || !anchorEl || !itemId) {
      setPos(null);
      return;
    }

    const recompute = () => {
      const anchorRect = anchorEl.getBoundingClientRect();
      const panel = panelRef.current;
      const pw = panel?.offsetWidth ?? 280;
      const ph = panel?.offsetHeight ?? 220;
      const margin = 8;
      const gap = 10;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = anchorRect.right + gap;
      if (left + pw > vw - margin) {
        left = anchorRect.left - gap - pw;
      }
      if (left < margin) {
        left = Math.max(margin, Math.min(vw - margin - pw, anchorRect.left + anchorRect.width / 2 - pw / 2));
      }

      let top = anchorRect.top + anchorRect.height / 2 - ph / 2;
      if (top < margin) top = margin;
      if (top + ph > vh - margin) top = Math.max(margin, vh - margin - ph);

      setPos({ top, left });
    };

    recompute();
    const ro = new ResizeObserver(recompute);
    ro.observe(anchorEl);
    if (panelRef.current) ro.observe(panelRef.current);

    let raf: number | null = null;
    const onScrollOrResize = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        recompute();
      });
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);

    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [open, anchorEl, itemId]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (ev: PointerEvent) => {
      const t = ev.target;
      if (!(t instanceof Node)) return;
      if (t instanceof Element && t.closest("[data-schedule-detail-popover-root]")) return;
      if (anchorEl?.contains(t)) return;
      onClose();
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [open, anchorEl, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !item || typeof window === "undefined") return null;

  const displayItem = item;

  const start = new Date(displayItem.startISO);
  const end = new Date(displayItem.endISO);
  const timeLabel =
    locale === "zh-CN"
      ? `${format(start, "M月d日 EEE · HH:mm", { locale: dfLocale })} – ${format(end, "HH:mm")}`
      : `${format(start, "EEE, d MMM · HH:mm", { locale: dfLocale })} – ${format(end, "HH:mm")}`;
  const canEdit = displayItem.source === "calendar" && !isIcsFeedStudyEntryId(displayItem.id);
  const fromSubscribedCalendar = isIcsFeedStudyEntryId(displayItem.id);
  const locationLine = displayItem.location?.trim() || null;
  const noteLine = displayItem.note?.trim() || null;
  const showRepeat = displayItem.repeatRule && displayItem.repeatRule !== "NONE";

  const fallbackCentered = !pos;

  return createPortal(
    <div
      ref={wrapRef}
      data-schedule-detail-popover-root
      className={cn(
        "fixed z-[190] select-none",
        fallbackCentered && "inset-0 flex items-center justify-center p-4",
      )}
      style={
        fallbackCentered
          ? undefined
          : {
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? "visible" : "hidden",
            }
      }
      role="presentation"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {fallbackCentered ? (
        <button
          type="button"
          aria-label={s.detailPopoverDismissAria}
          className="absolute inset-0 bg-black/20 dark:bg-black/45"
          onClick={onClose}
        />
      ) : null}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schedule-detail-popover-title"
        className={cn(
          "pointer-events-auto w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-black/[0.08] bg-white shadow-[0_20px_48px_-14px_rgba(15,23,42,0.38)] ring-1 ring-black/[0.04]",
          "md:w-[min(22rem,calc(100vw-2rem))] lg:w-[min(28rem,calc(100vw-2rem))] xl:w-[min(32rem,calc(100vw-2rem))]",
          "dark:border-white/10 dark:bg-zinc-900 dark:ring-white/10",
          fallbackCentered && "relative z-[1]",
        )}
      >
        <div className="flex items-start justify-between gap-2 border-b border-border/50 px-3.5 pb-2.5 pt-3">
          <div className="min-w-0 flex-1">
            <p
              id="schedule-detail-popover-title"
              className="line-clamp-2 text-[15px] font-semibold leading-snug text-foreground md:text-base lg:text-[17px]"
            >
              {displayItem.title}
            </p>
            {fromSubscribedCalendar ? (
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {s.detailPopoverReadOnlyFeed}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={s.detailPopoverDismissAria}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="space-y-2 px-3.5 py-3 md:space-y-2.5 md:px-4 md:py-3.5">
          <div className="inline-flex max-w-full items-center gap-2 rounded-full bg-muted/40 px-2.5 py-1 text-[11px] text-muted-foreground md:text-xs">
            <Clock3 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.1} />
            <span className="truncate">{timeLabel}</span>
          </div>

          {locationLine ? (
            <p className="flex items-start gap-2 text-[12px] leading-snug text-foreground/90 md:text-[13px]">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.1} />
              <span className="min-w-0 break-words">{locationLine}</span>
            </p>
          ) : null}

          {showRepeat ? (
            <p className="flex items-start gap-2 text-[12px] leading-snug text-foreground/90 md:text-[13px]">
              <Repeat2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.1} />
              <span className="min-w-0">{displayItem.repeatLabel}</span>
            </p>
          ) : null}

          {noteLine ? (
            <p className="line-clamp-3 whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground md:text-[13px]">
              {noteLine}
            </p>
          ) : null}

          {displayItem.discoverActivityId ? (
            <Link
              href={`/discover/activities/${displayItem.discoverActivityId}?returnTo=${encodeURIComponent(chatReturnTo)}` as Route}
              className="block text-center text-[12px] font-semibold text-classmates-blue no-underline hover:underline"
              onClick={onClose}
            >
              {s.viewDiscoverActivity}
            </Link>
          ) : null}

          {planInvitePeer && onSendPlanInvite ? (
            <div className="space-y-1.5 border-t border-border/50 pt-2.5">
              <Button
                type="button"
                variant="secondary"
                className="h-9 w-full rounded-full text-[12px] font-semibold"
                onClick={guardAction(onSendPlanInvite)}
                disabled={planInviteBusy || deleting}
              >
                {planInviteBusy ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden />
                    {s.sendPlanInviteOpening}
                  </>
                ) : (
                  formatMessage(s.sendPlanInviteTo, { name: planInvitePeer.name })
                )}
              </Button>
              {planInviteError ? (
                <p className="text-[11px] leading-snug text-destructive">{planInviteError}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        {canEdit ? (
          <div className="grid grid-cols-2 gap-2 border-t border-border/50 px-3.5 py-3">
            <Button type="button" className="h-10 rounded-full text-[13px]" onClick={guardAction(onEdit)}>
              {s.detailPopoverEdit}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="h-10 rounded-full text-[13px] text-destructive hover:bg-destructive/8 hover:text-destructive"
              onClick={guardAction(onDelete)}
              disabled={deleting}
            >
              {deleting ? s.detailPopoverDeleting : s.detailPopoverDelete}
            </Button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
