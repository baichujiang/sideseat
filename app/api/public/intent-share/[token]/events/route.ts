import { setTimeout as delay } from "node:timers/promises";
import { getSessionUser } from "@/lib/auth/session";
import { v1Error } from "@/lib/api/v1/http";
import { IntentShareError, sharedConversation } from "@/lib/intent-share/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const user = await getSessionUser();
  if (!user) return v1Error(request, { status: 401, code: "AUTHENTICATION_REQUIRED", message: "Open contact to continue." });
  const { token } = await params;
  try {
    const initial = await sharedConversation(token, user.id);
    const cancellation = new AbortController();
    const signal = AbortSignal.any([request.signal, cancellation.signal]);
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (event: string, data: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        let previous = JSON.stringify(initial);
        const started = Date.now();
        try {
          controller.enqueue(encoder.encode("retry: 1000\n\n"));
          emit("conversation", initial);
          // One serial read per second covers greetings, replies and Plan status changes.
          // Every read rechecks the shared link and pair permissions. Reconnect also rechecks the session.
          while (!signal.aborted && Date.now() - started < 50_000) {
            await delay(1000, undefined, { signal });
            const snapshot = await sharedConversation(token, user.id);
            if (signal.aborted) break;
            const next = JSON.stringify(snapshot);
            if (next !== previous) { emit("conversation", snapshot); previous = next; }
            else controller.enqueue(encoder.encode(": heartbeat\n\n"));
          }
        } catch (cause) {
          if (!signal.aborted) {
            if (cause instanceof IntentShareError) emit("unavailable", {});
            else { console.error("Intent share stream", cause); emit("reconnect", {}); }
          }
        } finally {
          if (!signal.aborted) controller.close();
        }
      },
      cancel() { cancellation.abort(); },
    });
    return new Response(stream, { headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "private, no-store, no-cache, no-transform",
      "X-Accel-Buffering": "no",
    } });
  } catch (cause) {
    if (cause instanceof IntentShareError) return v1Error(request, { status: cause.status, code: "NOT_FOUND", message: cause.message });
    throw cause;
  }
}
