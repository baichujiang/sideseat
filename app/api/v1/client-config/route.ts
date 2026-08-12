import { v1Success } from "@/lib/api/v1/http";
import { isStoreKitSupportEnabled } from "@/lib/api/v1/storekit-catalog";
import { DEFAULT_DISCOVER_SERVED_CITY } from "@/lib/discover/discover-city-name-keys";
import { DISCOVER_SERVED_CITIES } from "@/lib/discover/discover-served-cities";
import { isDashScopeConfigured } from "@/lib/llm/dashscope";
import { nativeClientApnsFeatures } from "@/lib/push/apns-env";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return v1Success(
    {
      apiVersion: "v1",
      serverTime: new Date().toISOString(),
      ios: {
        minimumSupportedVersion: process.env.IOS_MINIMUM_SUPPORTED_VERSION?.trim() || "1.0.0",
        latestVersion: process.env.IOS_LATEST_VERSION?.trim() || "1.0.0",
        maintenanceMode: process.env.IOS_MAINTENANCE_MODE === "1",
      },
      features: {
        nativeAuthentication: true,
        naturalLanguageSchedule: isDashScopeConfigured(),
        storeKitSupport: isStoreKitSupportEnabled(),
        ...nativeClientApnsFeatures(),
      },
      discover: {
        defaultCity: DEFAULT_DISCOVER_SERVED_CITY,
        servedCities: [...DISCOVER_SERVED_CITIES],
      },
      links: {
        privacyUrl:
          process.env.NEXT_PUBLIC_PRIVACY_URL?.trim() ||
          absolutePublicUrl("/privacy"),
        supportUrl:
          process.env.NEXT_PUBLIC_SUPPORT_URL?.trim() ||
          absolutePublicUrl("/support"),
      },
    },
    { request },
  );
}

function absolutePublicUrl(path: string): string | null {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (!base || !base.startsWith("http")) return null;
  return `${base}${path}`;
}
