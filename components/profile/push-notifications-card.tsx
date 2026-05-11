"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { useCallback, useEffect, useId, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

import { urlBase64ToUint8Array } from "@/lib/push/url-base64";
import { cn } from "@/lib/utils";

type ApiOk<T> = { success: true; data: T };
type ApiErr = { success: false; error: string };

async function readJson<T>(res: Response): Promise<T | ApiErr> {
  return (await res.json()) as T | ApiErr;
}

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
        "relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-classmates-blue focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:opacity-45",
        on ? "bg-[#34C759]" : "bg-[#E5E5EA] dark:bg-zinc-600",
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2),0_1px_1px_rgba(0,0,0,0.06)] transition-[left] duration-200 ease-out",
          on ? "left-[calc(100%-29px)]" : "left-[2px]",
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

const settingCardClass =
  "rounded-2xl border border-classmates-edge bg-classmates-surface px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card";

export function PushNotificationsCard() {
  const { messages: m } = useLocaleContext();
  const titleId = useId();
  const [phase, setPhase] = useState<"loading" | "ready">("loading");
  const [supported, setSupported] = useState(false);
  const [serverKey, setServerKey] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setPhase("loading");
    setHint(null);
    const pushOk = typeof window !== "undefined" && "PushManager" in window && "serviceWorker" in navigator;
    setSupported(pushOk);
    if (!pushOk) {
      setPhase("ready");
      return;
    }

    const vRes = await apiFetch("/api/push/vapid-public", { credentials: "same-origin" });
    const vJson = await readJson<ApiOk<{ publicKey: string | null }>>(vRes);
    if (!("success" in vJson) || !vJson.success) {
      setServerKey(null);
      setPhase("ready");
      return;
    }
    setServerKey(vJson.data.publicKey);

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSubscribed(Boolean(sub));
    } catch {
      setSubscribed(false);
    }
    setPhase("ready");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = async () => {
    if (!serverKey) return;
    setBusy(true);
    setHint(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setHint(m.push.hintPermissionDenied);
        setBusy(false);
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await reg.update();
      const decoded = urlBase64ToUint8Array(serverKey);
      const key = new Uint8Array(decoded.byteLength);
      key.set(decoded);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key,
      });
      const j = sub.toJSON();
      if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) {
        setHint(m.push.hintBadKeys);
        setBusy(false);
        return;
      }
      const res = await apiFetch("/api/push/subscribe", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: j.endpoint,
          keys: { p256dh: j.keys.p256dh, auth: j.keys.auth },
        }),
      });
      const out = await readJson<ApiOk<{ saved: boolean }>>(res);
      if (!("success" in out) || !out.success) {
        setHint("error" in out ? out.error : m.push.hintSaveFailed);
        setBusy(false);
        return;
      }
      setSubscribed(true);
    } catch {
      setHint(m.push.hintEnableFailed);
    }
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true);
    setHint(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const j = sub.toJSON();
        if (j.endpoint) {
          await apiFetch("/api/push/subscribe", {
            method: "DELETE",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: j.endpoint }),
          });
        }
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      setHint(m.push.hintDisableFailed);
    }
    setBusy(false);
  };

  if (phase === "loading") {
    return (
      <div className={cn(settingCardClass, "flex items-start gap-3")}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[20px] bg-muted/50 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p id={titleId} className="text-[15px] font-semibold leading-tight text-classmates-ink dark:text-foreground">
              {m.push.title}
            </p>
            <span className="h-[31px] w-[51px] shrink-0 rounded-full bg-muted/60 dark:bg-muted" aria-hidden />
          </div>
          <p className="mt-1 text-[13px] leading-snug text-classmates-sub dark:text-zinc-400">{m.push.loading}</p>
        </div>
      </div>
    );
  }

  if (!supported) {
    return (
      <div className={cn(settingCardClass, "flex items-start gap-3")}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[20px] bg-muted/45 text-muted-foreground">
          <BellOff className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p id={titleId} className="text-[15px] font-semibold leading-tight text-classmates-ink dark:text-foreground">
              {m.push.title}
            </p>
            <span className="shrink-0 text-[12px] font-medium text-muted-foreground">{m.push.unavailable}</span>
          </div>
          <p className="mt-1 text-[13px] leading-snug text-classmates-sub dark:text-zinc-400">
            {m.push.unavailableBody}
          </p>
        </div>
      </div>
    );
  }

  if (!serverKey) {
    return (
      <div
        className={cn(
          settingCardClass,
          "flex items-start gap-3 border-amber-200/80 bg-amber-50/40 dark:border-amber-900/45 dark:bg-amber-950/25",
        )}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-200">
          <Bell className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p id={titleId} className="text-[15px] font-semibold leading-tight text-classmates-ink dark:text-foreground">
              {m.push.title}
            </p>
            <span className="shrink-0 text-[12px] font-medium text-amber-900/80 dark:text-amber-200/90">{m.push.setup}</span>
          </div>
          <p className="mt-1 text-[13px] leading-snug text-classmates-sub dark:text-zinc-400">
            {m.push.setupBodyBefore}
            <code className="rounded bg-background/80 px-1 text-[12px]">.env.example</code>
            {m.push.setupBodyAfter}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className={cn(settingCardClass, "flex items-start gap-3")}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[20px] bg-classmates-blue-soft text-classmates-blue">
          <Bell className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p id={titleId} className="text-[15px] font-semibold leading-tight text-classmates-ink dark:text-foreground">
              {m.push.title}
            </p>
            <IosStyleSwitch
              labelledBy={titleId}
              on={subscribed}
              disabled={!serverKey}
              busy={busy}
              onToggle={() => {
                if (busy) return;
                void (subscribed ? disable() : enable());
              }}
            />
          </div>
          <p className="mt-1 pr-1 text-[12px] leading-snug text-classmates-sub dark:text-zinc-400">
            {m.push.subtitle}
          </p>
        </div>
      </div>
      {hint ? <p className="px-1 text-xs text-destructive">{hint}</p> : null}
    </div>
  );
}
