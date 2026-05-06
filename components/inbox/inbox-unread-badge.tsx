import { cn } from "@/lib/utils";

type InboxUnreadBadgeProps = {
  count: number;
  /**
   * `dot` — red unread dot on chat rows.
   * `count` — red numbered pill on chat list cards.
   * `countBrand` — brand blue pill (e.g. bottom nav tab, not error-like).
   */
  variant?: "dot" | "count" | "countBrand";
  className?: string;
};

export function InboxUnreadBadge({ count, variant = "count", className }: InboxUnreadBadgeProps) {
  if (count <= 0) return null;

  if (variant === "dot") {
    return (
      <span
        className={cn(
          "inline-block h-2 w-2 shrink-0 rounded-full bg-[#F43F5E] shadow-[0_0_0_1px_#F0ECE6]",
          "dark:shadow-[0_0_0_1px_rgb(15,23,42,0.85)]",
          className,
        )}
        aria-label={`${count} unread message${count === 1 ? "" : "s"}`}
      />
    );
  }

  const label = count > 99 ? "99+" : String(count);
  if (variant === "countBrand") {
    return (
      <span
        className={cn(
          "flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-classmates-blue px-0.5 text-[10px] font-bold leading-none text-white shadow-[0_0_0_1px_#F0ECE6]",
          "dark:shadow-[0_0_0_1px_rgb(15,23,42,0.85)]",
          className,
        )}
        aria-label={`${count} unread message${count === 1 ? "" : "s"}`}
      >
        {label}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "flex min-h-[1.25rem] min-w-[1.25rem] shrink-0 items-center justify-center rounded-full bg-[#F43F5E] px-1.5 text-xs font-semibold leading-none text-white shadow-[0_0_0_1.5px_#F0ECE6]",
        "dark:shadow-[0_0_0_1.5px_rgb(15,23,42,0.85)]",
        className,
      )}
      aria-label={`${count} unread message${count === 1 ? "" : "s"}`}
    >
      {label}
    </span>
  );
}
