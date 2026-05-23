"use client";

import { MeDiscoverCitySelect } from "@/components/profile/me-discover-city-select";
import type { DiscoverCityNameKey } from "@/lib/discover/discover-city-name-keys";
import { useAppMessages } from "@/hooks/use-app-locale";

export function ProfileDiscoverCityEditor({ city }: { city: DiscoverCityNameKey }) {
  const account = useAppMessages().account;

  return (
    <div className="space-y-3 rounded-2xl border border-classmates-edge bg-classmates-surface p-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card">
      <p className="text-[13px] leading-snug text-muted-foreground">{account.discoverCityHint}</p>
      <MeDiscoverCitySelect value={city} variant="control" className="w-full" />
    </div>
  );
}
