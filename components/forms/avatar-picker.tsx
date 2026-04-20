"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { PresetAvatar } from "@/components/ui/preset-avatar";
import { avatarPresets } from "@/lib/constants/avatars";
import { cn } from "@/lib/utils";

export function AvatarPicker({ initialId }: { initialId: string | null }) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(initialId);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSelected(initialId);
  }, [initialId]);

  const choose = (id: string) => {
    if (selected === id || isPending) return;
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
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Avatar</p>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
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
              <PresetAvatar className="h-12 w-12" id={preset.id} />
            </button>
          );
        })}
      </div>
      {message ? <p className="text-xs text-destructive">{message}</p> : null}
    </div>
  );
}
