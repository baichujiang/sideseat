import { WifiOff } from "lucide-react";

import { cn } from "@/lib/utils";

export function OfflineStateCard({
  title,
  description,
  className,
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-[1.25rem] border border-dashed border-amber-200/90 bg-amber-50/55 px-5 py-7 text-center",
        "dark:border-amber-400/25 dark:bg-amber-950/20",
        className,
      )}
    >
      <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
        <WifiOff className="h-5 w-5" strokeWidth={2.25} aria-hidden />
      </span>
      <h2 className="mt-3 text-[15px] font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-[24rem] text-[13px] leading-relaxed text-muted-foreground">
        {description}
      </p>
    </div>
  );
}
