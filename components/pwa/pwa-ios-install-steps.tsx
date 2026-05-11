"use client";

import { Share, SquarePlus } from "lucide-react";

import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

/** iOS (all browsers on the device) — no `beforeinstallprompt`; user must use the system menu. */
export function PwaIosInstallSteps({ className }: { className?: string }) {
  const { meInstall: i } = useAppMessages();
  return (
    <ol className={cn("space-y-2.5 text-[12px] leading-snug text-foreground", className)}>
      <li className="flex gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Share className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </span>
        <span>{i.iosStepSafari}</span>
      </li>
      <li className="flex gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <SquarePlus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </span>
        <span>{i.iosStepChrome}</span>
      </li>
    </ol>
  );
}
