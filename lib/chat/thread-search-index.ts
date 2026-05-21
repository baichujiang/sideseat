import type { MessageType } from "@prisma/client";

export type ThreadSearchEntry = { id: string; preview: string };

type ConnectionMessageSlice = {
  id: string;
  type: MessageType;
  body: string;
  deletedAt: Date | null;
  imageUrl: string | null;
  locationName: string | null;
  planRequest: {
    title: string;
    message: string | null;
    location: string | null;
  } | null;
};

function squashPreview(parts: string[]): string {
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .join(" · ")
    .trim()
    .slice(0, 280);
}

/** Builds plain-text previews for direct-message threads (server-safe). */
export function indexConnectionMessagesForSearch(
  messages: ReadonlyArray<ConnectionMessageSlice>,
): ThreadSearchEntry[] {
  const out: ThreadSearchEntry[] = [];
  for (const m of messages) {
    if (m.deletedAt) continue;
    const parts: string[] = [];
    switch (m.type) {
      case "TEXT":
        parts.push(m.body);
        break;
      case "IMAGE":
        parts.push(m.body);
        break;
      case "LOCATION": {
        if (m.locationName) parts.push(m.locationName);
        if (m.body.trim()) parts.push(m.body);
        break;
      }
      case "SYSTEM":
        parts.push(m.body);
        break;
      case "PLAN_REQUEST_CARD": {
        const p = m.planRequest;
        if (p) {
          parts.push(p.title);
          if (p.message?.trim()) parts.push(p.message.trim());
          if (p.location?.trim()) parts.push(p.location.trim());
        }
        break;
      }
      case "PLAN_CONFIRMED_CARD":
        if (m.body.trim()) parts.push(m.body);
        break;
      case "AVAILABILITY_CARD":
        if (m.body.trim()) parts.push(m.body);
        break;
      case "SCHEDULE_SHARE_CARD":
        parts.push("Shared schedule");
        if (m.body.trim()) parts.push(m.body);
        break;
      default:
        break;
    }
    const preview = squashPreview(parts);
    if (preview.length > 0) out.push({ id: m.id, preview });
  }
  return out;
}

type SimpleTextMessage = {
  id: string;
  body: string;
  deletedAt: Date | null;
};

export function indexPlainTextMessagesForSearch(messages: ReadonlyArray<SimpleTextMessage>): ThreadSearchEntry[] {
  const out: ThreadSearchEntry[] = [];
  for (const m of messages) {
    if (m.deletedAt) continue;
    const t = m.body.trim();
    if (!t) continue;
    out.push({ id: m.id, preview: t.slice(0, 280) });
  }
  return out;
}
