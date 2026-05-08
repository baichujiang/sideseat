"use client";

import { Share, SquarePlus } from "lucide-react";

import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";

export function PwaIosInstallHelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AppPushLayer
      open={open}
      onClose={onClose}
      zClassName="z-[60]"
      backdropClassName="bg-black/40 !backdrop-blur-none"
      panelClassName="w-[min(100vw,24rem)] border-0 bg-transparent shadow-none dark:shadow-none"
      ariaLabelledBy="pwa-ios-title"
    >
      <div className="flex h-full min-h-0 flex-col justify-end px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-12 sm:justify-center">
        <div className="w-full rounded-2xl border border-border bg-card p-4 shadow-xl">
          <h2 id="pwa-ios-title" className="text-base font-semibold text-foreground">
            Add to Home Screen
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
            On iOS, you add web apps from the system menu—Safari can’t show an install dialog like
            Chrome.
          </p>
          <ol className="mt-3 space-y-3 text-[13px] text-foreground">
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Share className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <span>
                Tap the <strong className="font-semibold">Share</strong> button in the toolbar
                <span className="text-muted-foreground"> (square with an arrow)</span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <SquarePlus className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <span>
                Scroll down and choose <strong className="font-semibold">Add to Home Screen</strong>
              </span>
            </li>
          </ol>
          <Button type="button" className="mt-4 w-full rounded-xl" onClick={onClose}>
            Got it
          </Button>
        </div>
      </div>
    </AppPushLayer>
  );
}
