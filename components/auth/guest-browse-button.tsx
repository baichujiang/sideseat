"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { setAccessToken } from "@/lib/auth/client-access-token";
import { Button } from "@/components/ui/button";

export function GuestBrowseButton({ className }: { className?: string }) {
  const router = useRouter();
  const { messages } = useLocaleContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    setError("");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? messages.inbox.sessionBootstrapFailed);
        return;
      }
      if (payload.data?.accessToken) {
        setAccessToken(payload.data.accessToken);
      }
      router.replace("/courses");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button className={className} disabled={busy} onClick={start} type="button" variant="outline">
        {busy ? messages.guest.browseCoursesBusy : messages.guest.browseCoursesAsGuest}
      </Button>
      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
