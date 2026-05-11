"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { MessageCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useAppMessages } from "@/hooks/use-app-locale";

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
  const { userProfile: up } = useAppMessages();
  const [opening, setOpening] = useState(false);
  const [errorText, setErrorText] = useState("");

  async function openChat() {
    if (opening) return;
    setOpening(true);
    setErrorText("");
    try {
      const res = await apiFetch("/api/connections/open", {
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
            : up.messageUnableOpen,
        );
        return;
      }
      const data = payload?.data as { connectionId?: string } | undefined;
      if (!data?.connectionId) {
        setOpening(false);
        setErrorText(up.messageUnexpectedResponse);
        return;
      }

      const suffix = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
      router.push(`/connections/${data.connectionId}${suffix}`);
    } catch {
      setOpening(false);
      setErrorText(up.messageNetworkError);
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
        {opening ? up.messageOpening : up.messageButton}
      </Button>
      {errorText ? <p className="text-xs text-rose-600">{errorText}</p> : null}
    </div>
  );
}
