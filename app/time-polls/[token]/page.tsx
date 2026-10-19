import type { Metadata } from "next";
import { cookies } from "next/headers";
import { SharedTimePoll } from "@/components/time-polls/shared-time-poll";
import { POLL_LOCALE_COOKIE } from "@/lib/time-polls/browser-types";
export const metadata: Metadata = { title: "一起计划 · SideSeat", robots: { index: false, follow: false }, referrer: "same-origin" };
export default async function TimePollPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = (await cookies()).get(POLL_LOCALE_COOKIE)?.value;
  return <SharedTimePoll key={token} token={token} zh={locale !== "en"} />;
}
