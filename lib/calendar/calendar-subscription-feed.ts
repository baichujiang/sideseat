import { createHash } from "crypto";

type CalendarSubscriptionFeedLink<Owner> = {
  id: string;
  lastAccessedAt: Date | null;
  owner: Owner;
};

type CalendarSubscriptionFeedDependencies<Owner> = {
  resolve: (rawToken: string) => Promise<CalendarSubscriptionFeedLink<Owner> | null>;
  loadIcs: (owner: Owner) => Promise<string>;
  touch: (link: CalendarSubscriptionFeedLink<Owner>) => Promise<void>;
  reportError: (cause: unknown) => void;
};

function notFound() {
  return new Response("Calendar subscription not found.\n", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function temporarilyUnavailable() {
  return new Response("Calendar subscription is temporarily unavailable.\n", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "60",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/**
 * Serves a private calendar feed behind one failure boundary. In particular,
 * resolving the opaque token queries the database and must fail as a
 * retryable 503 rather than escaping as an unhandled route error.
 */
export async function serveCalendarSubscriptionFeed<Owner>(
  request: Request,
  rawToken: string,
  dependencies: CalendarSubscriptionFeedDependencies<Owner>,
) {
  try {
    const link = await dependencies.resolve(rawToken);
    if (!link) return notFound();

    const ics = await dependencies.loadIcs(link.owner);
    const etag = `"${createHash("sha256").update(ics, "utf8").digest("hex")}"`;
    await dependencies.touch(link);

    if (request.headers.get("if-none-match") === etag) {
      return new Response(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "private, max-age=300, must-revalidate" },
      });
    }

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="sideseat-calendar.ics"',
        "Cache-Control": "private, max-age=300, must-revalidate",
        ETag: etag,
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (cause) {
    dependencies.reportError(cause);
    return temporarilyUnavailable();
  }
}
