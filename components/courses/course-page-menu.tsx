"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { FormMessage } from "@/components/forms/form-message";

export function CoursePageMenu({
  courseId,
}: {
  courseId: string;
}) {
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent | TouchEvent) => {
      const el = menuRef.current;
      if (el && event.target instanceof Node && !el.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function removeCourse() {
    if (!window.confirm("Remove this course from your courses?")) {
      return;
    }

    setPending(true);
    setError("");
    const response = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
    const payload = await response.json().catch(() => ({}));
    setPending(false);

    if (!response.ok) {
      setError(typeof payload.error === "string" ? payload.error : "Could not remove this course.");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        aria-label="More actions"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
      >
        <MoreHorizontal className="h-5 w-5" strokeWidth={2} />
      </button>

      {open ? (
        <div className="absolute right-0 top-10 z-20 min-w-[190px] rounded-xl border border-border bg-popover p-1 shadow-lg">
          <button
            type="button"
            role="menuitem"
            disabled={pending}
            onClick={() => void removeCourse()}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-destructive transition hover:bg-muted active:bg-muted/70 disabled:pointer-events-none disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" strokeWidth={2} />
            {pending ? "Removing..." : "Remove from my courses"}
          </button>
        </div>
      ) : null}

      <FormMessage message={error} />
    </div>
  );
}
