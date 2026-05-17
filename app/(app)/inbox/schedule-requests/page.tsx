import { ScheduleShareGuestProposalStatus } from "@prisma/client";

import { BackLink } from "@/components/nav/back-link";
import { EmptyState } from "@/components/ui/empty-state";
import { ScheduleShareGuestProposalRow } from "@/components/schedule-share/schedule-share-guest-proposal-row";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function InboxScheduleRequestsPage() {
  const user = await requireOnboardedUser();
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);

  const proposals = await prisma.scheduleShareGuestProposal.findMany({
    where: {
      scheduleShareLink: { ownerUserId: user.id },
      status: ScheduleShareGuestProposalStatus.PENDING,
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      guestDisplayName: true,
      guestContact: true,
      title: true,
      note: true,
      location: true,
      startTime: true,
      endTime: true,
    },
  });

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-2 px-0.5">
        <BackLink href="/inbox" label={ui.common.back} />
        <div className="min-w-0">
          <h1 className="page-screen-title">{ui.inbox.scheduleRequestsTitle}</h1>
          <p className="text-[13px] leading-snug text-muted-foreground">{ui.inbox.scheduleRequestsSubtitle}</p>
        </div>
      </header>

      {proposals.length === 0 ? (
        <EmptyState
          title={ui.inbox.scheduleRequestsEmptyTitle}
          description={ui.inbox.scheduleRequestsEmptyDesc}
        />
      ) : (
        <ul className="overflow-hidden rounded-[1.125rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
          {proposals.map((p, i) => (
            <ScheduleShareGuestProposalRow
              key={p.id}
              isLast={i === proposals.length - 1}
              proposal={{
                id: p.id,
                guestDisplayName: p.guestDisplayName,
                guestContact: p.guestContact,
                title: p.title,
                note: p.note,
                location: p.location,
                startTime: p.startTime.toISOString(),
                endTime: p.endTime.toISOString(),
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
