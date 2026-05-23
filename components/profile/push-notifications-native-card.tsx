"use client";

import { Bell, Loader2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import {
  mePageCardClass,
  mePageIconMutedClass,
  mePageIconShellClass,
} from "@/components/profile/me-settings-row";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { openIosAppSettings } from "@/lib/capacitor/open-ios-app-settings";
import { isCapacitorIos } from "@/lib/capacitor/platform";
import {
  attachNativePushListeners,
  getNativePushPermission,
  registerNativePush,
  removeNativePushToken,
  requestNativePushPermission,
  saveNativePushToken,
  unregisterNativePush,
  type NativePushPermission,
} from "@/lib/push/capacitor-native-push";
import { cn } from "@/lib/utils";

const settingCardClass = cn(mePageCardClass, "px-5 py-4");

/** iOS-style settings switch (track + thumb). */
function IosStyleSwitch({
  on,
  disabled,
  busy,
  onToggle,
  labelledBy,
}: {
  on: boolean;
  disabled: boolean;
  busy: boolean;
  onToggle: () => void;
  labelledBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      {...(labelledBy ? { "aria-labelledby": labelledBy } : {})}
      disabled={disabled || busy}
      onClick={onToggle}
      className={cn(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-classmates-blue focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:opacity-45",
        on ? "bg-classmates-blue" : "bg-[#E5E7EB] dark:bg-zinc-600",
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-[left] duration-200 ease-out",
          on ? "left-[calc(100%-1.625rem)]" : "left-0.5",
        )}
      />
      {busy ? (
        <Loader2
          className="pointer-events-none absolute inset-0 m-auto h-3.5 w-3.5 animate-spin text-white/95"
          aria-hidden
        />
      ) : null}
    </button>
  );
}

/** Capacitor iOS/Android — native push via @capacitor/push-notifications. */
export function PushNotificationsNativeCard() {
  const { messages: m } = useLocaleContext();
  const titleId = useId();
  const showSettingsButton = isCapacitorIos();
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const [permission, setPermission] = useState<NativePushPermission>("unknown");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    const detach = attachNativePushListeners({
      onToken: async (token) => {
        tokenRef.current = token;
        const saved = await saveNativePushToken(token);
        if (!saved) {
          setHint(m.push.hintSaveFailed);
          setEnabled(false);
          return;
        }
        setEnabled(true);
        setPermission("granted");
        setHint(null);
      },
      onError: () => {
        setHint(m.push.nativeRegisterFailed);
        setEnabled(false);
      },
    });

    void (async () => {
      const perm = await getNativePushPermission();
      setPermission(perm);
      if (perm === "granted") {
        try {
          await registerNativePush();
          setEnabled(true);
        } catch {
          setEnabled(false);
        }
      }
      setPhase("ready");
    })();

    return detach;
  }, [m.push.hintSaveFailed, m.push.nativeRegisterFailed]);

  const enable = async () => {
    setBusy(true);
    setHint(null);
    try {
      let perm = await getNativePushPermission();
      if (perm !== "granted") {
        perm = await requestNativePushPermission();
      }
      setPermission(perm);
      if (perm !== "granted") {
        setHint(m.push.hintPermissionDenied);
        setEnabled(false);
        setBusy(false);
        return;
      }
      await registerNativePush();
      setEnabled(true);
    } catch {
      setHint(m.push.hintEnableFailed);
      setEnabled(false);
    }
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true);
    setHint(null);
    try {
      const token = tokenRef.current;
      if (token) {
        await removeNativePushToken(token);
      }
      await unregisterNativePush();
      tokenRef.current = null;
      setEnabled(false);
    } catch {
      setHint(m.push.hintDisableFailed);
    }
    setBusy(false);
  };

  if (phase === "loading") {
    return (
      <div className={cn(settingCardClass, "flex items-start gap-3")}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted/50 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold leading-tight text-classmates-ink dark:text-foreground">
            {m.push.title}
          </p>
          <p className="mt-1 text-[13px] leading-snug text-classmates-sub dark:text-zinc-400">
            {m.push.loading}
          </p>
        </div>
      </div>
    );
  }

  const switchDisabled = permission === "denied";

  return (
    <div className="space-y-2">
      <div className={cn(settingCardClass, "flex items-start gap-3")}>
        <span className={mePageIconShellClass}>
          <Bell className={mePageIconMutedClass} strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p id={titleId} className="text-base font-semibold leading-tight text-classmates-ink dark:text-foreground">
              {m.push.title}
            </p>
            <IosStyleSwitch
              labelledBy={titleId}
              on={enabled}
              disabled={switchDisabled}
              busy={busy}
              onToggle={() => {
                if (busy || switchDisabled) return;
                void (enabled ? disable() : enable());
              }}
            />
          </div>
          <p className="mt-1 text-[13px] leading-snug text-classmates-sub dark:text-zinc-400">
            {m.push.nativeSubtitle}
          </p>
          <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{m.push.nativeDataSync}</p>
          {permission === "denied" ? (
            <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{m.push.nativeDeniedHint}</p>
          ) : null}
          {showSettingsButton && permission === "denied" ? (
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
      {hint ? <p className="px-1 text-xs text-destructive">{hint}</p> : null}
    </div>
  );
}
