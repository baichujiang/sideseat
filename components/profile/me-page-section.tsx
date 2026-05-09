import { cn } from "@/lib/utils";

/** Consistent section chrome for the Me (`/profile`) screen. */
export function MePageSection({
  id,
  title,
  description,
  children,
  className,
  density = "default",
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /** `compact` — smaller headings/spacing for secondary blocks. */
  density?: "default" | "compact";
}) {
  const compact = density === "compact";
  return (
    <section aria-labelledby={id} className={cn("scroll-mt-6", compact ? "space-y-2" : "space-y-3", className)}>
      <header className="px-0.5">
        <h2
          id={id}
          className={cn(
            "font-semibold leading-snug tracking-tight text-foreground",
            compact ? "text-[13px]" : "text-[15px]",
          )}
        >
          {title}
        </h2>
        {description ? (
          <p
            className={cn(
              "max-w-md text-muted-foreground",
              compact ? "mt-0.5 text-[11px] leading-snug" : "mt-1 text-[13px] leading-relaxed",
            )}
          >
            {description}
          </p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
