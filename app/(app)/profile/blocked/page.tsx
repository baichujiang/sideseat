import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";

import { BackLink } from "@/components/nav/back-link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export default async function BlockedUsersPage() {
  const user = await requireOnboardedUser();
  const locale = await getServerAppLocale();
  const ui = getMessages(locale).profile;

  const blockedUsers = await prisma.block.findMany({
    where: { blockerId: user.id },
    include: { blocked: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BackLink fallback="/profile" label={ui.blockedPageBack} />
        <div>
          <h1 className="page-screen-title">{ui.blockedPageTitle}</h1>
          <p className="text-xs text-muted-foreground">{ui.blockedPageSubtitle}</p>
        </div>
      </div>

      {blockedUsers.length ? (
        <ul className="overflow-hidden rounded-[1.125rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
          {blockedUsers.map((block) => (
            <li
              key={block.id}
              className="flex items-center gap-3.5 border-b border-border/50 px-4 py-3.5 last:border-b-0"
            >
              <Link href={`/users/${block.blocked.id}?returnTo=%2Fprofile%2Fblocked`} className="shrink-0">
                <PresetAvatar
                  id={block.blocked.avatarUrl}
                  size={52}
                  className="ring-2 ring-background shadow-sm"
                />
              </Link>

              <div className="min-w-0 flex-1">
                <Link
                  href={`/users/${block.blocked.id}?returnTo=%2Fprofile%2Fblocked`}
                  className="block truncate text-[15px] font-semibold leading-tight text-foreground"
                >
                  {block.blocked.nickname ?? ui.blockedPageStudentFallback}
                </Link>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  {formatMessage(ui.blockedPageBlockedAt, {
                    time: formatDistanceToNowStrict(block.createdAt, { addSuffix: true }),
                  })}
                </p>
              </div>

              <form action={`/api/blocks/${block.blockedId}`} method="post" className="shrink-0">
                <input type="hidden" name="_method" value="DELETE" />
                <Button type="submit" variant="outline" className="h-9 rounded-full px-3 text-[12px]">
                  {ui.blockedPageUnblock}
                </Button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={ui.blockedPageEmptyTitle} description={ui.blockedPageEmptyDescription} />
      )}
    </div>
  );
}
