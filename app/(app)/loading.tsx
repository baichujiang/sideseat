import { cn } from "@/lib/utils";

function Block({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-classmates-edge/70 dark:bg-muted/40",
        className,
      )}
      aria-hidden
    />
  );
}

/**
 * Instant feedback while `(app)` route segments load their RSC payload.
 * Opaque shell background + static blocks — no pulse, so brand-colored page
 * headers do not bleed through during tab switches.
 */
export default function AppLoading() {
  return (
    <div
      className="flex min-h-[min(70vh,32rem)] flex-col gap-3 bg-background"
      aria-busy
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <Block className="h-9 w-36" />
        <Block className="h-9 w-9 rounded-full" />
      </div>
      <Block className="h-11 w-full max-w-sm" />
      <Block className="min-h-[18rem] flex-1 w-full" />
      <div className="grid grid-cols-2 gap-2">
        <Block className="h-20" />
        <Block className="h-20" />
      </div>
    </div>
  );
}
