"use client";

import { ChevronDown, MapPin } from "lucide-react";

import { getDiscoverCityDisplayLabel } from "@/lib/discover/discover-city-display";
import { DEFAULT_DISCOVER_SERVED_CITY } from "@/lib/discover/discover-city-name-keys";
import { formatMessage, type AppMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

/** Compact city chip — top bar on Discover (area filter MVP). */
export function DiscoverAreaFilter({ ui }: { ui: AppMessages }) {
  const areaCityLabel = getDiscoverCityDisplayLabel(DEFAULT_DISCOVER_SERVED_CITY, ui.discover.cityNames);
  const areaFilterAria = formatMessage(ui.discover.areaFilterAria, { city: areaCityLabel });
  const areaComingSoon = formatMessage(ui.discover.areaComingSoon, { city: areaCityLabel });

  return (
    <details className="group/details relative shrink-0">
      <summary
        aria-label={areaFilterAria}
        className={cn(
          "inline-flex h-9 cursor-pointer list-none select-none items-center gap-1 rounded-full border border-[#E7E0D6] bg-white px-2 pr-1.5 text-[12px] font-medium text-foreground shadow-sm transition-colors",
          "hover:border-border hover:bg-muted/35 active:bg-muted/50",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={2.25} aria-hidden />
        <span className="max-w-[4.5rem] truncate">{areaCityLabel}</span>
        <ChevronDown
          className="h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-200 group-open/details:rotate-180"
          strokeWidth={2.25}
          aria-hidden
        />
      </summary>
      <div className="absolute right-0 z-30 mt-1.5 min-w-[13rem] rounded-xl border border-[#E7E0D6] bg-white py-1 shadow-lg dark:border-border dark:bg-card">
        <div className="px-3 py-2 text-[13px] font-medium text-foreground" role="status">
          <span className="text-muted-foreground">{ui.discover.areaStatusPrefix} </span>
          {areaCityLabel}
        </div>
        <p className="border-t border-border px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          {areaComingSoon}
        </p>
      </div>
    </details>
  );
}
