import type { Metadata } from "next";

import { NativeAppHandoff } from "@/components/native/native-app-handoff";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export const metadata: Metadata = {
  title: "SideSeat for iPhone",
  description: "Open SideSeat on iPhone.",
};

export default async function IOSAppPage({
  searchParams,
}: {
  searchParams?: Promise<{ verification?: string }>;
}) {
  const locale = await getServerAppLocale();
  const query = (await searchParams) ?? {};
  const zh = locale === "zh-CN";

  return (
    <NativeAppHandoff
      openURL="sideseat://home"
      title={zh ? "SideSeat 现已专注于 iPhone" : "SideSeat now lives on iPhone"}
      description={
        zh
          ? "网页 App 已停止使用。请在 SideSeat iPhone App 中继续。"
          : "The web app has been retired. Continue in the SideSeat iPhone app."
      }
      statusMessage={verificationMessage(query.verification, zh)}
    />
  );
}

function verificationMessage(status: string | undefined, zh: boolean): string | null {
  switch (status) {
    case "success":
      return zh
        ? "学校邮箱验证成功。打开 SideSeat 后即可刷新学校标签。"
        : "School email verified. Open SideSeat to refresh your school badge.";
    case "expired":
      return zh
        ? "验证链接已过期，请在 SideSeat 中重新发送。"
        : "This verification link expired. Request a new one in SideSeat.";
    case "invalid":
      return zh
        ? "验证链接无效，请在 SideSeat 中重新发送。"
        : "This verification link is invalid. Request a new one in SideSeat.";
    default:
      return null;
  }
}
