import type { Metadata } from "next";

import { NativeAppHandoff } from "@/components/native/native-app-handoff";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export const metadata: Metadata = {
  title: "Shared schedule · SideSeat",
  description: "Open this shared schedule in SideSeat for iPhone.",
  robots: { index: false, follow: false },
};

export default async function ScheduleShareAppHandoffPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const locale = await getServerAppLocale();
  const zh = locale === "zh-CN";
  const nativeURL = `sideseat://share/view/${encodeURIComponent(safeDecodeToken(token))}`;

  return (
    <NativeAppHandoff
      openURL={nativeURL}
      title={zh ? "在 SideSeat 中查看共享日程" : "View this schedule in SideSeat"}
      description={
        zh
          ? "共享日程现在由 iPhone App 原生打开。网页版本已停止提供日程交互。"
          : "Shared schedules now open natively in the iPhone app. Schedule interaction is no longer available on the web."
      }
    />
  );
}

function safeDecodeToken(token: string): string {
  try {
    return decodeURIComponent(token);
  } catch {
    return token;
  }
}
