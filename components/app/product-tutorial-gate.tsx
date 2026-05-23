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

const STEP_ROUTES = ["/home", "/courses", "/discover", "/inbox", "/profile"] as const satisfies readonly Route[];

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
  const backdropClickableRef = useRef(false);

  const steps = useMemo(
    () => [
      { title: m.tutorial.homeTitle, body: m.tutorial.homeBody },
      { title: m.tutorial.coursesTitle, body: m.tutorial.coursesBody },
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
    }, 320);
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
  const transitionMs = reducedMotion ? 0 : 200;
  const dur = `${transitionMs}ms`;
  const stepCopy = steps[step];

  const panel = (
    <div
      data-testid="product-tutorial"
      className={cn("fixed inset-0 z-[70]", !reducedMotion && "transition-opacity duration-200")}
    >
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        className={cn(
          "absolute inset-0 bg-black/45 transition-opacity ease-out dark:bg-black/60",
          entered ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDuration: dur }}
        onClick={() => {
          if (backdropClickableRef.current) void closeTutorial();
        }}
      />

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 flex justify-center",
          "pb-[calc(4.75rem+var(--safe-bottom))]",
        )}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-tutorial-title"
          className={cn(
            "pointer-events-auto w-full max-w-md px-3",
            "transition-[opacity,transform] ease-out",
            entered ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0",
            reducedMotion && entered && "translate-y-0",
          )}
          style={{ transitionDuration: dur }}
        >
          <div
            className={cn(
              "overflow-hidden rounded-[22px] border border-classmates-edge bg-classmates-surface",
              "shadow-[0_8px_40px_rgba(15,23,42,0.18)] dark:border-border dark:bg-card dark:shadow-[0_8px_40px_rgba(0,0,0,0.45)]",
            )}
          >
            <div className="flex justify-center pt-2.5" aria-hidden>
              <span className="h-1 w-9 rounded-full bg-classmates-edge dark:bg-muted-foreground/30" />
            </div>

            <div className="flex items-center justify-between gap-3 border-b border-classmates-hairline px-5 pb-3 pt-1 dark:border-border/60">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-classmates-hint dark:text-muted-foreground">
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
                  className="rounded-full p-2 text-classmates-sub transition-colors hover:bg-classmates-warm active:bg-classmates-warm dark:text-muted-foreground dark:hover:bg-muted/50 dark:active:bg-muted/50"
                  aria-label={m.common.close}
                  onClick={() => void closeTutorial()}
                >
                  <X className="h-5 w-5" strokeWidth={2} aria-hidden />
                </button>
              </div>
            </div>

            <div
              className={cn("px-5 pt-4", !reducedMotion && "transition-opacity duration-150")}
              key={step}
              aria-live="polite"
            >
              <h2
                id="product-tutorial-title"
                className="text-[20px] font-semibold leading-tight tracking-tight text-classmates-ink dark:text-foreground"
              >
                {stepCopy?.title}
              </h2>
              <p className="mt-2.5 text-[16px] font-normal leading-relaxed text-classmates-ink/90 dark:text-foreground/90">
                {stepCopy?.body}
              </p>
              {step === 0 ? (
                <p className="mt-2.5 text-[13px] leading-snug text-classmates-sub dark:text-muted-foreground">
                  {m.tutorial.subtitle}
                </p>
              ) : isLast ? (
                <p className="mt-2.5 text-[13px] leading-snug text-classmates-sub dark:text-muted-foreground">
                  {m.tutorial.replayHint}
                </p>
              ) : (
                <p className="mt-2.5 text-[13px] leading-snug text-classmates-sub dark:text-muted-foreground">
                  {m.tutorial.coachSubtitle}
                </p>
              )}
            </div>

            <div className="mt-4 flex items-center gap-1.5 px-5" aria-hidden>
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

            <div className="mt-4 flex items-center gap-2 px-5 pb-5">
              {step > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 flex-1 rounded-full text-[15px] font-semibold"
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
                  className="h-11 flex-1 rounded-full text-[15px] font-semibold"
                  onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
                >
                  {m.tutorial.next}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="h-11 flex-1 rounded-full text-[15px] font-semibold"
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
