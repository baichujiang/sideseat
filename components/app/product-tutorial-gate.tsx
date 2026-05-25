"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/auth/api-fetch";
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
  /** Primitive so the replay effect re-runs when only the query string changes (ReadonlyURLSearchParams identity can be stable). */
  const replayTutorialFlag = searchParams.get("replayTutorial");
  const { messages: m } = useLocaleContext();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [entered, setEntered] = useState(false);
  const didAutoShowRef = useRef(false);

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

  useEffect(() => {
    if (!shouldMountTutorialUi) return;

    if (replayTutorialFlag === "1") {
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
  }, [
    context.dbDismissed,
    context.userId,
    pathname,
    replayTutorialFlag,
    router,
    shouldMountTutorialUi,
    steps.length,
  ]);

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
      return;
    }
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
  const transitionMs = reducedMotion ? 0 : 200;
  const dur = `${transitionMs}ms`;
  const stepCopy = steps[step];

  const panel = (
    <div
      data-testid="product-tutorial"
      className={cn("pointer-events-none fixed inset-0 z-[70]", !reducedMotion && "transition-opacity duration-200")}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 flex justify-center px-3",
          "pb-[calc(5.25rem+var(--safe-bottom))]",
          "sm:px-4 lg:inset-x-auto lg:bottom-[max(1rem,var(--safe-bottom))] lg:left-[15rem] lg:right-4 lg:justify-end lg:pb-0 xl:left-[16rem]",
        )}
      >
        <div
          role="dialog"
          aria-labelledby="product-tutorial-title"
          aria-describedby="product-tutorial-body"
          className={cn(
            "pointer-events-auto w-full max-w-sm",
            "transition-[opacity,transform] ease-out",
            entered ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
            reducedMotion && entered && "translate-y-0",
          )}
          style={{ transitionDuration: dur }}
        >
          <div
            className={cn(
              "overflow-hidden rounded-[24px] border border-white/80 bg-white/95 backdrop-blur-xl",
              "shadow-[0_18px_48px_rgba(15,23,42,0.18)] ring-1 ring-classmates-edge/70",
              "dark:border-border/70 dark:bg-card/95 dark:ring-white/10 dark:shadow-[0_18px_48px_rgba(0,0,0,0.4)]",
            )}
          >
            <div className="flex items-center justify-between gap-3 px-4 pb-2.5 pt-3.5">
              <p className="rounded-full bg-classmates-warm px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-classmates-hint dark:bg-muted/60 dark:text-muted-foreground">
                {formatMessage(m.tutorial.stepLabel, { current: step + 1, total })}
              </p>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  className="rounded-full px-3 py-1.5 text-[13px] font-medium text-classmates-sub transition-colors hover:bg-classmates-warm active:bg-classmates-warm dark:text-muted-foreground dark:hover:bg-muted/50 dark:active:bg-muted/50"
                  onClick={() => void closeTutorial()}
                >
                  {m.tutorial.skip}
                </button>
                <button
                  type="button"
                  className="rounded-full p-1.5 text-classmates-sub transition-colors hover:bg-classmates-warm active:bg-classmates-warm dark:text-muted-foreground dark:hover:bg-muted/50 dark:active:bg-muted/50"
                  aria-label={m.common.close}
                  onClick={() => void closeTutorial()}
                >
                  <X className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>

            <div
              className={cn("px-4", !reducedMotion && "transition-opacity duration-150")}
              key={step}
              aria-live="polite"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-classmates-blue text-[15px] font-semibold text-white shadow-sm dark:bg-primary dark:text-primary-foreground">
                  {step + 1}
                </div>
                <div className="min-w-0">
                  <h2
                    id="product-tutorial-title"
                    className="text-[17px] font-semibold leading-tight tracking-tight text-classmates-ink dark:text-foreground"
                  >
                    {stepCopy?.title}
                  </h2>
                  <p
                    id="product-tutorial-body"
                    className="mt-1.5 text-[14px] font-normal leading-snug text-classmates-ink/90 dark:text-foreground/90"
                  >
                    {stepCopy?.body}
                  </p>
                  {step === 0 ? (
                    <p className="mt-2 text-[12.5px] leading-snug text-classmates-sub dark:text-muted-foreground">
                      {m.tutorial.subtitle}
                    </p>
                  ) : isLast ? (
                    <p className="mt-2 text-[12.5px] leading-snug text-classmates-sub dark:text-muted-foreground">
                      {m.tutorial.replayHint}
                    </p>
                  ) : (
                    <p className="mt-2 text-[12.5px] leading-snug text-classmates-sub dark:text-muted-foreground">
                      {m.tutorial.coachSubtitle}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-1.5 px-4" aria-hidden>
              {steps.map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 rounded-full transition-all duration-200",
                    i === step
                      ? "w-5 bg-classmates-blue dark:bg-primary"
                      : "w-1.5 bg-classmates-edge dark:bg-muted-foreground/35",
                  )}
                />
              ))}
            </div>

            <div className="mt-3 flex items-center gap-2 px-4 pb-4">
              {step > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 flex-1 rounded-full text-[14px] font-semibold"
                  onClick={() => setStep((s) => Math.max(0, s - 1))}
                >
                  {m.tutorial.back}
                </Button>
              ) : (
                <span className="flex-1" />
              )}
              {!isLast ? (
                <Button
                  type="button"
                  className="h-10 flex-1 rounded-full text-[14px] font-semibold"
                  onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
                >
                  {m.tutorial.next}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-10 flex-1 rounded-full text-[14px] font-semibold"
                  onClick={() => void closeTutorial()}
                >
                  {m.tutorial.getStarted}
                </Button>
              )}
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
