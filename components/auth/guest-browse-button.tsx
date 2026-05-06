"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { setAccessToken } from "@/lib/auth/client-access-token";
import { Button } from "@/components/ui/button";

export function GuestBrowseButton({ className }: { className?: string }) {
  const router = useRouter();
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
        setError(payload.error ?? "Could not start guest session.");
        return;
      }
      if (payload.data?.accessToken) {
        setAccessToken(payload.data.accessToken);
      }
      router.push("/courses");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button className={className} disabled={busy} onClick={start} type="button" variant="outline">
        {busy ? "Opening…" : "Browse courses as guest"}
      </Button>
      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
