"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { FormMessage } from "@/components/forms/form-message";

export function CourseRemoveButton({
  courseId,
  compact = false,
  label = "Remove from my courses",
}: {
  courseId: string;
  compact?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={pending}
        className={
          compact
            ? "inline-flex h-8 items-center rounded-full px-3 text-[12px] font-semibold text-destructive/85 transition hover:bg-destructive/8 hover:text-destructive disabled:pointer-events-none disabled:opacity-50"
            : "inline-flex h-10 w-full items-center justify-center rounded-xl border border-destructive/20 bg-destructive/5 px-4 text-sm font-semibold text-destructive transition hover:bg-destructive/10 disabled:pointer-events-none disabled:opacity-50"
        }
        onClick={async () => {
          if (!window.confirm("Remove this course from your schedule?")) {
            return;
          }
          setError("");
          setPending(true);
          const response = await apiFetch(`/api/courses/${courseId}`, { method: "DELETE" });
          const payload = await response.json().catch(() => ({}));
          setPending(false);

          if (!response.ok) {
            setError(
              typeof payload.error === "string" ? payload.error : "Could not remove this course.",
            );
            return;
          }

          router.refresh();
        }}
      >
        {pending ? "Removing..." : label}
      </button>
      <FormMessage message={error} />
    </div>
  );
}
