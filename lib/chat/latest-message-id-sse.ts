import "server-only";

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Long-lived GET stream: server polls `getLatestMessageId` and emits SSE `data`
 * when the id changes. No Redis — suitable for modest concurrency; reconnects
 * on `maxDuration` or network blips (client should loop fetch).
 */
export function latestMessageIdSseResponse(
  request: Request,
  options: {
    pollIntervalMs: number;
    getLatestMessageId: () => Promise<string | null>;
  },
): Response {
  const encoder = new TextEncoder();
  const signal = request.signal;
  const { pollIntervalMs, getLatestMessageId } = options;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        let previous = await getLatestMessageId();
        if (signal.aborted) return;
        let lastPing = Date.now();

        while (!signal.aborted) {
          await sleep(pollIntervalMs, signal);
          if (signal.aborted) break;

          const current = await getLatestMessageId();
          if (signal.aborted) break;

          if (current !== previous) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ latestMessageId: current })}\n\n`),
            );
            previous = current;
          }

          if (Date.now() - lastPing > 25_000) {
            controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`));
            lastPing = Date.now();
          }
        }
      } catch (e) {
        if ((e as { name?: string })?.name !== "AbortError") {
          console.error("latestMessageIdSseResponse", e);
        }
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
