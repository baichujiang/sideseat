import type { Metadata } from "next";
import { NativeAppHandoff } from "@/components/native/native-app-handoff";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export const metadata: Metadata = { title: "Coordinate a time · SideSeat", robots: { index: false, follow: false } };

export default async function TimePollHandoff({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const locale = await getServerAppLocale();
  const zh = locale === "zh-CN";
  const valid = /^[A-Za-z0-9_-]{32}$/.test(token);
  return <NativeAppHandoff
    openURL={`sideseat://time-polls/${encodeURIComponent(token)}`}
    title={zh ? "共同商议时间" : "Coordinate a time"}
    description={zh ? "在 Sideseat 中填写空余时间，查看共同时间和参加人数最多的时段。登录后才能查看征集内容。" : "Mark your free time in Sideseat and find the times everyone can attend. Sign in to view this poll."}
    statusMessage={valid ? null : zh ? "无法使用这个链接" : "This link is unavailable"}
  />;
}
