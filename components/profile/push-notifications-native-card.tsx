"use client";

import { Bell } from "lucide-react";

import {
  mePageCardClass,
  mePageIconMutedClass,
  mePageIconShellClass,
} from "@/components/profile/me-settings-row";
import { Button } from "@/components/ui/button";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { openIosAppSettings } from "@/lib/capacitor/open-ios-app-settings";
import { isCapacitorIos } from "@/lib/capacitor/platform";
import { cn } from "@/lib/utils";

const settingCardClass = cn(mePageCardClass, "px-5 py-4");

/** iOS/Android Capacitor shell — Web Push is not used; guide users to system notification settings. */
export function PushNotificationsNativeCard() {
  const { messages: m } = useLocaleContext();
  const showSettingsButton = isCapacitorIos();

  return (
    <div className="space-y-2">
      <div className={cn(settingCardClass, "flex items-start gap-3")}>
        <span className={mePageIconShellClass}>
          <Bell className={mePageIconMutedClass} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-tight text-classmates-ink dark:text-foreground">
            {m.push.title}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-classmates-sub dark:text-zinc-400">
            {m.push.nativeSubtitle}
          </p>
          <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{m.push.nativeBody}</p>
          <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{m.push.nativeDataSync}</p>
          {showSettingsButton ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 h-8 rounded-lg text-[12px] font-semibold"
              onClick={() => openIosAppSettings()}
            >
              {m.push.nativeOpenSettings}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
