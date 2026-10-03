import type { Metadata } from "next";

import { NativeAppHandoff } from "@/components/native/native-app-handoff";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export const metadata: Metadata = {
  title: "Open SideSeat",
  description: "Continue in the SideSeat iPhone app.",
  robots: { index: false, follow: false },
};

// Universal Links open the app before this browser fallback is requested.
// Callback parameters belong to the native SDK; never render or forward them.
export default async function XiaohongshuAppHandoffPage() {
  const locale = await getServerAppLocale();
  const zh = locale === "zh-CN";

  return (
    <NativeAppHandoff
      openURL="sideseat://home"
      title={zh ? "返回 SideSeat" : "Return to SideSeat"}
      description={
        zh
          ? "请在装有 SideSeat 的 iPhone 上打开此链接，继续使用 App。"
          : "Open this link on an iPhone with SideSeat installed to continue in the app."
      }
    />
  );
}
