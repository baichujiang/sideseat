"use client";

import { useRef, useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";

import { useAppMessages } from "@/hooks/use-app-locale";
import { getDiscoverCityDisplayLabel } from "@/lib/discover/discover-city-display";
import type { DiscoverCityNameKey } from "@/lib/discover/discover-city-name-keys";
import { DISCOVER_SERVED_CITIES } from "@/lib/discover/discover-served-cities";
import { apiFetch } from "@/lib/auth/api-fetch";
import { formatMessage } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

export function MeDiscoverCitySelect({
  value,
  variant = "control",
  className,
}: {
  value: DiscoverCityNameKey;
  /** `pill` — compact chip in profile card; `control` — bordered selector (legacy row). */
  variant?: "pill" | "control";
  className?: string;
}) {
  const router = useRouter();
  const m = useAppMessages();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [pending, setPending] = useState(false);
  const cityNames = m.discover.cityNames;
  const label = getDiscoverCityDisplayLabel(value, cityNames);

  async function selectCity(city: DiscoverCityNameKey) {
    if (city === value || pending) return;
    detailsRef.current?.removeAttribute("open");
    setPending(true);
    try {
      const res = await apiFetch("/api/profile/discover-city", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city }),
      });
      if (!res.ok) return;
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const isPill = variant === "pill";
  const showChevron = DISCOVER_SERVED_CITIES.length > 1;

  return (
    <details ref={detailsRef} className={cn("relative block max-w-full shrink-0", className)}>
      <summary
        aria-label={formatMessage(m.profile.discoverCitySelectAria, { city: label })}
        className={cn(
          "inline-flex max-w-full cursor-pointer list-none select-none items-center rounded-full transition",
          "[&::-webkit-details-marker]:hidden",
          pending && "pointer-events-none opacity-70",
          isPill ?
            "h-8 gap-1.5 bg-[#F3F4F6] px-2.5 text-[13px] font-medium text-[#4B5563] hover:bg-[#ECEEF1] active:bg-[#E5E7EB] dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted/80"
          : "h-9 gap-1.5 border border-[#E7E0D6] bg-white px-3 text-[13px] font-semibold text-foreground shadow-sm hover:border-border hover:bg-muted/35 active:bg-muted/50 dark:border-border dark:bg-card",
        )}
      >
        <MapPin
          className={cn("shrink-0 text-[#6B7280] dark:text-muted-foreground", isPill ? "h-3.5 w-3.5" : "h-3.5 w-3.5")}
          strokeWidth={2.25}
          aria-hidden
        />
        <span className="truncate">{label}</span>
        {showChevron ? (
          <ChevronDown
            className={cn(
              "shrink-0 text-[#6B7280] dark:text-muted-foreground",
              isPill ? "h-3.5 w-3.5" : "h-3.5 w-3.5",
            )}
            strokeWidth={2.25}
            aria-hidden
          />
        ) : null}
      </summary>
      <div
        className={cn(
          "absolute z-30 mt-1.5 min-w-[12rem] overflow-hidden rounded-xl border border-[#E7E0D6] bg-white py-1 shadow-lg dark:border-border dark:bg-card",
          isPill ? "left-0" : "right-0",
        )}
      >
        {DISCOVER_SERVED_CITIES.map((city) => {
          const optionLabel = getDiscoverCityDisplayLabel(city, cityNames);
          const selected = city === value;
          return (
            <button
              key={city}
              type="button"
              onClick={(e) => {
                e.preventDefault();
                void selectCity(city);
              }}
              className={cn(
                "flex w-full px-3 py-2 text-left text-[13px] transition",
                selected
                  ? "bg-classmates-blue-soft font-semibold text-classmates-blue"
                  : "text-foreground hover:bg-muted/45",
              )}
            >
              {optionLabel}
            </button>
          );
        })}
      </div>
    </details>
  );
}
