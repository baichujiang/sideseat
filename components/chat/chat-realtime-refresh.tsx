"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

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
    }
  | {
      kind: "group";
      groupChatId: string;
      latestMessageId: string | null;
      intervalMs?: number;
    };

function readUrl(props: ChatRealtimeRefreshProps): string {
  return props.kind === "direct"
    ? `/api/connections/${props.connectionId}/read`
    : props.kind === "course"
      ? `/api/courses/${props.courseId}/chat/read`
      : `/api/group-chats/${props.groupChatId}/read`;
}

function latestUrl(props: ChatRealtimeRefreshProps): string {
  return props.kind === "direct"
    ? `/api/connections/${props.connectionId}/messages/latest`
    : props.kind === "course"
      ? `/api/courses/${props.courseId}/chat/messages/latest`
      : `/api/group-chats/${props.groupChatId}/messages/latest`;
}

export function ChatRealtimeRefresh(props: ChatRealtimeRefreshProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const intervalMs = props.intervalMs ?? 5000;
  const targetKey =
    props.kind === "direct"
      ? `direct:${props.connectionId}`
      : props.kind === "course"
        ? `course:${props.courseId}`
        : `group:${props.groupChatId}`;
  const staleRefreshAttempts = useRef(0);

  useEffect(() => {
    staleRefreshAttempts.current = 0;
  }, [props.latestMessageId, targetKey]);

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
    async function pollLatest() {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;

      const response = await apiFetch(latestUrl(props), {
        cache: "no-store",
      }).catch(() => null);
      if (!response?.ok) return;

      const payload = await response.json().catch(() => null);
      const remoteLatest = payload?.data?.latestMessageId;
      if (typeof remoteLatest !== "string" && remoteLatest !== null) return;

      if (remoteLatest !== props.latestMessageId) {
        staleRefreshAttempts.current += 1;
        router.refresh();

        if (staleRefreshAttempts.current >= 2) {
          const query = searchParams.toString();
          window.location.replace(query ? `${pathname}?${query}` : pathname);
        }
      } else {
        staleRefreshAttempts.current = 0;
      }
    }

    const id = window.setInterval(() => {
      void pollLatest();
    }, intervalMs);

    return () => window.clearInterval(id);
  }, [intervalMs, pathname, props, router, searchParams]);

  return null;
}
