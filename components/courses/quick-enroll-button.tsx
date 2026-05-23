"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useSignInPrompt } from "@/components/auth/sign-in-prompt-dialog";
import { useAppMessages } from "@/hooks/use-app-locale";
import { useSessionHint } from "@/hooks/use-session-hint";
import { cn } from "@/lib/utils";

/**
 * One-tap "Enroll" that POSTs to /api/courses/[courseId]/enroll and refreshes
 * the surrounding route so the course moves from "Saved" / "Search result"
 * into the viewer's "Enrolled" list without a full-page form.
 *
 * States:
 *   - idle     : "Enroll"            (clickable, primary)
 *   - pending  : spinner             (disabled)
 *   - done     : ✓ Enrolled ~400ms   (before the router.refresh swaps UI)
 *   - error    : revert to idle, surface `onError`
 *
 * Why visually show a short "Enrolled" success state:
 *   the server action + router.refresh round-trip can take a beat, and
 *   without feedback users mash the button. A brief tick-mark removes the
 *   uncertainty without a disruptive toast.
 */
export function QuickEnrollButton({
  courseId,
  className,
  variant = "pill",
  onError,
}: {
  courseId: string;
  className?: string;
  /**
   * `pill`  — compact inline button (in list rows, search hits)
   * `block` — full-width primary CTA (course detail saved-only page)
   */
  variant?: "pill" | "block";
  onError?: (message: string) => void;
}) {
  const router = useRouter();
  const { courses: co } = useAppMessages();
  const sessionHint = useSessionHint();
  const { openPrompt } = useSignInPrompt();
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");

  async function enroll(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (state !== "idle") return;
    if (!sessionHint || sessionHint.isGuest || !sessionHint.signedIn) {
      openPrompt({
        returnTo:
          typeof window !== "undefined"
            ? `${window.location.pathname}${window.location.search}`
            : "/courses",
      });
      return;
    }
    setState("pending");
    try {
      const res = await apiFetch(
        `/api/courses/${encodeURIComponent(courseId)}/enroll`,
        { method: "POST" },
      );
      if (!res.ok) {
        setState("idle");
        onError?.(co.errorCouldNotEnroll);
        return;
      }
      setState("done");
      // Hold the tick for a short beat so the user sees the state change
      // even on fast networks, then refresh the surrounding route so the
      // server re-computes Enrolled/Saved/Search buckets.
      window.setTimeout(() => {
        router.refresh();
      }, 350);
    } catch {
      setState("idle");
      onError?.(co.errorNetworkEnroll);
    }
  }

  const pill =
    "inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-[11.5px] font-semibold shadow-sm transition";
  const block =
    "flex w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition";

  return (
    <button
      type="button"
      onClick={enroll}
      disabled={state !== "idle"}
      aria-label={co.enrollAria}
      className={cn(
        variant === "block" ? block : pill,
        state === "done"
          ? "bg-primary/15 text-primary"
          : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-80",
        className,
      )}
    >
      {state === "pending" ? (
        <Loader2
          className={cn(
            "animate-spin",
            variant === "block" ? "h-4 w-4" : "h-3 w-3",
          )}
          strokeWidth={2.25}
        />
      ) : state === "done" ? (
        <Check
          className={variant === "block" ? "h-4 w-4" : "h-3.5 w-3.5"}
          strokeWidth={2.5}
        />
      ) : null}
      {state === "done" ? co.enrolledCta : co.enrollCta}
    </button>
  );
}
