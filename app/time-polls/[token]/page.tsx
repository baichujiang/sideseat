import type { Metadata } from "next";
import { SharedTimePoll } from "@/components/time-polls/shared-time-poll";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
export const metadata: Metadata = { title: "Find a time together · SideSeat", robots: { index: false, follow: false }, referrer: "same-origin" };
export default async function TimePollPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = await getServerAppLocale();
  return <SharedTimePoll key={token} token={token} zh={locale === "zh-CN"} />;
}
