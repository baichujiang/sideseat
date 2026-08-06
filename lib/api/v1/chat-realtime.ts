import "server-only";

import { v1Error, v1RequestId } from "@/lib/api/v1/http";

export type ChatRealtimeConversationKind = "DIRECT" | "COURSE" | "GROUP";

export type ChatRealtimeConversation = {
  kind: ChatRealtimeConversationKind;
  id: string;
};

export type ChatRealtimeDatabaseEvent = {
  sequence: bigint;
  messageId: string;
  eventType: string;
  occurredAt: Date;
};

export type ChatRealtimeDelivery<T> = ChatRealtimeDatabaseEvent &
  (
    | { delivery: "UPSERT"; message: T }
    | { delivery: "REMOVE" }
    | { delivery: "SKIP" }
  );

type CursorPayload = {
  v: 1;
  k: ChatRealtimeConversationKind;
  c: string;
  s: string;
};

const POLL_INTERVAL_MS = 500;
const HEARTBEAT_INTERVAL_MS = 15_000;
const AUTHORIZATION_INTERVAL_MS = 15_000;
const BATCH_SIZE = 100;
const RETRY_INTERVAL_MS = 1_000;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function isAbortError(cause: unknown) {
  return cause instanceof DOMException
    ? cause.name === "AbortError"
    : (cause as { name?: unknown } | null)?.name === "AbortError";
}

export function encodeChatRealtimeCursor(
  conversation: ChatRealtimeConversation,
  sequence: bigint,
) {
  const payload: CursorPayload = {
    v: 1,
    k: conversation.kind,
    c: conversation.id,
    s: sequence.toString(),
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function decodeChatRealtimeCursor(
  raw: string,
  conversation: ChatRealtimeConversation,
): bigint | null {
  if (!/^[A-Za-z0-9_-]{8,512}$/.test(raw)) return null;

  try {
    const payload = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<CursorPayload>;
    if (
      payload.v !== 1 ||
      payload.k !== conversation.kind ||
      payload.c !== conversation.id ||
      typeof payload.s !== "string" ||
      !/^\d{1,30}$/.test(payload.s)
    ) {
      return null;
    }
    const sequence = BigInt(payload.s);
    return sequence >= 0n ? sequence : null;
  } catch {
    return null;
  }
}

function requestedCursor(request: Request) {
  const urlCursor = new URL(request.url).searchParams.get("cursor")?.trim();
  const headerCursor = request.headers.get("last-event-id")?.trim();
  return urlCursor || headerCursor || null;
}

function sseBlock(options: {
  event: string;
  data: unknown;
  id?: string;
  retry?: number;
}) {
  return `${options.retry ? `retry: ${options.retry}\n` : ""}${
    options.id ? `id: ${options.id}\n` : ""
  }event: ${options.event}\ndata: ${JSON.stringify(options.data)}\n\n`;
}

function streamData(
  type: string,
  conversation: ChatRealtimeConversation,
  cursor: string,
  occurredAt: Date,
  extra: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 1,
    type,
    conversation,
    cursor,
    occurredAt: occurredAt.toISOString(),
    ...extra,
  };
}

export async function chatRealtimeSseResponse<T>(
  request: Request,
  options: {
    conversation: ChatRealtimeConversation;
    currentSequence: () => Promise<bigint>;
    retentionFloor: () => Promise<bigint>;
    isAuthorized: () => Promise<boolean>;
    loadDeliveries: (after: bigint, take: number) => Promise<ChatRealtimeDelivery<T>[]>;
  },
): Promise<Response> {
  const rawCursor = requestedCursor(request);
  const [currentSequence, retentionFloor] = await Promise.all([
    options.currentSequence(),
    options.retentionFloor(),
  ]);
  let sequence: bigint;
  if (rawCursor) {
    const decoded = decodeChatRealtimeCursor(rawCursor, options.conversation);
    if (decoded === null || decoded > currentSequence) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "The realtime cursor is invalid for this conversation.",
        status: 422,
        field: "Last-Event-ID",
      });
    }
    if (decoded < retentionFloor) {
      return v1Error(request, {
        code: "REALTIME_CURSOR_EXPIRED",
        message: "The realtime cursor has expired. Reload message history before reconnecting.",
        status: 409,
        field: "Last-Event-ID",
        headers: { "X-Realtime-Reset": "history" },
      });
    }
    sequence = decoded;
  } else {
    sequence = currentSequence;
  }

  const requestId = v1RequestId(request);
  const initialSequence = sequence;
  const encoder = new TextEncoder();
  const signal = request.signal;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (value: string) => controller.enqueue(encoder.encode(value));
      let cursor = encodeChatRealtimeCursor(options.conversation, sequence);
      let lastHeartbeatAt = Date.now();
      let lastAuthorizationAt = Date.now();

      enqueue(
        sseBlock({
          event: "stream.ready",
          id: cursor,
          retry: RETRY_INTERVAL_MS,
          data: streamData("STREAM_READY", options.conversation, cursor, new Date(), {
            resumed: rawCursor !== null,
          }),
        }),
      );

      try {
        while (!signal.aborted) {
          const latestRetentionFloor = await options.retentionFloor();
          if (sequence < latestRetentionFloor) {
            const resetSequence = await options.currentSequence();
            const resetCursor = encodeChatRealtimeCursor(
              options.conversation,
              resetSequence,
            );
            enqueue(
              sseBlock({
                event: "stream.reset",
                data: streamData(
                  "STREAM_RESET",
                  options.conversation,
                  resetCursor,
                  new Date(),
                  {
                    reason: "EVENT_HISTORY_EXPIRED",
                    reloadHistory: true,
                  },
                ),
              }),
            );
            break;
          }

          if (Date.now() - lastAuthorizationAt >= AUTHORIZATION_INTERVAL_MS) {
            const authorized = await options.isAuthorized();
            if (!authorized) {
              enqueue(
                sseBlock({
                  event: "stream.revoked",
                  data: streamData(
                    "STREAM_REVOKED",
                    options.conversation,
                    cursor,
                    new Date(),
                  ),
                }),
              );
              break;
            }
            lastAuthorizationAt = Date.now();
          }

          const deliveries = await options.loadDeliveries(sequence, BATCH_SIZE);
          let lastEmittedSequence = sequence;
          for (const delivery of deliveries) {
            sequence = delivery.sequence;
            cursor = encodeChatRealtimeCursor(options.conversation, sequence);

            if (delivery.delivery === "UPSERT") {
              enqueue(
                sseBlock({
                  event: "chat.message.upserted",
                  id: cursor,
                  data: streamData(
                    "CHAT_MESSAGE_UPSERTED",
                    options.conversation,
                    cursor,
                    delivery.occurredAt,
                    { message: delivery.message },
                  ),
                }),
              );
              lastEmittedSequence = sequence;
            } else if (delivery.delivery === "REMOVE") {
              enqueue(
                sseBlock({
                  event: "chat.message.removed",
                  id: cursor,
                  data: streamData(
                    "CHAT_MESSAGE_REMOVED",
                    options.conversation,
                    cursor,
                    delivery.occurredAt,
                    { messageId: delivery.messageId },
                  ),
                }),
              );
              lastEmittedSequence = sequence;
            }
          }

          if (sequence !== lastEmittedSequence) {
            enqueue(
              sseBlock({
                event: "stream.cursor",
                id: cursor,
                data: streamData("STREAM_CURSOR", options.conversation, cursor, new Date()),
              }),
            );
          }

          if (deliveries.length === BATCH_SIZE) continue;

          if (Date.now() - lastHeartbeatAt >= HEARTBEAT_INTERVAL_MS) {
            enqueue(`: heartbeat ${Date.now()}\n\n`);
            lastHeartbeatAt = Date.now();
          }
          await sleep(POLL_INTERVAL_MS, signal);
        }
      } catch (cause) {
        if (!isAbortError(cause)) {
          console.error("chatRealtimeSseResponse", {
            requestId,
            conversation: options.conversation,
            initialSequence: initialSequence.toString(),
            cause,
          });
          try {
            enqueue(
              sseBlock({
                event: "stream.error",
                data: streamData("STREAM_ERROR", options.conversation, cursor, new Date(), {
                  retryable: true,
                  requestId,
                }),
              }),
            );
          } catch {
            // The network may already be gone.
          }
        }
      } finally {
        try {
          controller.close();
        } catch {
          // The response may already have been closed by the runtime.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "private, no-store, no-cache, max-age=0, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
      "X-Request-Id": requestId,
    },
  });
}
