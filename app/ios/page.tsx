import type { Metadata } from "next";
import Link from "next/link";

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
      title={zh ? "SideSeat，随时在你身边" : "Take SideSeat with you"}
      description={
        zh
          ? "在 iPhone 上继续，或打开新版网页端。一个账号，共用你的校园生活。"
          : "Continue on iPhone or use the new web app. One account for your campus life."
      }
      statusMessage={verificationMessage(query.verification, zh)}
    ><Link href="/web" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">{zh ? "在浏览器中使用 SideSeat →" : "Use SideSeat in your browser →"}</Link></NativeAppHandoff>
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
