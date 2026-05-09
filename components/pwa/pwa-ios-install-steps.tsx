import { Share, SquarePlus } from "lucide-react";

import { cn } from "@/lib/utils";

/** iOS (all browsers on the device) — no `beforeinstallprompt`; user must use the system menu. */
export function PwaIosInstallSteps({ className }: { className?: string }) {
  return (
    <ol className={cn("space-y-2.5 text-[12px] leading-snug text-foreground", className)}>
      <li className="flex gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Share className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </span>
        <span>
          <span className="font-medium text-foreground">Safari</span>
          <span className="text-muted-foreground"> — </span>
          Tap <strong className="font-semibold">Share</strong> in the toolbar (square with arrow), then{" "}
          <strong className="font-semibold">Add to Home Screen</strong>.
        </span>
      </li>
      <li className="flex gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <SquarePlus className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        </span>
        <span>
          <span className="font-medium text-foreground">Chrome / others on iPhone</span>
          <span className="text-muted-foreground"> — </span>
          Tap <strong className="font-semibold">⋯</strong> (menu) and look for{" "}
          <strong className="font-semibold">Add to Home Screen</strong>.
        </span>
      </li>
    </ol>
  );
}
