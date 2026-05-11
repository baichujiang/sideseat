import { assertPublicHttpUrlForIcsFetch, normalizeCalendarSubscriptionUrl } from "@/lib/calendar/subscription-url";

const MAX_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

export async function fetchIcsSubscriptionText(rawUrl: string): Promise<string> {
  const normalized = normalizeCalendarSubscriptionUrl(rawUrl);
  const u = assertPublicHttpUrlForIcsFetch(normalized);
  const target = u.toString();

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(target, {
      method: "GET",
      redirect: "follow",
      signal: ac.signal,
      headers: {
        Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1",
        "User-Agent": "ClassLink-ICS-Subscription/1.0",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`Feed returned HTTP ${res.status}.`);
    }
    const len = res.headers.get("content-length");
    if (len && Number(len) > MAX_BYTES) {
      throw new Error("Calendar feed is too large.");
    }
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) {
      throw new Error("Calendar feed is too large.");
    }
    const text = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      throw new Error("Response is not a valid iCalendar feed.");
    }
    return text;
  } finally {
    clearTimeout(t);
  }
}
