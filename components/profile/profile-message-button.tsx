"use client";

import { MessageCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/**
 * Profile-level message entrypoint.
 *
 * UX goal: no inline tiny composer in profile cards. Tapping "Message" should
 * feel native — open the chat thread immediately (existing or newly created),
 * then let the user type in the full chat composer.
 */
export function ProfileMessageButton({
  peerId,
  courseId,
  returnTo,
  fullWidth = true,
}: {
  peerId: string;
  courseId?: string;
  returnTo?: string;
  fullWidth?: boolean;
}) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [errorText, setErrorText] = useState("");

  async function openChat() {
    if (opening) return;
    setOpening(true);
    setErrorText("");
    try {
      const res = await fetch("/api/connections/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId, ...(courseId ? { courseId } : {}) }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOpening(false);
        setErrorText(
          typeof payload?.error === "string"
            ? payload.error
            : "Unable to open chat.",
        );
        return;
      }
      const data = payload?.data as { connectionId?: string } | undefined;
      if (!data?.connectionId) {
        setOpening(false);
        setErrorText("Unexpected server response.");
        return;
      }

      const suffix = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
      router.push(`/connections/${data.connectionId}${suffix}`);
    } catch {
      setOpening(false);
      setErrorText("Network error. Try again.");
    }
  }

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        onClick={openChat}
        disabled={opening}
        className={fullWidth ? "w-full" : undefined}
      >
        {opening ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <MessageCircle className="mr-1 h-4 w-4" />
        )}
        {opening ? "Opening…" : "Message"}
      </Button>
      {errorText ? <p className="text-xs text-rose-600">{errorText}</p> : null}
    </div>
  );
}
