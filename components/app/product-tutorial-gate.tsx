"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronUp, X } from "lucide-react";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { useRegisterDismissOnEdgeSwipe } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/auth/api-fetch";
import { APP_NAME } from "@/lib/constants/app";
import { formatMessage } from "@/lib/i18n/messages";
import {
  clearProductTutorialDismissedLocally,
  clearProductTutorialStepSession,
  readProductTutorialDismissedLocally,
  readProductTutorialStepSession,
  writeProductTutorialDismissedLocally,
  writeProductTutorialStepSession,
} from "@/lib/product-tutorial/storage";
import { cn } from "@/lib/utils";

export type ProductTutorialGateContext = {
  userId: string;
  isGuest: boolean;
  onboardingComplete: boolean;
  dbDismissed: boolean;
  skipAsAdmin: boolean;
};

const STEP_ROUTES = ["/home", "/discover", "/inbox", "/profile"] as const satisfies readonly Route[];

function pathMatchesTutorialRoute(route: (typeof STEP_ROUTES)[number], pathname: string) {
  return pathname === route || pathname.startsWith(`${route}/`);
}

function ProductTutorialInner({ context }: { context: ProductTutorialGateContext }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { messages: m } = useLocaleContext();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [entered, setEntered] = useState(false);
  const didAutoShowRef = useRef(false);
  const backdropClickableRef = useRef(false);

  const steps = useMemo(
    () => [
      { title: m.tutorial.homeTitle, body: m.tutorial.homeBody },
      { title: m.tutorial.discoverTabTitle, body: m.tutorial.discoverTabBody },
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
    clearProductTutorialStepSession(context.userId);
    await dismissPersist();
    setOpen(false);
    setStep(0);
    setEntered(false);
  }, [context.userId, dismissPersist]);

  useRegisterDismissOnEdgeSwipe(open, () => {
    void closeTutorial();
  });

  useEffect(() => {
    if (!shouldMountTutorialUi) return;

    if (searchParams.get("replayTutorial") === "1") {
      didAutoShowRef.current = true;
      clearProductTutorialDismissedLocally(context.userId);
      clearProductTutorialStepSession(context.userId);
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
    const restored = readProductTutorialStepSession(context.userId);
    setStep(restored != null && restored >= 0 && restored < steps.length ? restored : 0);
    setOpen(true);
  }, [context.dbDismissed, context.userId, pathname, router, searchParams, shouldMountTutorialUi, steps.length]);

  useEffect(() => {
    if (!open || !shouldMountTutorialUi) return;
    writeProductTutorialStepSession(context.userId, step);
  }, [context.userId, open, shouldMountTutorialUi, step]);

  useEffect(() => {
    if (!open || !shouldMountTutorialUi) return;
    const target = STEP_ROUTES[step] ?? STEP_ROUTES[0];
    if (!pathMatchesTutorialRoute(target, pathname)) {
      router.push(target, { scroll: false });
    }
  }, [open, pathname, router, shouldMountTutorialUi, step]);

  useEffect(() => {
    if (!open) {
      setEntered(false);
      backdropClickableRef.current = false;
      return;
    }
    backdropClickableRef.current = false;
    if (reducedMotion) {
      setEntered(true);
      return;
    }
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEntered(true));
    });
    return () => cancelAnimationFrame(id);
  }, [open, reducedMotion]);

  useEffect(() => {
    if (!open) {
      backdropClickableRef.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      backdropClickableRef.current = true;
    }, 450);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void closeTutorial();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closeTutorial, open]);

  if (!shouldMountTutorialUi) return null;

  const total = steps.length;
  const isLast = step >= total - 1;
  const transitionMs = reducedMotion ? 0 : 220;
  const dur = `${transitionMs}ms`;

  const panel = (
    <div className={cn("pointer-events-none fixed inset-0 z-[70] flex flex-col justify-end", !reducedMotion && "duration-200")}>
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className={cn(
          "pointer-events-auto absolute inset-0 bg-black/40 transition-opacity ease-out",
          entered ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDuration: dur }}
        onClick={() => {
          if (backdropClickableRef.current) void closeTutorial();
        }}
      />

      <div className="pointer-events-none relative flex max-h-[min(40vh,320px)] min-h-0 w-full max-w-md justify-center justify-self-center sm:mx-auto">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-tutorial-title"
          className={cn(
            "pointer-events-auto relative mb-0 flex w-full min-h-0 max-w-md flex-col rounded-t-2xl border border-border/60 bg-card shadow-[0_-8px_40px_-12px_rgba(15,23,42,0.25)] dark:shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.45)]",
            "transition-[transform,opacity] ease-[cubic-bezier(0.32,0.72,0,1)] will-change-transform",
            entered ? "translate-y-0 opacity-100" : "translate-y-full opacity-0",
          )}
          style={{ transitionDuration: dur }}
        >
          <div
            className="pointer-events-none absolute -top-[11px] left-1/2 z-10 -translate-x-1/2 text-card"
            aria-hidden
          >
            <ChevronUp className="h-6 w-10 drop-shadow-sm" strokeWidth={2.25} />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-2xl">
            <div className="flex items-start justify-between gap-2 border-b border-border/60 px-4 pb-2 pt-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {formatMessage(m.tutorial.stepLabel, { current: step + 1, total })}
                </p>
                <h2 id="product-tutorial-title" className="mt-0.5 text-base font-semibold leading-snug text-foreground">
                  {formatMessage(m.tutorial.welcomeTitle, { appName: APP_NAME })}
                </h2>
                <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{m.tutorial.coachSubtitle}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 rounded-full px-2 text-[12px] text-muted-foreground"
                  onClick={() => void closeTutorial()}
                >
                  {m.tutorial.skip}
                </Button>
                <button
                  type="button"
                  className="rounded-full p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Close"
                  onClick={() => void closeTutorial()}
                >
                  <X className="h-5 w-5" strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div
                className={cn(
                  "rounded-xl border border-classmates-edge bg-classmates-warm-alt/80 p-3 dark:border-border dark:bg-muted/30",
                  !reducedMotion && "transition-opacity duration-200 ease-out",
                )}
              >
                <p className="text-[15px] font-semibold text-foreground">{steps[step]?.title}</p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{steps[step]?.body}</p>
              </div>
              <p className="mt-3 text-[11px] leading-snug text-muted-foreground">{m.tutorial.replayHint}</p>
            </div>

            <div className="border-t border-border/60 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex items-center gap-2">
                {step > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 rounded-full"
                    onClick={() => setStep((s) => Math.max(0, s - 1))}
                  >
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
        </div>
      </div>
    </div>
  );

  if (!open) return null;

  return typeof document !== "undefined" ? createPortal(panel, document.body) : null;
}

export function ProductTutorialGate({ context }: { context: ProductTutorialGateContext | null }) {
  if (!context) return null;
  return (
    <Suspense fallback={null}>
      <ProductTutorialInner context={context} />
    </Suspense>
  );
}
