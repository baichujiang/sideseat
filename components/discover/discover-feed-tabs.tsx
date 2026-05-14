"use client";

import { cn } from "@/lib/utils";
import type { DiscoverFeedKind } from "@/lib/discover/discover-feed-kind";
import type { AppMessages } from "@/lib/i18n/messages";

export function DiscoverFeedTabs({
  active,
  onChange,
  labels,
}: {
  active: DiscoverFeedKind;
  onChange: (kind: DiscoverFeedKind) => void;
  labels: AppMessages["discoverBuddy"];
}) {
  const tabs: { kind: DiscoverFeedKind; label: string }[] = [
    { kind: "for-you", label: labels.feedTabForYou },
    { kind: "today", label: labels.feedTabToday },
    { kind: "nearby", label: labels.feedTabNearby },
    { kind: "latest", label: labels.feedTabLatest },
  ];

  return (
    <div
      role="tablist"
      aria-label="Discover feed"
      className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map(({ kind, label }) => {
        const isActive = active === kind;
        return (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(kind)}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              isActive
                ? "bg-classmates-blue text-white shadow-sm"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
