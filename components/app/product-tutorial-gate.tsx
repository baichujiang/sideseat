"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { AppPushLayer, APP_PUSH_TRANSITION_MS } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/auth/api-fetch";
import { APP_NAME } from "@/lib/constants/app";
import { formatMessage } from "@/lib/i18n/messages";
import {
  clearProductTutorialDismissedLocally,
  readProductTutorialDismissedLocally,
  writeProductTutorialDismissedLocally,
} from "@/lib/product-tutorial/storage";
import { cn } from "@/lib/utils";

export type ProductTutorialGateContext = {
  userId: string;
  isGuest: boolean;
  onboardingComplete: boolean;
  dbDismissed: boolean;
  skipAsAdmin: boolean;
};

function ProductTutorialInner({ context }: { context: ProductTutorialGateContext }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { messages: m } = useLocaleContext();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  /** Avoid re-triggering the first-run sheet on every tab route change within the same session. */
  const didAutoShowRef = useRef(false);

  const steps = useMemo(
    () => [
      { title: m.tutorial.homeTitle, body: m.tutorial.homeBody },
      { title: m.tutorial.classmatesTitle, body: m.tutorial.classmatesBody },
      { title: m.tutorial.chatsTitle, body: m.tutorial.chatsBody },
      { title: m.tutorial.meTitle, body: m.tutorial.meBody },
    ],
    [m],
  );

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const isChatThreadPath =
    /^\/connections\/[^/]+$/.test(pathname) ||
    /^\/users\/[^/]+$/.test(pathname) ||
    /^\/courses\/[^/]+\/chat$/.test(pathname) ||
    /^\/groups\/[^/]+$/.test(pathname);

  const shouldMountTutorialUi =
    context.onboardingComplete &&
    !context.skipAsAdmin &&
    !isChatThreadPath &&
    !pathname.startsWith("/onboarding") &&
    !pathname.startsWith("/admin");

  useEffect(() => {
    didAutoShowRef.current = false;
  }, [context.userId]);

  const dismissPersist = useCallback(async () => {
    writeProductTutorialDismissedLocally(context.userId);
    if (!context.isGuest) {
      void apiFetch("/api/user/product-tutorial/dismiss", { method: "POST" }).catch(() => {
        /* offline — local flag still set */
      });
    }
  }, [context.isGuest, context.userId]);

  const closeTutorial = useCallback(async () => {
    await dismissPersist();
    setOpen(false);
    setStep(0);
  }, [dismissPersist]);

  useEffect(() => {
    if (!shouldMountTutorialUi) return;

    if (searchParams.get("replayTutorial") === "1") {
      clearProductTutorialDismissedLocally(context.userId);
      setStep(0);
      setOpen(true);
      router.replace(pathname as Route, { scroll: false });
      return;
    }

    if (context.dbDismissed) {
      writeProductTutorialDismissedLocally(context.userId);
      return;
    }

    if (readProductTutorialDismissedLocally(context.userId)) return;
    if (didAutoShowRef.current) return;
    didAutoShowRef.current = true;
    setStep(0);
    setOpen(true);
  }, [context.dbDismissed, context.userId, pathname, router, searchParams, shouldMountTutorialUi]);

  if (!shouldMountTutorialUi) return null;

  const total = steps.length;
  const isLast = step >= total - 1;
  const transitionMs = reducedMotion ? 0 : APP_PUSH_TRANSITION_MS;

  return (
    <AppPushLayer
      open={open}
      onClose={() => void closeTutorial()}
      transitionDurationMs={transitionMs}
      zClassName="z-[70]"
      panelClassName="w-[min(100vw,28rem)] border-0"
      ariaLabelledBy="product-tutorial-title"
    >
      <div className="flex min-h-0 flex-1 flex-col bg-card">
        <div className="flex items-start justify-between gap-2 border-b border-border/60 px-4 pb-3 pt-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              {formatMessage(m.tutorial.stepLabel, { current: step + 1, total })}
            </p>
            <h2 id="product-tutorial-title" className="mt-1 text-lg font-semibold leading-snug text-foreground">
              {formatMessage(m.tutorial.welcomeTitle, { appName: APP_NAME })}
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">{m.tutorial.subtitle}</p>
          </div>
          <button
            type="button"
            className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
            onClick={() => void closeTutorial()}
          >
            <X className="h-5 w-5" strokeWidth={2} aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div
            className={cn(
              "rounded-2xl border border-classmates-edge bg-classmates-warm-alt/80 p-4 dark:border-border dark:bg-muted/30",
              !reducedMotion && "transition-opacity duration-200 ease-out",
            )}
          >
            <p className="text-[15px] font-semibold text-foreground">{steps[step]?.title}</p>
            <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">{steps[step]?.body}</p>
          </div>
          <p className="mt-4 text-[12px] leading-snug text-muted-foreground">{m.tutorial.replayHint}</p>
        </div>

        <div className="border-t border-border/60 px-4 py-3">
          <div className="flex items-center gap-2">
            {step > 0 ? (
              <Button type="button" variant="outline" className="flex-1 rounded-full" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                {m.tutorial.back}
              </Button>
            ) : (
              <span className="flex-1" />
            )}
            {!isLast ? (
              <Button type="button" className="flex-1 rounded-full" onClick={() => setStep((s) => Math.min(total - 1, s + 1))}>
                {m.tutorial.next}
              </Button>
            ) : (
              <Button type="button" className="flex-1 rounded-full" onClick={() => void closeTutorial()}>
                {m.tutorial.getStarted}
              </Button>
            )}
          </div>
        </div>
      </div>
    </AppPushLayer>
  );
}

export function ProductTutorialGate({ context }: { context: ProductTutorialGateContext | null }) {
  if (!context) return null;
  return (
    <Suspense fallback={null}>
      <ProductTutorialInner context={context} />
    </Suspense>
  );
}
