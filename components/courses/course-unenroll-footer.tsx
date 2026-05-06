"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { cn } from "@/lib/utils";

/**
 * Low-frequency exit: text link at the bottom of the course page + two-step
 * unenroll dialog (never a single click / `window.confirm`).
 */
export function CourseUnenrollFooter({
  courseId,
  courseName,
}: {
  courseId: string;
  courseName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function openUnenrollDialog() {
    setError("");
    setConfirmOpen(true);
  }

  async function performUnenroll() {
    setError("");
    setPending(true);
    const response = await apiFetch(`/api/courses/${courseId}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    setPending(false);

    if (!response.ok) {
      setError(typeof payload.error === "string" ? payload.error : "Could not unenroll.");
      return;
    }

    setConfirmOpen(false);
    router.refresh();
  }

  return (
    <>
      <footer className="border-t border-classmates-hairline pt-6 dark:border-border/60">
        <div className="flex justify-center px-1">
          <button
            type="button"
            onClick={openUnenrollDialog}
            className={cn(
              "text-center text-[12px] font-medium text-muted-foreground underline-offset-4 transition",
              "hover:text-foreground hover:underline",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
          >
            Unenroll from this course
          </button>
        </div>
      </footer>

      <AppPushLayer
        open={confirmOpen}
        onClose={() => {
          if (pending) return;
          setConfirmOpen(false);
          setError("");
        }}
        zClassName="z-[100]"
        backdropClassName="bg-black/45 dark:bg-black/60 !backdrop-blur-none"
        panelClassName="w-[min(100vw,28rem)] border-0 bg-transparent shadow-none dark:shadow-none"
        ariaLabelledBy="course-unenroll-title"
      >
        <div className="flex h-full min-h-0 flex-col justify-center p-4 sm:p-6">
          <div className="rounded-[24px] border border-[#E7E0D6] bg-white p-5 shadow-[0_16px_48px_rgba(15,23,42,0.14)] dark:border-border dark:bg-card dark:shadow-[0_16px_48px_rgba(0,0,0,0.45)]">
            <h2
              id="course-unenroll-title"
              className="text-base font-semibold leading-snug tracking-tight text-classmates-ink dark:text-foreground"
            >
              Unenroll from {courseName}?
            </h2>
            <p className="mt-3 text-[13px] leading-relaxed text-classmates-sub dark:text-zinc-400">
              You&apos;ll leave this course and it will be removed from your enrolled courses. Your existing chats
              won&apos;t be deleted.
            </p>
            {error ? (
              <div className="mt-3">
                <FormMessage message={error} />
              </div>
            ) : null}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setConfirmOpen(false);
                  setError("");
                }}
                className="inline-flex h-11 w-full items-center justify-center rounded-full border border-[#E7E0D6] bg-classmates-surface px-4 text-sm font-semibold text-classmates-ink transition hover:bg-classmates-warm-alt active:bg-classmates-warm-alt/80 disabled:opacity-50 dark:border-border dark:bg-muted/30 dark:text-foreground dark:hover:bg-muted/50 sm:w-auto sm:min-w-[7.5rem]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => void performUnenroll()}
                className="inline-flex h-11 w-full items-center justify-center rounded-full border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 shadow-sm transition hover:bg-red-100 active:bg-red-100/90 disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200 dark:hover:bg-red-950/60 sm:w-auto sm:min-w-[7.5rem]"
              >
                {pending ? "Unenrolling…" : "Unenroll"}
              </button>
            </div>
          </div>
        </div>
      </AppPushLayer>
    </>
  );
}
