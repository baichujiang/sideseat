"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import { meSettingsRowListIconShellLargeClass } from "@/components/profile/me-settings-row";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

export function ReplayTutorialAccountRow() {
  const router = useRouter();
  const m = useAppMessages();

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors",
        "active:bg-classmates-warm-alt dark:active:bg-muted/30",
        "[@media(hover:hover)]:hover:bg-classmates-warm-alt dark:[@media(hover:hover)]:hover:bg-muted/25",
      )}
      onClick={() => {
        router.push("/profile/account?replayTutorial=1");
      }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span className={meSettingsRowListIconShellLargeClass}>
          <Sparkles className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold leading-tight text-foreground">{m.account.replayTutorialTitle}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">{m.account.replayTutorialSubtitle}</p>
        </div>
      </div>
    </button>
  );
}
