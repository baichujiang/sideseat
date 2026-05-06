"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/auth/api-fetch";

type ChatRealtimeRefreshProps =
  | {
      kind: "direct";
      connectionId: string;
      latestMessageId: string | null;
      intervalMs?: number;
    }
  | {
      kind: "course";
      courseId: string;
      latestMessageId: string | null;
      intervalMs?: number;
    };

function readUrl(props: ChatRealtimeRefreshProps): string {
  return props.kind === "direct"
    ? `/api/connections/${props.connectionId}/read`
    : `/api/courses/${props.courseId}/chat/read`;
}

export function ChatRealtimeRefresh(props: ChatRealtimeRefreshProps) {
  const router = useRouter();
  const intervalMs = props.intervalMs ?? 5000;
  const targetKey =
    props.kind === "direct" ? `direct:${props.connectionId}` : `course:${props.courseId}`;

  useEffect(() => {
    let cancelled = false;

    async function markRead() {
      await apiFetch(readUrl(props), { method: "POST" }).catch(() => null);
      if (!cancelled) {
        window.dispatchEvent(new Event("sideseat:inbox-unread-changed"));
      }
    }

    void markRead();
    return () => {
      cancelled = true;
    };
  }, [props.latestMessageId, targetKey]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        router.refresh();
      }
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [intervalMs, router]);

  return null;
}
