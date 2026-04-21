"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { PresetAvatar } from "@/components/ui/preset-avatar";
import { avatarPresets } from "@/lib/constants/avatars";
import { cn } from "@/lib/utils";

export function AvatarPicker({
  initialId,
  children,
}: {
  initialId: string | null;
  /** Rendered next to the avatar on the trigger row (usually the nickname input). */
  children?: React.ReactNode;
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
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <button
          aria-expanded={expanded}
          aria-label="Change avatar"
          className={cn(
            "rounded-full transition",
            expanded ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "hover:opacity-90",
          )}
          onClick={() => setExpanded((open) => !open)}
          type="button"
        >
          <PresetAvatar className="h-12 w-12" id={selected} />
        </button>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {expanded ? (
        <div className="grid grid-cols-5 gap-2 rounded-2xl border border-border bg-muted/30 p-2 sm:grid-cols-10">
          {avatarPresets.map((preset) => {
            const isSelected = preset.id === selected;
            return (
              <button
                aria-label={`Avatar ${preset.id}`}
                aria-pressed={isSelected}
                className={cn(
                  "rounded-full transition",
                  isSelected
                    ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                    : "opacity-80 hover:opacity-100",
                )}
                key={preset.id}
                onClick={() => choose(preset.id)}
                type="button"
              >
                <PresetAvatar className="h-10 w-10" id={preset.id} />
              </button>
            );
          })}
        </div>
      ) : null}
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </div>
  );
}
