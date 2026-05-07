"use client";

import { useCallback, useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { apiFetch } from "@/lib/auth/api-fetch";

type ChatRealtimeRefreshProps =
  | {
      kind: "direct";
      connectionId: string;
      latestMessageId: string | null;
    }
  | {
      kind: "course";
      courseId: string;
      latestMessageId: string | null;
    }
  | {
      kind: "group";
      groupChatId: string;
      latestMessageId: string | null;
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

function streamUrl(props: ChatRealtimeRefreshProps): string {
  return props.kind === "direct"
    ? `/api/connections/${props.connectionId}/messages/stream`
    : props.kind === "course"
      ? `/api/courses/${props.courseId}/chat/messages/stream`
      : `/api/group-chats/${props.groupChatId}/messages/stream`;
}

async function consumeLatestIdSse(
  url: string,
  signal: AbortSignal,
  onLatestMessageId: (id: string | null) => void,
): Promise<void> {
  const res = await apiFetch(url, {
    method: "GET",
    signal,
    cache: "no-store",
    headers: { Accept: "text/event-stream" },
  });
  if (!res.ok || !res.body) {
    throw new Error(`chat sse ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const block of parts) {
      for (const line of block.split("\n")) {
        const trimmed = line.replace(/\r$/, "");
        if (!trimmed.startsWith("data:")) continue;
        const raw = trimmed.slice(5).trim();
        try {
          const parsed = JSON.parse(raw) as { latestMessageId?: unknown };
          const id = parsed.latestMessageId;
          if (typeof id === "string") onLatestMessageId(id);
          else if (id === null) onLatestMessageId(null);
        } catch {
          /* ignore malformed */
        }
      }
    }
  }
}

export function ChatRealtimeRefresh(props: ChatRealtimeRefreshProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const targetKey =
    props.kind === "direct"
      ? `direct:${props.connectionId}`
      : props.kind === "course"
        ? `course:${props.courseId}`
        : `group:${props.groupChatId}`;
  const staleRefreshAttempts = useRef(0);
  const latestPropRef = useRef(props.latestMessageId);
  latestPropRef.current = props.latestMessageId;

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
  }, [props, props.latestMessageId, targetKey]);

  const applyRemoteLatest = useCallback(
    (remoteLatest: string | null) => {
      if (remoteLatest !== latestPropRef.current) {
        staleRefreshAttempts.current += 1;
        router.refresh();
        if (staleRefreshAttempts.current >= 2) {
          const query = searchParams.toString();
          window.location.replace(query ? `${pathname}?${query}` : pathname);
        }
      } else {
        staleRefreshAttempts.current = 0;
      }
    },
    [router, pathname, searchParams],
  );

  useEffect(() => {
    let cancelled = false;
    const ac = new AbortController();

    async function sseLoop() {
      while (!cancelled && !ac.signal.aborted) {
        try {
          await consumeLatestIdSse(streamUrl(props), ac.signal, applyRemoteLatest);
        } catch {
          /* dropped, offline, auth, or maxDuration */
        }
        if (cancelled || ac.signal.aborted) break;
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    void sseLoop();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [applyRemoteLatest, pathname, props, router, searchParams]);

  useEffect(() => {
    async function syncLatestOnce() {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;

      const response = await apiFetch(latestUrl(props), {
        cache: "no-store",
      }).catch(() => null);
      if (!response?.ok) return;

      const payload = await response.json().catch(() => null);
      const remoteLatest = payload?.data?.latestMessageId;
      if (typeof remoteLatest !== "string" && remoteLatest !== null) return;

      applyRemoteLatest(remoteLatest);
    }

    const onFocus = () => void syncLatestOnce();
    const onVis = () => {
      if (document.visibilityState === "visible") void syncLatestOnce();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    void syncLatestOnce();

    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [applyRemoteLatest, props]);

  return null;
}
