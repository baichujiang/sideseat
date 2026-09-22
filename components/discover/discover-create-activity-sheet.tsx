"use client";

import type { Route } from "next";
import { useEffect, useState, type ReactNode } from "react";
import { CalendarDays, Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/auth/api-fetch";
import { useAppMessages } from "@/hooks/use-app-locale";
import { DISCOVER_ACTIVITY_DESCRIPTION_MAX } from "@/lib/constants/discover-activity";

export function DiscoverCreateActivitySheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const m = useAppMessages();
  const da = m.discoverActivity;
  const common = m.common;
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [when, setWhen] = useState("");
  const [where, setWhere] = useState("");
  const [unlimitedCapacity, setUnlimitedCapacity] = useState(true);
  const [capacity, setCapacity] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setDescription("");
    setWhen("");
    setWhere("");
    setUnlimitedCapacity(true);
    setCapacity("");
    setSubmitting(false);
    setError(null);
  }, [open]);

  async function submit() {
    if (submitting) return;
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const trimmedWhere = where.trim();
    if (!trimmedTitle || !trimmedDescription || !when || !trimmedWhere) {
      setError(da.formIncomplete);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const startAt = new Date(when);
      const res = await apiFetch("/api/discover-activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: trimmedTitle,
          description: trimmedDescription,
          startAt: startAt.toISOString(),
          location: trimmedWhere,
          unlimitedCapacity,
          capacity: unlimitedCapacity ? undefined : Number(capacity),
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        const code = payload?.code;
        const msg =
          code && code in da.errors
            ? da.errors[code as keyof typeof da.errors]
            : payload?.error || da.createFailed;
        throw new Error(msg);
      }
      const activityId = payload.data?.activity?.id as string | undefined;
      onClose();
      if (activityId) {
        router.push(`/discover/activities/${activityId}` as Route);
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : da.createFailed);
      setSubmitting(false);
    }
  }

  const canSubmit = Boolean(title.trim() && description.trim() && when && where.trim());

  return (
    <AppPushLayer
      open={open}
      onClose={onClose}
      zClassName="z-40"
      panelClassName="w-[min(100vw,28rem)] border-0 bg-background shadow-none dark:shadow-none"
    >
      <div className="flex h-full min-h-0 flex-col px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="mx-auto mb-3 h-1.5 w-12 shrink-0 rounded-full bg-border/80" />
        <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-foreground">{da.sheetTitle}</h3>
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{da.sheetSubtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label={common.close}
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <FieldGroup label={da.titleLabel}>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={da.titlePlaceholder}
              maxLength={120}
              className="h-11 rounded-xl border-border/70 text-[14px]"
            />
          </FieldGroup>

          <FieldGroup label={da.descriptionLabel}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={da.descriptionPlaceholder}
              maxLength={DISCOVER_ACTIVITY_DESCRIPTION_MAX}
              className="min-h-24 w-full resize-none rounded-xl border border-input bg-background px-3 py-2.5 text-[14px] text-foreground outline-none transition placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </FieldGroup>

          <FieldGroup label={da.whenLabel}>
            <Input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="h-11 rounded-xl border-border/70 text-[14px]"
            />
          </FieldGroup>

          <FieldGroup label={da.whereLabel}>
            <Input
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              placeholder={da.wherePlaceholder}
              maxLength={120}
              className="h-11 rounded-xl border-border/70 text-[14px]"
            />
          </FieldGroup>

          <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-medium text-muted-foreground">{da.capacityLabel}</p>
              <label className="flex items-center gap-2 text-[12px] text-foreground">
                <input
                  type="checkbox"
                  checked={unlimitedCapacity}
                  onChange={(e) => setUnlimitedCapacity(e.target.checked)}
                  className="rounded border-border"
                />
                {da.capacityUnlimitedToggle}
              </label>
            </div>
            {!unlimitedCapacity ? (
              <Input
                type="number"
                min={2}
                max={50}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder={da.capacityPlaceholder}
                className="h-11 rounded-xl border-border/70 text-[14px]"
              />
            ) : null}
          </div>

          {error ? <p className="text-[12px] text-destructive">{error}</p> : null}
        </div>

        <div className="mt-4 flex shrink-0 gap-2">
          <Button
            type="button"
            variant="ghost"
            className="h-11 flex-1 rounded-xl transition active:scale-[0.98]"
            onClick={onClose}
          >
            {common.cancel}
          </Button>
          <Button
            type="button"
            className="h-11 flex-1 rounded-xl transition active:scale-[0.98]"
            onClick={() => void submit()}
            disabled={submitting || !canSubmit}
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                {da.submitBusy}
              </>
            ) : (
              <>
                <CalendarDays className="mr-1.5 h-4 w-4" />
                {da.submitButton}
              </>
            )}
          </Button>
        </div>
      </div>
    </AppPushLayer>
  );
}

function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card/50 px-3 py-2.5">
      <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
