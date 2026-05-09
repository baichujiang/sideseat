import Link from "next/link";
import { format } from "date-fns";
import { ProductFeedbackTopic } from "@prisma/client";

import { SectionHeader } from "@/components/layout/section-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireAdminUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { cn } from "@/lib/utils";

function topicLabel(t: ProductFeedbackTopic): string {
  switch (t) {
    case ProductFeedbackTopic.BUG:
      return "Bug / problem";
    case ProductFeedbackTopic.IDEA:
      return "Feature idea";
    default:
      return "Other";
  }
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams?: Promise<{ topic?: string; q?: string }>;
}) {
  await requireAdminUser();
  const params = (await searchParams) ?? {};
  const topicParam = Object.values(ProductFeedbackTopic).includes(params.topic as ProductFeedbackTopic)
    ? (params.topic as ProductFeedbackTopic)
    : undefined;
  const q = params.q?.trim() ?? "";

  const where = {
    ...(topicParam ? { topic: topicParam } : {}),
    ...(q
      ? {
          OR: [
            { message: { contains: q, mode: "insensitive" as const } },
            { user: { nickname: { contains: q, mode: "insensitive" as const } } },
            { user: { email: { contains: q, mode: "insensitive" as const } } },
            { user: { username: { contains: q, mode: "insensitive" as const } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.productFeedback.findMany({
      where,
      include: {
        user: {
          select: { id: true, username: true, email: true, nickname: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.productFeedback.count({ where }),
  ]);

  return (
    <div className="space-y-6 pb-10">
      <SectionHeader
        title="Product feedback"
        description={`${total} submission${total === 1 ? "" : "s"} — latest 200 shown`}
      />

      <form className="flex flex-wrap items-end gap-3" method="get">
        <label className="flex flex-col gap-1 text-[12px] font-medium text-muted-foreground">
          Topic
          <select
            name="topic"
            defaultValue={topicParam ?? ""}
            className="h-10 min-w-[10rem] rounded-xl border border-border bg-background px-3 text-sm"
          >
            <option value="">All</option>
            <option value={ProductFeedbackTopic.BUG}>Bug</option>
            <option value={ProductFeedbackTopic.IDEA}>Idea</option>
            <option value={ProductFeedbackTopic.OTHER}>Other</option>
          </select>
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-[12px] font-medium text-muted-foreground">
          Search message or user
          <input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Text, email, nickname…"
            className="h-10 rounded-xl border border-border bg-background px-3 text-sm"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Apply
        </button>
      </form>

      {items.length === 0 ? (
        <EmptyState title="No feedback yet" description="Submissions from Me → 意见与反馈 will appear here." />
      ) : (
        <ul className="space-y-3">
          {items.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground">{topicLabel(row.topic)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {format(row.createdAt, "yyyy-MM-dd HH:mm")}
                    {" · "}
                    <Link className="underline-offset-2 hover:underline" href={`/admin/users/${row.user.id}`}>
                      {row.user.nickname?.trim() || row.user.username}
                    </Link>
                    {row.user.email ? (
                      <>
                        {" · "}
                        <span className="tabular-nums">{row.user.email}</span>
                      </>
                    ) : null}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold",
                    row.emailSentAt
                      ? "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {row.emailSentAt ? "Emailed" : "Saved only"}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">{row.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
