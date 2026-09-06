import type { Metadata } from "next";

import { NativeAppHandoff } from "@/components/native/native-app-handoff";
import { prisma } from "@/lib/db/prisma";
import {
  eventShareSnapshot,
  resolveEventShareLink,
} from "@/lib/event-share/event-share-service";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Event details · SideSeat",
  description: "Open these event details in SideSeat for iPhone.",
  robots: { index: false, follow: false },
};

export default async function EventShareAppHandoffPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const locale = await getServerAppLocale();
  const zh = locale === "zh-CN";
  const decoded = safeDecodeToken(token);
  const link = await resolveEventShareLink(prisma, decoded);
  const snapshot = link ? eventShareSnapshot(link) : null;
  return (
    <NativeAppHandoff
      openURL={`sideseat://share/event/${encodeURIComponent(decoded)}`}
      title={zh ? "日程详情副本" : "Event details"}
      description={
        snapshot
          ? zh
            ? `${snapshot.ownerDisplayLabel} 分享了以下日程详情。打开 SideSeat 可将独立副本添加到你的日历。`
            : `${snapshot.ownerDisplayLabel} shared the event details below. Open SideSeat to add an independent copy to your calendar.`
          : zh
            ? "这份日程详情已过期、被撤销或无法使用。"
            : "These event details have expired, were revoked, or are unavailable."
      }
      statusMessage={snapshot ? null : zh ? "无法打开日程详情" : "Event details unavailable"}
    >
      {snapshot ? (
        <section className="rounded-2xl border border-[#d9dee5] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7a5362]">
            {zh ? "分享内容" : "Shared details"}
          </p>
          <h2 className="mt-2 text-xl font-semibold leading-7 text-[#17202d]">
            {snapshot.title}
          </h2>
          <dl className="mt-4 space-y-3 text-sm leading-5">
            <SharedDetail
              label={zh ? "时间" : "When"}
              value={formatRange(snapshot.startAt, snapshot.endAt, locale)}
            />
            {snapshot.location ? (
              <SharedDetail label={zh ? "地点" : "Location"} value={snapshot.location} />
            ) : null}
            {snapshot.note ? (
              <SharedDetail label={zh ? "备注" : "Notes"} value={snapshot.note} />
            ) : null}
          </dl>
          <p className="mt-5 border-t border-[#e7e9ed] pt-4 text-xs leading-5 text-[#667085]">
            {zh
              ? "这是日程副本，不是正式邀请。添加后不会通知分享人，也不会同步后续修改。"
              : "This is a shared copy, not an invitation. Adding it does not notify the sender or sync future changes."}
          </p>
        </section>
      ) : null}
    </NativeAppHandoff>
  );
}

function SharedDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-medium text-[#667085]">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-[#344054]">{value}</dd>
    </div>
  );
}

function formatRange(startISO: string, endISO: string, locale: string) {
  const formatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  });
  return `${formatter.format(new Date(startISO))} – ${formatter.format(new Date(endISO))}`;
}

function safeDecodeToken(token: string): string {
  try {
    return decodeURIComponent(token);
  } catch {
    return token;
  }
}
