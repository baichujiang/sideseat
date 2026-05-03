/** Compact unread counter for inbox rows (replaces a plain red dot). */
export function InboxUnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold leading-none text-white shadow-[0_0_0_2px_hsl(var(--card))]"
      aria-label={`${count} unread message${count === 1 ? "" : "s"}`}
    >
      {label}
    </span>
  );
}
