"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useAppMessages } from "@/hooks/use-app-locale";
import { formatMessage } from "@/lib/i18n/messages";

/**
 * First-message composer: one textarea + Send. On success it navigates to the
 * freshly opened 1:1 thread. Used everywhere we previously showed an Invite
 * form (course member list, Discover, classmate profile).
 *
 * `courseId` is optional context for `originCourseId`; pass it in when the
 * composer is rendered from a course-scoped surface so we can label the
 * resulting thread's profile as "Connected via {courseName}".
 */
export function FirstMessageComposer({
  peerId,
  courseId,
  placeholder,
  autoFocus = false,
  onSent,
  compact = false,
}: {
  peerId: string;
  courseId?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onSent?: () => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { chat, common } = useAppMessages();
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const trimmed = body.trim();
  const tooLong = trimmed.length > 500;
  const canSubmit = trimmed.length > 0 && !tooLong && !sending;

  async function submit() {
    if (!canSubmit) return;
    setSending(true);
    setError("");
    try {
      const res = await apiFetch("/api/connections/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId, body: trimmed, courseId }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSending(false);
        setError(
          typeof payload.error === "string"
            ? payload.error
            : chat.unableToSendMessage,
        );
        return;
      }
      const data = payload.data as { connectionId?: string } | undefined;
      if (!data?.connectionId) {
        setSending(false);
        setError(chat.unexpectedServerResponse);
        return;
      }
      onSent?.();
      const parentReturn =
        searchParams.get("returnTo")?.trim() || pathname;
      router.push(
        `/connections/${data.connectionId}?returnTo=${encodeURIComponent(parentReturn)}`,
      );
      router.refresh();
    } catch (cause) {
      console.error(cause);
      setSending(false);
      setError(chat.networkErrorTryAgain);
    }
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-2 rounded-xl border border-border bg-muted/30 p-3"}>
      <textarea
        autoFocus={autoFocus}
        className="min-h-16 w-full rounded-xl border border-border bg-background px-3 py-2 text-[16px] leading-snug focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        placeholder={placeholder ?? chat.sayHiPlaceholder}
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          // Cmd/Ctrl+Enter sends, matching chat conventions.
          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            void submit();
          }
        }}
        maxLength={600}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          {tooLong
            ? formatMessage(chat.firstMessageTooLong, { count: trimmed.length })
            : trimmed.length > 0
              ? formatMessage(chat.firstMessageCharCount, { count: trimmed.length })
              : chat.firstMessageUnlockHint}
        </p>
        <Button
          size="sm"
          disabled={!canSubmit}
          onClick={submit}
          type="button"
        >
          {sending ? common.sending : chat.sendAria}
        </Button>
      </div>
      {error ? <p className="text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
