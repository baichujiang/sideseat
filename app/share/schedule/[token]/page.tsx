import type { Metadata } from "next";

import { ScheduleShareOwnerClient } from "@/components/schedule-share/schedule-share-owner-client";
import { ScheduleSharePublicClient } from "@/components/schedule-share/schedule-share-public-client";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { buildPublicScheduleShareSnapshotForActiveLink } from "@/lib/schedule-share/public-snapshot";
import { buildSharePublicHeadline } from "@/lib/schedule-share/format-share-public-headline";
import { findScheduleShareLinkByPlainToken } from "@/lib/schedule-share/resolve-link";
import { scheduleShareOwnerDisplayLabel } from "@/lib/schedule-share/build-schedule-share-snapshot";
import { loadViewerProposalFromPlan } from "@/lib/schedule-share/create-plan-from-guest-proposal";
import { serializeViewerProposal } from "@/lib/schedule-share/viewer-proposal";
import { isScheduleShareOwner } from "@/lib/schedule-share/usage-limit";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const decoded = decodeURIComponent(token);
  const locale = await getServerAppLocale();
  const messages = getMessages(locale);
  const s = messages.scheduleShare;

  const resolved = await findScheduleShareLinkByPlainToken(prisma, decoded);
  if (!resolved.ok) {
    return {
      title: s.publicUnavailableTitle,
      robots: { index: false, follow: false },
    };
  }

  const owner =
    scheduleShareOwnerDisplayLabel(resolved.link.owner) ?? s.ownerDisplayFallback;
  const { headline } = buildSharePublicHeadline({
    ownerDisplayLabel: owner,
    ownerFallback: s.ownerDisplayFallback,
    rangeStart: resolved.link.rangeStart,
    rangeEnd: resolved.link.rangeEnd,
    locale,
    messages,
  });

  return {
    title: headline,
    robots: { index: false, follow: false },
  };
}

export default async function ShareSchedulePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const decoded = decodeURIComponent(token);
  const sessionUser = await getSessionUser();
  const showGuestNudge = !sessionUser;

  const resolved = await findScheduleShareLinkByPlainToken(prisma, decoded, {
    viewerUserId: sessionUser?.id,
  });

  if (!resolved.ok) {
    return <ScheduleSharePublicClient unavailable showGuestNudge={showGuestNudge} />;
  }

  const snapshot = await buildPublicScheduleShareSnapshotForActiveLink(prisma, resolved.link);
  const isOwner = isScheduleShareOwner(resolved.link, sessionUser?.id);

  if (isOwner && sessionUser?.onboardingComplete) {
    const categories = await prisma.userCalendarCategory.findMany({
      where: { userId: sessionUser.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, name: true, presetKey: true },
    });
    const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const shareUrl = `${appOrigin}/share/schedule/${encodeURIComponent(decoded)}`;

    return (
      <ScheduleShareOwnerClient
        token={decoded}
        shareUrl={shareUrl}
        initialSnapshot={snapshot}
        linkSettings={{
          rangeStart: resolved.link.rangeStart.toISOString(),
          rangeEnd: resolved.link.rangeEnd.toISOString(),
          revealConfig: resolved.link.revealConfig,
          allowGuestProposals: resolved.link.allowGuestProposals,
          usageLimit: resolved.link.usageLimit,
          expiresAt: resolved.link.expiresAt.toISOString(),
          createdAt: resolved.link.createdAt.toISOString(),
        }}
        calendarCategories={categories}
      />
    );
  }

  let initialMyProposal = null;
  if (sessionUser?.onboardingComplete) {
    const plan = await prisma.planRequest.findFirst({
      where: {
        scheduleShareLinkId: resolved.link.id,
        proposerUserId: sessionUser.id,
        status: { in: ["PENDING", "ACCEPTED"] },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        message: true,
        location: true,
        startTime: true,
        endTime: true,
        status: true,
      },
    });
    if (plan) {
      initialMyProposal = loadViewerProposalFromPlan(plan);
    } else {
      const row = await prisma.scheduleShareGuestProposal.findFirst({
        where: {
          scheduleShareLinkId: resolved.link.id,
          proposerUserId: sessionUser.id,
          status: { in: ["PENDING", "ACCEPTED"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          title: true,
          note: true,
          location: true,
          startTime: true,
          endTime: true,
          status: true,
        },
      });
      initialMyProposal = row ? serializeViewerProposal(row) : null;
    }
  }

  return (
    <ScheduleSharePublicClient
      token={decoded}
      snapshot={snapshot}
      showGuestNudge={showGuestNudge}
      initialMyProposal={initialMyProposal}
    />
  );
}
