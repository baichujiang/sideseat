"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function ChatMessageImage({
  imageUrl,
  className,
}: {
  imageUrl: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "relative block w-full cursor-zoom-in border-0 bg-transparent p-0 text-left",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
        aria-label="View image full size"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded / blob URL */}
        <img src={imageUrl} alt="" className={cn(className, "pointer-events-none")} />
      </button>
      <dialog
        ref={dialogRef}
        className={cn(
          "fixed inset-0 z-[200] m-0 flex h-dvh max-h-dvh w-full max-w-none items-center justify-center",
          "border-0 bg-black/88 p-3 shadow-none outline-none ring-0",
        )}
        onClick={() => setOpen(false)}
        onClose={() => setOpen(false)}
      >
        <div
          className="relative flex max-h-full max-w-full items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            autoFocus
            onClick={() => setOpen(false)}
            className={cn(
              "absolute right-1 top-1 z-10 flex h-10 w-10 items-center justify-center rounded-full",
              "bg-background/15 text-white backdrop-blur-sm transition hover:bg-background/25",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80",
            )}
            aria-label="Close"
          >
            <X className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element -- full-size same URL as message */}
          <img
            src={imageUrl}
            alt=""
            className="max-h-[min(92dvh,100%)] max-w-full object-contain"
            draggable={false}
          />
        </div>
      </dialog>
    </>
  );
}
