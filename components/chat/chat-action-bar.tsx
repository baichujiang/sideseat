"use client";

import { useMemo, useState, type ComponentType } from "react";
import { Contact, ChevronDown, Star } from "lucide-react";
import { FriendLinkStatus } from "@prisma/client";

import { ContactExchangePanel } from "@/components/social/contact-exchange-panel";
import {
  FriendLinkPanel,
  type FriendLinkState,
} from "@/components/social/friend-link-panel";
import type {
  ContactExchangeState,
  ContactHandles,
} from "@/lib/queries/contact-exchange";
import { cn } from "@/lib/utils";

type TrayKey = "contact" | "friend" | null;
type DotKind = "alert" | "pending" | "ok" | null;

/**
 * Compact toolbar that sits above the chat composer and collapses every
 * optional action into a single row of small icon buttons. Tap an icon to
 * expand a tray above the bar that hosts the full controls — contact
 * exchange (request/accept/decline/cancel/handles) and close-friend link.
 *
 * The icons carry a tiny status dot so users don't have to open the tray to
 * know something needs their attention:
 *  - red `alert`   → an incoming request is waiting on you.
 *  - gray `pending` → you're waiting on the other side.
 *  - green `ok`    → already accepted (handles visible / close friends).
 */
export function ChatActionBar({
  connectionId,
  currentUserId,
  peerNickname,
  contactState,
  selfHandles,
  peerHandles,
  friendLink,
  returnTo,
}: {
  connectionId: string;
  currentUserId: string;
  peerNickname: string | null;
  contactState: ContactExchangeState;
  selfHandles: ContactHandles;
  peerHandles: ContactHandles | null;
  friendLink: FriendLinkState;
  returnTo: string;
}) {
  const [open, setOpen] = useState<TrayKey>(null);
  const toggle = (key: Exclude<TrayKey, null>) =>
    setOpen((curr) => (curr === key ? null : key));

  const contactDot: DotKind =
    contactState.kind === "incoming_pending"
      ? "alert"
      : contactState.kind === "outgoing_pending"
        ? "pending"
        : contactState.kind === "accepted"
          ? "ok"
          : null;

  const friendDot: DotKind =
    friendLink?.status === FriendLinkStatus.PENDING &&
    friendLink.responderId === currentUserId
      ? "alert"
      : friendLink?.status === FriendLinkStatus.PENDING &&
          friendLink.requesterId === currentUserId
        ? "pending"
        : friendLink?.status === FriendLinkStatus.ACCEPTED
          ? "ok"
          : null;

  const contactSummary = useMemo(() => {
    switch (contactState.kind) {
      case "accepted":
        return "Contact shared";
      case "incoming_pending":
        return "Needs your reply";
      case "outgoing_pending":
        return "Request sent";
      case "cooldown":
        return "Temporarily paused";
      default:
        return "Still private";
    }
  }, [contactState.kind]);

  const friendSummary = useMemo(() => {
    if (friendLink?.status === FriendLinkStatus.ACCEPTED) return "Close friends";
    if (
      friendLink?.status === FriendLinkStatus.PENDING &&
      friendLink.responderId === currentUserId
    ) {
      return "Needs your reply";
    }
    if (
      friendLink?.status === FriendLinkStatus.PENDING &&
      friendLink.requesterId === currentUserId
    ) {
      return "Invite sent";
    }
    return "Optional upgrade";
  }, [friendLink, currentUserId]);

  return (
    <div className="space-y-2">
      {open === "contact" ? (
        <div className="rounded-2xl border border-border bg-muted/20 px-3 py-3">
          <ContactExchangePanel
            connectionId={connectionId}
            peerNickname={peerNickname}
            state={contactState}
            selfHandles={selfHandles}
            peerHandles={peerHandles}
            variant="profile"
            returnTo={returnTo}
          />
        </div>
      ) : null}
      {open === "friend" ? (
        <div className="rounded-2xl border border-border bg-muted/20 px-3 py-3">
          <FriendLinkPanel
            connectionId={connectionId}
            currentUserId={currentUserId}
            peerNickname={peerNickname}
            returnTo={returnTo}
            friendLink={friendLink}
            variant="profile"
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <TrayButton
          icon={Contact}
          label="Contact exchange"
          summary={contactSummary}
          active={open === "contact"}
          dot={contactDot}
          onClick={() => toggle("contact")}
        />
        <TrayButton
          icon={Star}
          label="Close friend"
          summary={friendSummary}
          active={open === "friend"}
          dot={friendDot}
          filled={friendDot === "ok"}
          onClick={() => toggle("friend")}
        />
      </div>
    </div>
  );
}

function TrayButton({
  icon: Icon,
  label,
  summary,
  active,
  dot,
  filled,
  onClick,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number; fill?: string }>;
  label: string;
  summary: string;
  active: boolean;
  dot: DotKind;
  filled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "relative flex min-w-0 items-center gap-2 rounded-2xl border px-3 py-2 text-left transition",
        active
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-background text-foreground hover:bg-muted/60 active:bg-muted/80",
      )}
    >
      <Icon
        className="h-[18px] w-[18px] shrink-0"
        strokeWidth={2}
        fill={filled ? "currentColor" : "none"}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold leading-tight">{label}</p>
        <p className="truncate text-[10.5px] text-muted-foreground">{summary}</p>
      </div>
      <ChevronDown
        className={cn("h-4 w-4 shrink-0 transition", active ? "rotate-180" : undefined)}
        strokeWidth={2.25}
      />
      {dot ? (
        <span
          className={cn(
            "absolute right-2 top-2 h-2 w-2 rounded-full ring-2 ring-background",
            dot === "alert" && "bg-rose-500",
            dot === "pending" && "bg-muted-foreground/60",
            dot === "ok" && "bg-emerald-500",
          )}
          aria-hidden
        />
      ) : null}
    </button>
  );
}
