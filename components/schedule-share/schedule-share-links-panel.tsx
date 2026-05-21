"use client";

import { format } from "date-fns";
import { Link2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useLocaleContext } from "@/components/i18n/locale-provider";
import { apiFetch } from "@/lib/auth/api-fetch";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { formatMessage } from "@/lib/i18n/messages";
import { formatShareCreateRangeSummary } from "@/lib/schedule-share/format-share-create-summary";
import { scheduleShareLinkDisplayStatus } from "@/lib/schedule-share/share-link-status";
import { cn } from "@/lib/utils";

export type ScheduleShareLinkListItem = {
  id: string;
  rangeStart: string;
  rangeEnd: string;
  expiresAt: string;
  revokedAt: string | null;
  consumedAt: string | null;
  usageLimit: "SINGLE_USE" | "UNLIMITED";
  createdAt: string;
};

export function ScheduleShareLinksPanel({ links }: { links: ScheduleShareLinkListItem[] }) {
  const router = useRouter();
  const { locale, messages: ui } = useLocaleContext();
  const p = ui.profile;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeLinks = useMemo(() => {
    const now = new Date();
    return links.filter((link) =>
      scheduleShareLinkDisplayStatus(
        {
          revokedAt: link.revokedAt ? new Date(link.revokedAt) : null,
          expiresAt: new Date(link.expiresAt),
          consumedAt: link.consumedAt ? new Date(link.consumedAt) : null,
          usageLimit: link.usageLimit,
        },
        now,
      ) === "active",
    );
  }, [links]);

  const activeIdSet = useMemo(() => new Set(activeLinks.map((link) => link.id)), [activeLinks]);

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => activeIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [activeIdSet]);

  const allSelected = activeLinks.length > 0 && selectedIds.size === activeLinks.length;
  const someSelected = selectedIds.size > 0;

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(activeLinks.map((link) => link.id)));
  }

  function toggleSelect(linkId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(linkId)) next.delete(linkId);
      else next.add(linkId);
      return next;
    });
  }

  async function revokeLinkIds(linkIds: string[]) {
    if (linkIds.length === 0) return;

    setRevoking(true);
    setError(null);
    try {
      const results = await Promise.all(
        linkIds.map(async (linkId) => {
          const res = await apiFetch(`/api/schedule-shares/${encodeURIComponent(linkId)}/revoke`, {
            method: "POST",
          });
          const payload = await res.json().catch(() => ({}));
          return res.ok && payload.success === true;
        }),
      );

      if (results.every(Boolean)) {
        setSelectedIds(new Set());
        router.refresh();
        return;
      }

      setError(ui.scheduleShare.createFailed);
      if (results.some(Boolean)) router.refresh();
    } catch {
      setError(ui.scheduleShare.networkError);
    } finally {
      setRevoking(false);
    }
  }

  async function revokeSelected() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        formatMessage(p.myPlanShareLinkRevokeSelectedConfirm, { count: String(ids.length) }),
      )
    ) {
      return;
    }
    await revokeLinkIds(ids);
  }

  if (activeLinks.length === 0) return null;

  return (
    <section className="space-y-2">
      <div className="px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {p.myPlanShareLinksHeading}
        </h2>
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{p.myPlanShareLinksHint}</p>
      </div>

      <div className="flex items-center justify-between gap-2 px-1">
        <button
          type="button"
          disabled={revoking}
          onClick={toggleSelectAll}
          className="text-[12px] font-semibold text-primary transition hover:text-primary/80 disabled:opacity-50"
        >
          {allSelected ? p.myPlanShareLinkDeselectAll : p.myPlanShareLinkSelectAll}
        </button>
        {someSelected ? (
          <button
            type="button"
            disabled={revoking}
            onClick={() => void revokeSelected()}
            className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 px-3 py-1.5 text-[12px] font-semibold text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
          >
            {revoking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              formatMessage(p.myPlanShareLinkRevokeSelected, { count: String(selectedIds.size) })
            )}
          </button>
        ) : null}
      </div>

      {error ? <p className="px-1 text-[11px] text-destructive">{error}</p> : null}

      <ul className="overflow-hidden rounded-[1.125rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
        {activeLinks.map((link, i) => (
          <ShareLinkRow
            key={link.id}
            link={link}
            locale={locale}
            expiresTemplate={p.myPlanShareLinkExpires}
            isLast={i === activeLinks.length - 1}
            selected={selectedIds.has(link.id)}
            disabled={revoking}
            onToggleSelect={() => toggleSelect(link.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function ShareLinkRow({
  link,
  locale,
  expiresTemplate,
  isLast,
  selected,
  disabled,
  onToggleSelect,
}: {
  link: ScheduleShareLinkListItem;
  locale: AppLocale;
  expiresTemplate: string;
  isLast: boolean;
  selected: boolean;
  disabled: boolean;
  onToggleSelect: () => void;
}) {
  const rangeStart = new Date(link.rangeStart);
  const rangeEnd = new Date(link.rangeEnd);
  const expiresAt = new Date(link.expiresAt);
  const rangeLabel = formatShareCreateRangeSummary(rangeStart, rangeEnd, locale);
  const expiresLabel = format(expiresAt, locale === "zh-CN" ? "M月d日" : "MMM d");

  return (
    <li className={cn(!isLast && "border-b border-border/50")}>
      <label
        className={cn(
          "flex min-h-[4rem] cursor-pointer items-center gap-3 px-4 py-3",
          selected && "bg-primary/[0.04]",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={onToggleSelect}
          className="h-4 w-4 shrink-0 rounded border-border text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/12 text-sky-700 dark:text-sky-300">
          <Link2 className="h-4 w-4" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-foreground">{rangeLabel}</span>
          <span className="mt-0.5 block text-[12px] text-muted-foreground">
            {formatMessage(expiresTemplate, { date: expiresLabel })}
          </span>
        </span>
      </label>
    </li>
  );
}
