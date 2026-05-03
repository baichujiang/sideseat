"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { urlBase64ToUint8Array } from "@/lib/push/url-base64";

type ApiOk<T> = { success: true; data: T };
type ApiErr = { success: false; error: string };

async function readJson<T>(res: Response): Promise<T | ApiErr> {
  return (await res.json()) as T | ApiErr;
}

export function PushNotificationsCard() {
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

    const vRes = await fetch("/api/push/vapid-public", { credentials: "same-origin" });
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
        setHint("Notifications were blocked. You can allow them in browser settings.");
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
        setHint("Could not read subscription keys from the browser.");
        setBusy(false);
        return;
      }
      const res = await fetch("/api/push/subscribe", {
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
        setHint("error" in out ? out.error : "Could not save subscription.");
        setBusy(false);
        return;
      }
      setSubscribed(true);
    } catch {
      setHint("Something went wrong while enabling push.");
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
          await fetch("/api/push/subscribe", {
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
      setHint("Could not turn off push on this device.");
    }
    setBusy(false);
  };

  if (phase === "loading") {
    return (
      <Card className="flex items-center gap-3 border-border/80">
        <Loader2 className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
        <CardTitle className="text-base">Notifications</CardTitle>
      </Card>
    );
  }

  if (!supported) {
    return (
      <Card className="space-y-2 border-dashed border-border/80 bg-muted/20">
        <div className="flex items-center gap-2">
          <BellOff className="h-5 w-5 text-muted-foreground" aria-hidden />
          <CardTitle className="text-base">Push notifications</CardTitle>
        </div>
        <CardDescription>
          This browser does not support Web Push, or you need to install the app from a supported
          home-screen shortcut first.
        </CardDescription>
      </Card>
    );
  }

  if (!serverKey) {
    return (
      <Card className="space-y-2 border-dashed border-amber-200/80 bg-amber-50/40 dark:bg-amber-950/20">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-amber-800 dark:text-amber-200" aria-hidden />
          <CardTitle className="text-base">Push notifications</CardTitle>
        </div>
        <CardDescription>
          The server is missing VAPID keys. Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and
          VAPID_SUBJECT to the environment (see <code className="text-xs">.env.example</code>).
        </CardDescription>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 border-border/80">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
          <Bell className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle className="text-base">Push notifications</CardTitle>
          <CardDescription>
            Get alerted for new chat messages and calendar entries starting in about 15 minutes.
          </CardDescription>
        </div>
      </div>
      {hint ? <p className="text-sm text-destructive">{hint}</p> : null}
      <div className="flex flex-wrap gap-2">
        {subscribed ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void disable()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Turn off on this device
          </Button>
        ) : (
          <Button type="button" disabled={busy} onClick={() => void enable()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Turn on
          </Button>
        )}
      </div>
    </Card>
  );
}
