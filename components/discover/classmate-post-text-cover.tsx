import { BookUser, Dumbbell, Languages, NotebookPen, UtensilsCrossed } from "lucide-react";
import { ClassmatePostCategory } from "@prisma/client";

import { cn } from "@/lib/utils";

const GRADIENT_CLASS =
  "bg-gradient-to-br from-violet-100/90 via-sky-50/80 to-amber-50/70 dark:from-violet-950/50 dark:via-slate-900/40 dark:to-amber-950/30";

function categoryIcon(category: ClassmatePostCategory, size: "card" | "detail") {
  const cls = size === "detail" ? "h-8 w-8 text-foreground/80" : "hidden";
  switch (category) {
    case ClassmatePostCategory.SHARED_COURSES:
      return <BookUser className={cls} strokeWidth={1.75} aria-hidden />;
    case ClassmatePostCategory.STUDY:
      return <NotebookPen className={cls} strokeWidth={1.75} aria-hidden />;
    case ClassmatePostCategory.MEALS:
      return <UtensilsCrossed className={cls} strokeWidth={1.75} aria-hidden />;
    case ClassmatePostCategory.LANGUAGE:
      return <Languages className={cls} strokeWidth={1.75} aria-hidden />;
    case ClassmatePostCategory.SPORTS:
      return <Dumbbell className={cls} strokeWidth={1.75} aria-hidden />;
    default:
      return <NotebookPen className={cls} strokeWidth={1.75} aria-hidden />;
  }
}

export function ClassmatePostTextCover({
  category,
  typeLabel,
  title,
  variant,
  className,
}: {
  category: ClassmatePostCategory;
  typeLabel: string;
  title: string;
  variant: "card" | "detail";
  className?: string;
}) {
  if (variant === "card") {
    return (
      <div
        className={cn(
          "absolute inset-0 flex flex-col justify-end p-3",
          GRADIENT_CLASS,
          className,
        )}
      >
        <span className="inline-flex max-w-full self-start rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-foreground shadow-sm dark:bg-white/10 dark:text-foreground">
          {typeLabel}
        </span>
        <p className="mt-2 line-clamp-2 text-[14px] font-semibold leading-snug text-foreground drop-shadow-sm">
          {title}
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="buddy-request-media"
      className={cn(
        "relative w-full max-h-52 overflow-hidden rounded-2xl ring-1 ring-border/50",
        className,
      )}
    >
      <div className={cn("flex min-h-[11rem] flex-col justify-end gap-2 p-4", GRADIENT_CLASS)}>
        <div className="text-foreground/90">{categoryIcon(category, "detail")}</div>
        <span className="inline-flex max-w-full self-start rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-foreground shadow-sm dark:bg-white/10 dark:text-foreground">
          {typeLabel}
        </span>
        <p className="line-clamp-3 text-[16px] font-semibold leading-snug text-foreground drop-shadow-sm">
          {title}
        </p>
      </div>
    </div>
  );
}
