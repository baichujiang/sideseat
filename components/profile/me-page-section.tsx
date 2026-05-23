import { cn } from "@/lib/utils";

/** iOS Settings–style grouped block label for the Me (`/profile`) landing screen. */
export function MePageGroupedSection({
  id,
  title,
  footer,
  children,
  className,
}: {
  id: string;
  title: string;
  footer?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("space-y-1.5", className)}>
      <h2
        id={id}
        className="px-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
      >
        {title}
      </h2>
      {children}
      {footer?.trim() ? (
        <p className="px-1 text-[11px] leading-snug text-muted-foreground">{footer}</p>
      ) : null}
    </section>
  );
}

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
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /** `compact` — smaller headings/spacing for secondary blocks. */
  density?: "default" | "compact";
}) {
  const compact = density === "compact";
  const hasTitle = Boolean(title?.trim());
  const hasDescription = Boolean(description?.trim());
  const showHeader = hasTitle || hasDescription;

  return (
    <section
      id={hasTitle ? undefined : id}
      aria-labelledby={hasTitle ? id : undefined}
      className={cn("scroll-mt-6", compact ? "space-y-2" : "space-y-3", className)}
    >
      {showHeader ? (
        <header className="px-0.5">
          {hasTitle ? (
            <h2
              id={id}
              className={cn(
                "font-semibold leading-snug tracking-tight text-foreground",
                compact ? "text-[13px]" : "text-[15px]",
              )}
            >
              {title}
            </h2>
          ) : null}
          {hasDescription ? (
            <p
              className={cn(
                "max-w-md text-muted-foreground",
                hasTitle
                  ? compact
                    ? "mt-0.5 text-[11px] leading-snug"
                    : "mt-1 text-[13px] leading-relaxed"
                  : compact
                    ? "text-[11px] leading-snug"
                    : "text-[13px] leading-relaxed",
              )}
            >
              {description}
            </p>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}
