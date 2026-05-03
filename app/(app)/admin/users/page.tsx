import Link from "next/link";
import { Prisma } from "@prisma/client";

import { SectionHeader } from "@/components/layout/section-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { StatusBadge } from "@/components/ui/status-badge";
import { requireAdminUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

const PAGE_SIZE = 25;

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; page?: string; guests?: string }>;
}) {
  await requireAdminUser();
  const params = (await searchParams) ?? {};
  const query = params.q?.trim() ?? "";
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const includeGuests = params.guests === "1";

  const where: Prisma.UserWhereInput = {
    ...(includeGuests ? {} : { isGuest: false }),
    ...(query
      ? {
          OR: [
            { username: { contains: query, mode: "insensitive" as const } },
            { nickname: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
            { major: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { _count: { select: { courses: true } } },
    }),
    prisma.user.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const buildHref = (nextPage: number) => {
    const qs: Record<string, string> = {};
    if (query) qs.q = query;
    if (includeGuests) qs.guests = "1";
    if (nextPage > 1) qs.page = String(nextPage);
    return { pathname: "/admin/users", query: qs } as const;
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title={`Users · ${total}`}
        action={
          <Link className="text-sm font-medium text-foreground" href="/profile">
            Back to profile
          </Link>
        }
      />

      <form className="flex flex-wrap gap-2" method="get">
        <input
          className="h-10 min-w-[220px] flex-1 rounded-xl border border-border bg-background px-3 text-sm"
          defaultValue={query}
          name="q"
          placeholder="Search username, nickname, email, major"
          type="search"
        />
        <label className="flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 text-xs text-muted-foreground">
          <input
            defaultChecked={includeGuests}
            name="guests"
            type="checkbox"
            value="1"
          />
          Include guests
        </label>
        <button
          className="h-10 rounded-xl bg-foreground px-4 text-sm font-medium text-background"
          type="submit"
        >
          Search
        </button>
      </form>

      {users.length ? (
        <div className="space-y-2">
          {users.map((user) => (
            <Link
              className="block"
              href={`/admin/users/${user.id}`}
              key={user.id}
            >
              <Card className="flex items-center gap-3 py-3 transition-colors hover:bg-muted/40">
                <PresetAvatar id={user.avatarUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {user.nickname ?? user.username}
                    </p>
                    {user.isGuest ? (
                      <StatusBadge tone="neutral">guest</StatusBadge>
                    ) : null}
                    {user.verifiedStudent ? (
                      <StatusBadge tone="calm">verified</StatusBadge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    @{user.username}
                    {user.email ? ` · ${user.email}` : ""}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[user.school, user.degreeLevel, user.major, user.semester ? `sem ${user.semester}` : null]
                      .filter(Boolean)
                      .join(" · ") || "no profile data"}
                  </p>
                </div>
                <div className="shrink-0 text-right text-xs text-muted-foreground">
                  <p>{user._count.courses} courses</p>
                  <p>{user.createdAt.toLocaleDateString()}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState title="No users match" />
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          {page > 1 ? (
            <Link className="font-medium" href={buildHref(page - 1)}>
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link className="font-medium" href={buildHref(page + 1)}>
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}
