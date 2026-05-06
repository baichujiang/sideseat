import { cn } from "@/lib/utils";

/** Consistent section chrome for the Me (`/profile`) screen. */
export function MePageSection({
  id,
  title,
  description,
  children,
  className,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={cn("scroll-mt-6 space-y-3", className)}>
      <header className="px-0.5">
        <h2 id={id} className="text-[15px] font-semibold leading-snug tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </header>
      {children}
    </section>
  );
}
