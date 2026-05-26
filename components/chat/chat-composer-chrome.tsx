"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Send } from "lucide-react";

import { cn } from "@/lib/utils";

/** Unified pill bar wrapping the message field and inline actions. */
export const chatComposerBarClassName = cn(
  "flex min-w-0 flex-1 items-end gap-0.5 rounded-[1.375rem]",
  "border border-border/75 bg-background/95",
  "shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_rgba(15,23,42,0.03)]",
  "transition-[border-color,box-shadow] duration-200",
  "focus-within:border-primary/30",
  "focus-within:shadow-[0_1px_2px_rgba(37,99,235,0.06),0_4px_20px_rgba(37,99,235,0.1)]",
  "focus-within:ring-2 focus-within:ring-primary/12",
  "dark:bg-card/90 dark:shadow-[0_1px_2px_rgba(0,0,0,0.2),0_4px_16px_rgba(0,0,0,0.12)]",
);

export const chatComposerInputClassName = cn(
  "h-10 min-w-0 flex-1 border-0 bg-transparent px-2.5 py-2",
  "text-[16px] leading-snug text-foreground",
  "placeholder:text-muted-foreground/65",
  "outline-none ring-0 focus-visible:outline-none focus-visible:ring-0",
);

export const chatComposerIconBtnClassName = cn(
  "mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
  "text-muted-foreground transition-all duration-200",
  "hover:bg-muted/70 hover:text-foreground",
  "active:scale-95",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
);

export const chatComposerIconBtnActiveClassName = "bg-muted text-foreground";

export const chatComposerIconBtnDisabledClassName = cn(
  "border border-dashed border-border/70 bg-muted/25 text-muted-foreground/55",
  "cursor-not-allowed hover:bg-muted/25 hover:text-muted-foreground/55 active:scale-100",
);

export function ChatComposerBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(chatComposerBarClassName, "px-1.5 py-1", className)}>{children}</div>;
}

export function ChatComposerSendButton({
  disabled,
  onClick,
  ariaLabel,
  className,
}: {
  disabled: boolean;
  onClick: () => void;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={(event) => {
        if (!disabled) event.preventDefault();
      }}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled
          ? "pointer-events-none bg-muted/70 text-muted-foreground/45"
          : cn(
              "bg-primary text-primary-foreground",
              "shadow-[0_2px_8px_rgba(37,99,235,0.28)] dark:shadow-[0_2px_10px_rgba(37,99,235,0.22)]",
              "hover:bg-primary/92 active:scale-95",
            ),
        className,
      )}
    >
      <Send className="h-[1.05rem] w-[1.05rem]" strokeWidth={2.35} />
    </button>
  );
}

export function ChatComposerSlotButton({
  children,
  active,
  disabled,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        chatComposerIconBtnClassName,
        active && chatComposerIconBtnActiveClassName,
        disabled && chatComposerIconBtnDisabledClassName,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
