"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { BookUser, Dumbbell, Languages, NotebookPen, UtensilsCrossed } from "lucide-react";
import { ClassmatePostCategory } from "@prisma/client";

import { cn } from "@/lib/utils";

function isDataUrl(url: string) {
  return url.startsWith("data:");
}

function SlideImage({ url, sizes }: { url: string; sizes: string }) {
  if (isDataUrl(url)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
    );
  }
  return <Image src={url} alt="" fill sizes={sizes} className="object-cover" />;
}

function categoryIcon(category: ClassmatePostCategory) {
  const cls = "h-8 w-8 text-foreground/80";
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

export function BuddyRequestMediaCarousel({
  urls,
  category,
  title,
  ariaLabel,
}: {
  urls: string[];
  category: ClassmatePostCategory;
  title: string;
  ariaLabel: string;
}) {
  const id = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const multi = urls.length > 1;

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || urls.length <= 1) return;
    const slideW = el.firstElementChild?.clientWidth ?? 1;
    const gap = 8;
    const i = Math.round(el.scrollLeft / (slideW + gap));
    setIndex(Math.min(urls.length - 1, Math.max(0, i)));
  }, [urls.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  if (!urls.length) {
    return (
      <div
        data-testid="buddy-request-media"
        className="relative w-full max-h-52 overflow-hidden rounded-2xl bg-muted/40 ring-1 ring-border/50"
      >
        <div
          className={cn(
            "flex min-h-[11rem] flex-col justify-end gap-2 bg-gradient-to-br p-4",
            "from-violet-100/90 via-sky-50/80 to-amber-50/70 dark:from-violet-950/50 dark:via-slate-900/40 dark:to-amber-950/30",
          )}
        >
          <div className="text-foreground/90">{categoryIcon(category)}</div>
          <p className="line-clamp-3 text-[16px] font-semibold leading-snug text-foreground drop-shadow-sm">
            {title}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="buddy-request-media" className="relative w-full">
      <div
        ref={scrollerRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={ariaLabel}
        className={cn(
          "flex max-h-52 gap-2 overflow-x-auto overflow-y-hidden rounded-2xl pb-1 [scrollbar-width:thin]",
          multi && "snap-x snap-mandatory",
        )}
      >
        {urls.map((url, i) => (
          <div
            key={`${id}-${i}`}
            className={cn(
              "relative shrink-0 overflow-hidden rounded-2xl bg-muted/80 ring-1 ring-border/45",
              "h-48 max-h-52",
              multi ? "w-[min(100%,20rem)] min-w-[88%] snap-start sm:min-w-[75%]" : "w-full min-w-0",
            )}
          >
            <SlideImage url={url} sizes={multi ? "(max-width:640px) 88vw, 24rem" : "(max-width:640px) 100vw, 36rem"} />
          </div>
        ))}
      </div>
      {multi ? (
        <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white tabular-nums">
          {index + 1}/{urls.length}
        </div>
      ) : null}
    </div>
  );
}
