"use client";

import type { DiscoverZone } from "@/lib/discover/discover-zone";
import type { AppMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

export function DiscoverZoneTabs({
  active,
  onChange,
  labels,
}: {
  active: DiscoverZone;
  onChange: (zone: DiscoverZone) => void;
  labels: AppMessages["discoverZone"];
}) {
  const tabs: { zone: DiscoverZone; label: string }[] = [
    { zone: "buddies", label: labels.tabBuddies },
    { zone: "activities", label: labels.tabActivities },
  ];

  const tabClass = (zone: DiscoverZone) =>
    cn(
      "inline-flex h-8 min-w-0 flex-1 items-center justify-center rounded-[0.45rem] px-2 text-[12px] font-semibold leading-tight transition-[background-color,color,box-shadow] duration-200 ease-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-classmates-azure/50 focus-visible:ring-offset-1 focus-visible:ring-offset-transparent",
      active === zone
        ? "bg-white text-classmates-ink shadow-[0_1px_3px_rgba(15,23,42,0.08),0_0_0_0.5px_rgba(15,23,42,0.04)] dark:bg-card dark:text-foreground dark:shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
        : "text-classmates-sub hover:text-classmates-ink dark:text-muted-foreground dark:hover:text-foreground",
    );

  return (
    <nav aria-label={labels.tabsNavAria} role="tablist" className="grid grid-cols-2 items-stretch gap-0.5 rounded-[0.625rem] bg-classmates-rail/55 p-1 dark:bg-muted/55">
      {tabs.map(({ zone, label }) => (
        <button
          key={zone}
          type="button"
          role="tab"
          aria-selected={active === zone}
          onClick={() => onChange(zone)}
          className={tabClass(zone)}
        >
          <span className="truncate">{label}</span>
        </button>
      ))}
    </nav>
  );
}
