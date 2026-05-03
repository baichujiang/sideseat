"use client";

import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, ShieldBan, UserRoundX } from "lucide-react";

import { cn } from "@/lib/utils";

export function PeerProfileMenu({
  peerUserId,
  peerNickname,
  returnTo,
  connectionId,
}: {
  peerUserId: string;
  peerNickname: string | null;
  returnTo: string;
  connectionId?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const name = peerNickname ?? "Student";

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent | TouchEvent) => {
      const el = menuRef.current;
      if (el && event.target instanceof Node && !el.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-label="More actions"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={2} />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-10 z-20 min-w-[180px] rounded-xl border border-border bg-popover p-1 shadow-lg"
        >
          {connectionId ? (
            <form action={`/api/connections/${connectionId}/end`} method="post">
              <input type="hidden" name="returnTo" value={returnTo} />
              <MenuAction
                icon={UserRoundX}
                label={`Delete ${name}`}
                destructive
                onSelect={() => setOpen(false)}
              />
            </form>
          ) : null}

          <form action="/api/blocks" method="post">
            <input name="blockedId" type="hidden" value={peerUserId} />
            {connectionId ? <input name="connectionId" type="hidden" value={connectionId} /> : null}
            <MenuAction
              icon={ShieldBan}
              label={`Block ${name}`}
              destructive
              onSelect={() => setOpen(false)}
            />
          </form>
        </div>
      ) : null}
    </div>
  );
}

function MenuAction({
  icon: Icon,
  label,
  destructive,
  onSelect,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  destructive?: boolean;
  onSelect?: () => void;
}) {
  return (
    <button
      type="submit"
      role="menuitem"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] transition hover:bg-muted active:bg-muted/70",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
      {label}
    </button>
  );
}
