"use client";

import Image from "next/image";
import { useId } from "react";

import { cn } from "@/lib/utils";

function isDataUrl(url: string) {
  return url.startsWith("data:");
}

/** Caps very tall photos in feed cards without forcing a fixed strip height. */
const CARD_IMAGE_CLASS = "block h-auto w-full max-h-72 object-contain";

function DetailHeroImage({ url, alt, sizes }: { url: string; alt: string; sizes: string }) {
  if (isDataUrl(url)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- inline fallback when blob token unset
      <img
        src={url}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover"
        loading="lazy"
        decoding="async"
      />
    );
  }
  return <Image src={url} alt={alt} fill sizes={sizes} className="object-cover" />;
}

function CardFeedImage({ url, alt, sizes }: { url: string; alt: string; sizes: string }) {
  if (isDataUrl(url)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- intrinsic height for masonry cards
      <img src={url} alt={alt} className={CARD_IMAGE_CLASS} loading="lazy" decoding="async" />
    );
  }
  return (
    <Image
      src={url}
      alt={alt}
      width={1200}
      height={900}
      sizes={sizes}
      className={CARD_IMAGE_CLASS}
    />
  );
}

function CardMediaStrip({
  urls,
  ariaLabel,
  className,
  id,
  topClassName = "mt-3",
}: {
  urls: string[];
  ariaLabel?: string;
  className?: string;
  id: string;
  /** Omit on detail when parent `space-y-*` already separates blocks. */
  topClassName?: string;
}) {
  const multi = urls.length > 1;
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(topClassName, "w-full min-w-0", className)}
    >
      <div
        className={cn(
          "flex w-full items-start gap-2 overflow-x-auto overflow-y-hidden rounded-xl pb-0.5 [scrollbar-width:thin]",
          multi && "snap-x snap-mandatory",
        )}
      >
        {urls.map((url, index) => (
          <div
            key={`${id}-card-${index}`}
            className={cn(
              "shrink-0 overflow-hidden rounded-xl bg-muted/40 ring-1 ring-border/45",
              multi
                ? "w-[min(100%,22rem)] min-w-[85%] snap-start sm:min-w-[70%]"
                : "min-w-0 w-full",
            )}
          >
            <CardFeedImage
              url={url}
              alt=""
              sizes={multi ? "(max-width:640px) 85vw, 28rem" : "(max-width:640px) 100vw, 36rem"}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Discover post images — list cards use a full-width media row; detail uses the same row
 * for multiple images, single-image hero on detail.
 */
export function ClassmatePostImagesGallery({
  urls,
  variant,
  ariaLabel,
  className,
  topClassName,
}: {
  urls: string[];
  variant: "card" | "detail";
  ariaLabel?: string;
  className?: string;
  /** Card variant only: outer margin above strip (default `mt-3`). */
  topClassName?: string;
}) {
  const id = useId();
  if (!urls.length) return null;

  if (variant === "card") {
    return (
      <CardMediaStrip
        urls={urls}
        ariaLabel={ariaLabel}
        className={className}
        id={id}
        topClassName={topClassName ?? "mt-3"}
      />
    );
  }

  const [first] = urls;
  if (urls.length === 1) {
    return (
      <div role="group" aria-label={ariaLabel} className={cn("w-full", className)}>
        <div className="relative w-full overflow-hidden rounded-2xl bg-muted/40 ring-1 ring-border/50">
          <CardFeedImage url={first} alt="" sizes="(max-width: 640px) 100vw, 36rem" />
        </div>
      </div>
    );
  }

  return (
    <CardMediaStrip
      urls={urls}
      ariaLabel={ariaLabel}
      className={className}
      id={id}
      topClassName=""
    />
  );
}
