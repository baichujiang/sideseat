"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ClassmatePostCategory } from "@prisma/client";

import { displayableClassmatePostImageUrls } from "@/lib/discover/classmate-post-display-images";
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

export function BuddyRequestMediaCarousel({
  urls,
  ariaLabel,
}: {
  urls: string[];
  category: ClassmatePostCategory;
  title: string;
  ariaLabel: string;
}) {
  const displayUrls = displayableClassmatePostImageUrls(urls);
  const id = useId();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const multi = displayUrls.length > 1;

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el || displayUrls.length <= 1) return;
    const slideW = el.firstElementChild?.clientWidth ?? 1;
    const gap = 8;
    const i = Math.round(el.scrollLeft / (slideW + gap));
    setIndex(Math.min(displayUrls.length - 1, Math.max(0, i)));
  }, [displayUrls.length]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [onScroll]);

  if (!displayUrls.length) {
    return null;
  }

  return (
    <div data-testid="buddy-request-media" className="relative w-full">
      <div
        ref={scrollerRef}
        role="region"
        aria-roledescription="carousel"
        aria-label={ariaLabel}
        className={cn(
          "flex max-h-40 gap-2 overflow-x-auto overflow-y-hidden rounded-2xl pb-1 [scrollbar-width:thin]",
          multi && "snap-x snap-mandatory",
        )}
      >
        {displayUrls.map((url, i) => (
          <div
            key={`${id}-${i}`}
            className={cn(
              "relative shrink-0 overflow-hidden rounded-2xl bg-muted/80 ring-1 ring-border/45",
              "h-36 max-h-40",
              multi ? "w-[min(100%,20rem)] min-w-[88%] snap-start sm:min-w-[75%]" : "w-full min-w-0",
            )}
          >
            <SlideImage url={url} sizes={multi ? "(max-width:640px) 88vw, 24rem" : "(max-width:640px) 100vw, 36rem"} />
          </div>
        ))}
      </div>
      {multi ? (
        <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[11px] font-medium text-white tabular-nums">
          {index + 1}/{displayUrls.length}
        </div>
      ) : null}
    </div>
  );
}
