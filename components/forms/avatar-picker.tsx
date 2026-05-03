"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { PresetAvatar } from "@/components/ui/preset-avatar";
import { AVATAR_IDS } from "@/lib/constants/avatars";
import { cn } from "@/lib/utils";

export function AvatarPicker({
  initialId,
  children,
  homepage = false,
}: {
  initialId: string | null;
  /** Rendered next to the avatar on the trigger row (usually the nickname input). */
  children?: React.ReactNode;
  /** Tighter home header: larger tap target, top-aligned with multi-line text. */
  homepage?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(initialId);
  const [expanded, setExpanded] = useState(false);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSelected(initialId);
  }, [initialId]);

  const choose = (id: string) => {
    if (isPending) return;
    const previous = selected;
    setSelected(id);
    setMessage("");
    startTransition(async () => {
      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId: id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.success) {
        setSelected(previous);
        setMessage(payload.error ?? "Could not save avatar.");
        return;
      }
      setExpanded(false);
      router.refresh();
    });
  };

  return (
    <div className={cn("space-y-2", homepage && "space-y-2.5")}>
      <div className={cn("flex gap-3", homepage ? "items-start" : "items-center")}>
        <button
          aria-expanded={expanded}
          aria-label="Change avatar"
          className={cn(
            "shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            homepage
              ? cn(
                  "bg-background shadow-sm ring-2",
                  expanded
                    ? "ring-primary ring-offset-2 ring-offset-background"
                    : "ring-border/55 hover:ring-primary/45",
                )
              : expanded
                ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                : "hover:opacity-90",
          )}
          onClick={() => setExpanded((open) => !open)}
          type="button"
        >
          <PresetAvatar
            className={homepage ? "h-[3.25rem] w-[3.25rem]" : "h-12 w-12"}
            id={selected}
          />
        </button>
        <div className="min-w-0 flex-1 pt-px">{children}</div>
      </div>
      {expanded ? (
        <div
          className={cn(
            "grid grid-cols-5 gap-2 rounded-2xl border p-2 sm:grid-cols-10",
            homepage
              ? "border-border/80 bg-card/95 shadow-sm backdrop-blur-sm"
              : "border-border bg-muted/30",
          )}
        >
          {AVATAR_IDS.map((id) => {
            const isSelected = id === selected;
            return (
              <button
                aria-label={`Avatar ${id}`}
                aria-pressed={isSelected}
                className={cn(
                  "rounded-full transition",
                  isSelected
                    ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                    : "opacity-80 hover:opacity-100",
                )}
                key={id}
                onClick={() => choose(id)}
                type="button"
              >
                <PresetAvatar className="h-10 w-10" id={id} />
              </button>
            );
          })}
        </div>
      ) : null}
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </div>
  );
}
