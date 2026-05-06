"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import type { CalendarRepeatRule } from "@prisma/client";
import type { Route } from "next";
import { format } from "date-fns";
import {
  Clock3,
  Loader2,
  MapPin,
  MessageCircle,
  Palette,
  Repeat2,
  UsersRound,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ScheduleDetailItem = {
  id: string;
  source: "course" | "calendar";
  title: string;
  startISO: string;
  endISO: string;
  location: string | null;
  note: string | null;
  repeatLabel: string;
  repeatRule: CalendarRepeatRule;
  repeatUntilISO: string | null;
  eventParticipants: Array<{ userId: string | null; name: string }>;
  categoryId?: string | null;
  categoryName?: string | null;
  categoryColor?: string | null;
};

export function ScheduleItemDetailSheet({
  item,
  open,
  deleting = false,
  chatReturnTo = "/home",
  onClose,
  onEdit,
  onDelete,
  onInvite,
}: {
  item: ScheduleDetailItem | null;
  open: boolean;
  deleting?: boolean;
  /** `returnTo` query when opening a chat thread from a participant chip. */
  chatReturnTo?: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onInvite: () => void;
}) {
  const router = useRouter();
  const [openingChatUserId, setOpeningChatUserId] = useState<string | null>(null);
  const [chatError, setChatError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !item) return;
    setChatError(null);
    setOpeningChatUserId(null);
  }, [open, item?.id]);

  if (!open || !item) return null;

  const start = new Date(item.startISO);
  const end = new Date(item.endISO);
  const timeLabel = `${format(start, "EEE, d MMM · HH:mm")} - ${format(end, "HH:mm")}`;
  const canEdit = item.source === "calendar";
  const locationValue = item.location?.trim() ? item.location : "No location";
  const repeatValue = item.repeatLabel;
  const noteValue = item.note?.trim() ? item.note : "No notes";
  const categoryLabel = item.categoryName?.trim()
    ? item.categoryName
    : item.categoryColor
      ? "Custom"
      : null;

  const participants = item.eventParticipants;
  const hasPeople = participants.length > 0;
  const chatable = participants.filter((p) => p.userId);

  async function openChat(peerId: string) {
    if (openingChatUserId) return;
    setChatError(null);
    setOpeningChatUserId(peerId);
    try {
      const res = await apiFetch("/api/connections/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOpeningChatUserId(null);
        setChatError(
          typeof payload?.error === "string" ? payload.error : "Unable to open chat.",
        );
        return;
      }
      const data = payload?.data as { connectionId?: string } | undefined;
      if (!data?.connectionId) {
        setOpeningChatUserId(null);
        setChatError("Unexpected server response.");
        return;
      }
      const suffix = `?returnTo=${encodeURIComponent(chatReturnTo)}`;
      router.push(`/connections/${data.connectionId}${suffix}` as Route);
      router.refresh();
      onClose();
    } catch {
      setOpeningChatUserId(null);
      setChatError("Network error. Try again.");
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close schedule details"
        onClick={onClose}
        className="fixed inset-0 z-40 bg-foreground/12 backdrop-blur-[1px]"
      />

      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <section className="overflow-hidden rounded-[2rem] border border-border/60 bg-card shadow-[0_-8px_40px_-18px_rgba(15,23,42,0.28)]">
          <div className="flex justify-center pt-2">
            <span className="h-1 w-10 rounded-full bg-muted-foreground/20" />
          </div>

          <div className="flex max-h-[min(82vh,40rem)] flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-border/50 px-4 pb-3 pt-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[17px] font-semibold leading-tight text-foreground">{item.title}</p>
                <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full bg-muted/[0.4] px-3 py-1.5 text-[12px] text-muted-foreground">
                  <Clock3 className="h-3.5 w-3.5 shrink-0" strokeWidth={2.1} />
                  <span className="truncate">{timeLabel}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close schedule details"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition hover:text-foreground"
              >
                <X className="h-4 w-4" strokeWidth={2.25} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 pt-3">
              <div className="space-y-2.5">
                <div className="rounded-2xl border border-border/70 bg-muted/[0.03] px-4 py-3">
                  {categoryLabel ? (
                    <DetailRow
                      icon={<Palette className="h-4 w-4" strokeWidth={2.1} />}
                      label="Category"
                      value={
                        <span className="inline-flex items-center gap-2">
                          {item.categoryColor ? (
                            <span
                              className="h-3 w-3 shrink-0 rounded-full border border-border/60 shadow-sm"
                              style={{ backgroundColor: item.categoryColor }}
                              aria-hidden
                            />
                          ) : null}
                          <span>{categoryLabel}</span>
                        </span>
                      }
                      compact
                    />
                  ) : null}
                  <DetailRow
                    icon={<MapPin className="h-4 w-4" strokeWidth={2.1} />}
                    label="Location"
                    value={locationValue}
                    compact
                    divider={Boolean(categoryLabel)}
                  />
                  <DetailRow
                    icon={<Repeat2 className="h-4 w-4" strokeWidth={2.1} />}
                    label="Repeat"
                    value={repeatValue}
                    compact
                    divider
                  />
                  <div
                    className={cn(
                      "flex items-start gap-3 py-2.5",
                      "mt-2.5 border-t border-border/50 pt-2.5",
                    )}
                  >
                    <span className="mt-0.5 shrink-0 text-muted-foreground">
                      <UsersRound className="h-4 w-4" strokeWidth={2.1} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-muted-foreground">People</p>
                      {!hasPeople ? (
                        <p className="mt-0.5 text-[13px] leading-relaxed text-foreground">No people added</p>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {participants.map((p, idx) =>
                            p.userId ? (
                              <button
                                key={`${p.userId}-${idx}`}
                                type="button"
                                disabled={openingChatUserId !== null}
                                onClick={() => void openChat(p.userId!)}
                                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1.5 text-left text-[13px] font-medium text-primary transition hover:bg-primary/15 disabled:opacity-60"
                              >
                                {openingChatUserId === p.userId ? (
                                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" strokeWidth={2.25} />
                                ) : (
                                  <MessageCircle className="h-3.5 w-3.5 shrink-0" strokeWidth={2.25} />
                                )}
                                <span className="truncate">{p.name}</span>
                              </button>
                            ) : (
                              <span
                                key={`name-${idx}`}
                                className="inline-flex max-w-full items-center rounded-full border border-border/70 bg-muted/20 px-3 py-1.5 text-[13px] text-foreground/80"
                              >
                                <span className="truncate">{p.name}</span>
                              </span>
                            ),
                          )}
                        </div>
                      )}
                      {chatable.length > 0 ? (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Tap a name to open your chat thread.
                        </p>
                      ) : null}
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={onInvite}
                          className="mt-2 text-[12px] font-medium text-primary hover:underline"
                        >
                          Invite or edit people
                        </button>
                      ) : null}
                      {chatError ? <p className="mt-2 text-[11px] text-destructive">{chatError}</p> : null}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/70 bg-muted/[0.035] px-4 py-3">
                  <p className="text-[12px] font-medium text-muted-foreground">Notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                    {noteValue}
                  </p>
                </div>

                {canEdit ? (
                  <div className="mt-1 border-t border-border/50 pt-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" className="h-11 rounded-full" onClick={onEdit}>
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 rounded-full text-destructive hover:bg-destructive/8 hover:text-destructive"
                        onClick={onDelete}
                        disabled={deleting}
                      >
                        {deleting ? "Deleting…" : "Delete"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function DetailRow({
  icon,
  label,
  value,
  compact = false,
  divider = false,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  compact?: boolean;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3",
        compact ? "py-2.5" : "rounded-2xl border border-border/70 bg-muted/[0.05] px-4 py-3",
        divider && "mt-2.5 border-t border-border/50 pt-2.5",
      )}
    >
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-muted-foreground">{label}</p>
        <div className="mt-0.5 text-[13px] leading-relaxed text-foreground">{value}</div>
      </div>
    </div>
  );
}
