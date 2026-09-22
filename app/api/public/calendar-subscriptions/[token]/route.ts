import {
  resolveCalendarSubscription,
  touchCalendarSubscription,
} from "@/lib/calendar/calendar-subscription-service";
import { serveCalendarSubscriptionFeed } from "@/lib/calendar/calendar-subscription-feed";
import { loadCalendarIcsExport } from "@/lib/calendar/load-calendar-ics-export";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  return serveCalendarSubscriptionFeed(request, token, {
    resolve: (rawToken) => resolveCalendarSubscription(prisma, rawToken),
    loadIcs: (owner) =>
      loadCalendarIcsExport(owner, { mode: "subscription" }),
    touch: (link) => touchCalendarSubscription(prisma, link),
    reportError: (cause) => {
      console.error("GET /api/public/calendar-subscriptions/[redacted]", cause);
    },
  });
}
