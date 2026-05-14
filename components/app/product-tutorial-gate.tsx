"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { useRegisterDismissOnEdgeSwipe } from "@/components/ui/app-push-layer";
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

  useRegisterDismissOnEdgeSwipe(open, () => {
    void closeTutorial();
  });

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
  const textShadowTitle = "0 2px 14px rgba(0,0,0,0.55), 0 1px 4px rgba(0,0,0,0.45)";
  const textShadowBody = "0 1px 10px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.4)";

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
          "absolute inset-0 bg-black/25 transition-opacity ease-out dark:bg-black/35",
          entered ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDuration: dur }}
        onClick={() => {
          if (backdropClickableRef.current) void closeTutorial();
        }}
      />

      {/* Bottom read legibility: soft wash only (not a card). */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[min(48vh,320px)] bg-gradient-to-t from-black/58 via-black/28 to-transparent dark:from-black/65 dark:via-black/32"
        aria-hidden
      />

      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 flex justify-center",
          "pb-[calc(5.25rem+env(safe-area-inset-bottom))]",
        )}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-tutorial-title"
          className={cn(
            "pointer-events-auto w-full max-w-md px-4",
            "transition-opacity ease-out",
            entered ? "opacity-100" : "opacity-0",
          )}
          style={{ transitionDuration: dur }}
        >
          <div className="mb-3 flex items-center justify-end gap-1">
            <button
              type="button"
              className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-white/85 transition-colors [text-shadow:0_1px_6px_rgba(0,0,0,0.5)] hover:bg-white/10 hover:text-white"
              onClick={() => void closeTutorial()}
            >
              {m.tutorial.skip}
            </button>
            <button
              type="button"
              className="rounded-full p-2 text-white/90 transition-colors [text-shadow:0_1px_6px_rgba(0,0,0,0.5)] hover:bg-white/10 hover:text-white"
              aria-label={m.common.close}
              onClick={() => void closeTutorial()}
            >
              <X className="h-5 w-5" strokeWidth={2} aria-hidden />
            </button>
          </div>

          <div
            className={cn(!reducedMotion && "transition-opacity duration-150")}
            key={step}
            aria-live="polite"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70 [text-shadow:0_1px_6px_rgba(0,0,0,0.45)]">
              {formatMessage(m.tutorial.stepLabel, { current: step + 1, total })}
            </p>
            <h2
              id="product-tutorial-title"
              className="mt-1 text-[1.4rem] font-semibold leading-snug tracking-tight text-white"
              style={{ textShadow: textShadowTitle }}
            >
              {stepCopy?.title}
            </h2>
            <p
              className="mt-2 max-w-prose text-[15px] font-normal leading-relaxed text-white/95"
              style={{ textShadow: textShadowBody }}
            >
              {stepCopy?.body}
            </p>
            {step === 0 ? (
              <p
                className="mt-2 max-w-prose text-[12px] leading-snug text-white/80"
                style={{ textShadow: textShadowBody }}
              >
                {m.tutorial.subtitle}
              </p>
            ) : isLast ? (
              <p
                className="mt-2 max-w-prose text-[12px] leading-snug text-white/75"
                style={{ textShadow: textShadowBody }}
              >
                {m.tutorial.replayHint}
              </p>
            ) : (
              <p
                className="mt-2 max-w-prose text-[12px] leading-snug text-white/75"
                style={{ textShadow: textShadowBody }}
              >
                {m.tutorial.coachSubtitle}
              </p>
            )}
          </div>

          <div className="mt-4 flex items-center gap-1.5" aria-hidden>
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-200",
                  i === step ? "w-5 bg-white" : "w-1.5 bg-white/35",
                )}
              />
            ))}
          </div>

          <div className="mt-5 flex items-center gap-2 pb-1">
            {step > 0 ? (
              <button
                type="button"
                className="flex-1 rounded-full py-2.5 text-center text-[13px] font-semibold text-white/90 transition-colors [text-shadow:0_1px_8px_rgba(0,0,0,0.45)] hover:bg-white/5 hover:text-white"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
              >
                {m.tutorial.back}
              </button>
            ) : (
              <span className="flex-1" />
            )}
            {!isLast ? (
              <Button
                type="button"
                className="flex-1 rounded-full bg-white text-[13px] font-semibold text-neutral-900 shadow-[0_2px_14px_rgba(0,0,0,0.28)] hover:bg-white/95"
                onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
              >
                {m.tutorial.next}
              </Button>
            ) : (
              <Button
                type="button"
                className="flex-1 rounded-full bg-white text-[13px] font-semibold text-neutral-900 shadow-[0_2px_14px_rgba(0,0,0,0.28)] hover:bg-white/95"
                onClick={() => void closeTutorial()}
              >
                {m.tutorial.getStarted}
              </Button>
            )}
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
