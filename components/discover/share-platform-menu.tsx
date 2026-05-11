"use client";

import type { LucideIcon } from "lucide-react";
import { Check, Share2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export type SharePlatformMenuAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Return `{ copied: true }` to flash the check affordance (clipboard-style feedback). */
  run: () => Promise<{ copied?: boolean } | void>;
  /** Overrides `copiedAriaLabel` on the trigger while the check flash is visible. */
  copiedAriaLabel?: string;
};

/**
 * Compact share trigger + dropdown used on post detail (author) and other surfaces.
 * Consumers supply platform rows; keep Xiaohongshu / copy-link logic in the parent or lib helpers.
 */
export function SharePlatformMenu({
  actions,
  idleAriaLabel,
  copiedAriaLabel,
  className,
}: {
  actions: SharePlatformMenuAction[];
  idleAriaLabel: string;
  copiedAriaLabel: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  /** Non-null while the check flash is visible (message is the trigger `aria-label`). */
  const [copiedFlash, setCopiedFlash] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent | TouchEvent) => {
      const el = menuRef.current;
      if (el && event.target instanceof Node && !el.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
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
    <div className={cn("relative shrink-0 self-start", className)} ref={menuRef}>
      <button
        type="button"
        aria-label={copiedFlash ?? idleAriaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        {copiedFlash ? (
          <Check className="h-5 w-5" strokeWidth={2.5} aria-hidden />
        ) : (
          <Share2 className="h-5 w-5" strokeWidth={2} aria-hidden />
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-10 z-20 min-w-[200px] rounded-xl border border-border bg-popover p-1 shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground transition hover:bg-muted active:bg-muted/70"
              onClick={() => {
                void (async () => {
                  const out = await action.run();
                  if (out?.copied) {
                    setCopiedFlash(action.copiedAriaLabel ?? copiedAriaLabel);
                    window.setTimeout(() => setCopiedFlash(null), 2600);
                  }
                  setOpen(false);
                })();
              }}
            >
              <action.icon className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
