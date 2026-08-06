export type SseEvent = {
  event: string;
  id: string | null;
  data: Record<string, unknown>;
};

export class SseTestClient {
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly decoder = new TextDecoder();
  private readonly pending: string[] = [];
  private buffer = "";

  constructor(
    response: Response,
    private readonly controller: AbortController,
  ) {
    if (!response.body) throw new Error("SSE response has no body.");
    this.reader = response.body.getReader();
  }

  private parse(block: string): SseEvent | null {
    let event = "message";
    let id: string | null = null;
    const data: string[] = [];
    for (const rawLine of block.split("\n")) {
      const line = rawLine.replace(/\r$/, "");
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");
      if (field === "event") event = value;
      else if (field === "id") id = value;
      else if (field === "data") data.push(value);
    }
    if (data.length === 0) return null;
    return { event, id, data: JSON.parse(data.join("\n")) as Record<string, unknown> };
  }

  async next(
    predicate: (event: SseEvent) => boolean,
    timeoutMs = 15_000,
  ): Promise<SseEvent> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      while (this.pending.length > 0) {
        const parsed = this.parse(this.pending.shift()!);
        if (parsed && predicate(parsed)) return parsed;
      }

      const remaining = deadline - Date.now();
      const result = await new Promise<ReadableStreamReadResult<Uint8Array>>(
        (resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error("Timed out waiting for an SSE event.")),
            remaining,
          );
          this.reader.read().then(
            (value) => {
              clearTimeout(timeout);
              resolve(value);
            },
            (cause) => {
              clearTimeout(timeout);
              reject(cause);
            },
          );
        },
      );
      if (result.done) throw new Error("SSE stream ended before the expected event.");
      this.buffer += this.decoder.decode(result.value, { stream: true });
      const blocks = this.buffer.split("\n\n");
      this.buffer = blocks.pop() ?? "";
      this.pending.push(...blocks);
    }
    throw new Error("Timed out waiting for an SSE event.");
  }

  close() {
    this.controller.abort();
    void this.reader.cancel().catch(() => {});
  }
}

export async function openSse(
  baseURL: string,
  path: string,
  token: string,
  cursor?: string,
) {
  const controller = new AbortController();
  const response = await fetch(`${baseURL}${path}`, {
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
      ...(cursor ? { "Last-Event-ID": cursor } : {}),
    },
    cache: "no-store",
    signal: controller.signal,
  });
  if (response.status !== 200) {
    throw new Error(`Expected SSE 200, got ${response.status} for ${path}`);
  }
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    throw new Error(`Expected text/event-stream for ${path}`);
  }
  return new SseTestClient(response, controller);
}

export function messageBody(event: SseEvent) {
  const message = event.data.message;
  if (!message || typeof message !== "object" || !("body" in message)) return undefined;
  return (message as { body?: unknown }).body;
}
