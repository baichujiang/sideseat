"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { Check, Link2, Loader2, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { CalendarCategoryColorPopover } from "@/components/home/calendar-category-color-popover";
import { AppPushLayer } from "@/components/ui/app-push-layer";
import { normalizeCalendarCategoryHex } from "@/lib/calendar/calendar-category-colors";
import { formatMessage } from "@/lib/i18n/messages";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

export type CalendarCategoryRow = {
  id: string;
  name: string;
  color: string;
  presetKey: string | null;
  icsSubscriptionUrl: string | null;
};

export function ScheduleCalendarCategoryManager({
  categories,
  open,
  onClose,
}: {
  categories: CalendarCategoryRow[];
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { schedule: s, common } = useAppMessages();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#64748B");
  const [showNewRow, setShowNewRow] = useState(false);
  const [showSubscriptionRow, setShowSubscriptionRow] = useState(false);
  const [subName, setSubName] = useState("");
  const [subColor, setSubColor] = useState("#64748B");
  const [subUrl, setSubUrl] = useState("");
  const newNameRef = useRef<HTMLInputElement>(null);
  const subNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setNewName("");
    setNewColor("#64748B");
    setBusyId(null);
    setAdding(false);
    setShowNewRow(false);
    setShowSubscriptionRow(false);
    setSubName("");
    setSubColor("#64748B");
    setSubUrl("");
  }, [open]);

  useEffect(() => {
    if (showNewRow) newNameRef.current?.focus();
  }, [showNewRow]);

  useEffect(() => {
    if (showSubscriptionRow) subNameRef.current?.focus();
  }, [showSubscriptionRow]);

  async function patchRow(id: string, body: { name?: string; color?: string }) {
    setBusyId(id);
    const res = await apiFetch(`/api/calendar/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (!res.ok) {
      const t = await res.text();
      window.alert(t.trim().slice(0, 200) || s.calendarsUpdateFailed);
      return;
    }
    router.refresh();
  }

  async function patchSubscriptionUrl(id: string, icsSubscriptionUrl: string | null) {
    setBusyId(id);
    const res = await apiFetch(`/api/calendar/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icsSubscriptionUrl }),
    });
    setBusyId(null);
    if (!res.ok) {
      const t = await res.text();
      window.alert(t.trim().slice(0, 200) || s.calendarsUpdateFeedFailed);
      return;
    }
    router.refresh();
  }

  async function removeRow(id: string) {
    if (!window.confirm(s.calendarsDeleteConfirm)) return;
    setBusyId(id);
    const res = await apiFetch(`/api/calendar/categories/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const t = await res.text();
      window.alert(t.trim().slice(0, 200) || s.calendarsDeleteFailed);
      return;
    }
    router.refresh();
  }

  async function addRow() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    const res = await apiFetch("/api/calendar/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color: normalizeCalendarCategoryHex(newColor) }),
    });
    setAdding(false);
    if (!res.ok) {
      const t = await res.text();
      window.alert(t.trim().slice(0, 200) || s.calendarsAddFailed);
      return;
    }
    setNewName("");
    setNewColor("#64748B");
    setShowNewRow(false);
    router.refresh();
  }

  async function addSubscriptionRow() {
    const name = subName.trim();
    const url = subUrl.trim();
    if (!name || !url) return;
    setAdding(true);
    const res = await apiFetch("/api/calendar/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        color: normalizeCalendarCategoryHex(subColor),
        icsSubscriptionUrl: url,
      }),
    });
    setAdding(false);
    if (!res.ok) {
      const t = await res.text();
      window.alert(t.trim().slice(0, 200) || s.calendarsAddSubscriptionFailed);
      return;
    }
    setSubName("");
    setSubColor("#64748B");
    setSubUrl("");
    setShowSubscriptionRow(false);
    router.refresh();
  }

  return (
    <AppPushLayer
      open={open}
      onClose={onClose}
      zClassName="z-50"
      panelClassName="w-[min(100vw,28rem)] border-0 bg-card shadow-none dark:shadow-none"
    >
      <section className="flex h-full min-h-0 flex-col overflow-hidden px-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-[max(0.25rem,env(safe-area-inset-top))]">
        <div className="flex justify-center pt-1">
          <span className="h-1 w-10 rounded-full bg-muted-foreground/20" />
        </div>
        <div className="flex items-center justify-between gap-2 border-b border-border/50 px-3 pb-2 pt-1">
          <h2 className="text-[15px] font-semibold leading-tight text-foreground">{s.calendarsSheetTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={common.close}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-0.5 py-1">
          <div className="divide-y divide-border/40">
            {categories.map((row) => (
              <CompactCategoryRow
                key={row.id}
                row={row}
                busy={busyId === row.id}
                onPatch={(body) => void patchRow(row.id, body)}
                onPatchSubscriptionUrl={(url) => void patchSubscriptionUrl(row.id, url)}
                onDelete={row.presetKey ? undefined : () => void removeRow(row.id)}
              />
            ))}
          </div>

          {showSubscriptionRow ? (
            <div className="mt-1 space-y-1.5 rounded-lg border border-border/60 bg-muted/10 px-2 py-1.5">
              <p className="px-0.5 text-[12px] font-medium leading-tight text-muted-foreground">
                {s.calendarsSubscriptionSection}
              </p>
              <div className="flex items-center gap-2">
                <CalendarCategoryColorPopover
                  value={subColor}
                  onChange={setSubColor}
                  disabled={adding}
                  ariaLabel={s.calendarsPickSubscriptionColorAria}
                  triggerClassName="min-h-10 min-w-10 -ml-0.5"
                />
                <input
                  ref={subNameRef}
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  placeholder={s.calendarsNamePlaceholder}
                  className="min-w-0 flex-1 rounded-lg border border-border/50 bg-background px-2 py-1 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
                />
              </div>
              <input
                value={subUrl}
                onChange={(e) => setSubUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addSubscriptionRow();
                  if (e.key === "Escape") setShowSubscriptionRow(false);
                }}
                placeholder={s.calendarsSubscriptionUrlPlaceholder}
                className="w-full rounded-lg border border-border/50 bg-background px-2 py-1 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
                autoComplete="off"
                spellCheck={false}
              />
              <div className="flex items-center justify-end gap-0.5">
                <button
                  type="button"
                  disabled={adding || !subName.trim() || !subUrl.trim()}
                  onClick={() => void addSubscriptionRow()}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-primary transition hover:bg-primary/10 disabled:opacity-40"
                  aria-label={s.calendarsSaveSubscriptionAria}
                >
                  {adding ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowSubscriptionRow(false)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted"
                  aria-label={common.cancel}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.25} />
                </button>
              </div>
            </div>
          ) : showNewRow ? (
            <div className="mt-1 flex items-center gap-1.5 rounded-lg border border-border/60 bg-muted/10 px-2 py-1">
              <CalendarCategoryColorPopover
                value={newColor}
                onChange={setNewColor}
                disabled={adding}
                ariaLabel={s.calendarsPickNewColorAria}
                triggerClassName="min-h-10 min-w-10 -ml-0.5"
              />
              <input
                ref={newNameRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addRow();
                  if (e.key === "Escape") setShowNewRow(false);
                }}
                placeholder={s.calendarsNamePlaceholder}
                className="min-w-0 flex-1 border-0 bg-transparent py-0.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
              />
              <button
                type="button"
                disabled={adding || !newName.trim()}
                onClick={() => void addRow()}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-primary transition hover:bg-primary/10 disabled:opacity-40"
                aria-label={s.calendarsSaveAria}
              >
                {adding ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" strokeWidth={2.5} />
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowNewRow(false)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted"
                aria-label={common.cancel}
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
            </div>
          ) : (
            <div className="mt-1 flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => {
                  setShowSubscriptionRow(false);
                  setShowNewRow(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-muted-foreground transition hover:bg-muted/50"
              >
                <Plus className="h-4 w-4" strokeWidth={2} />
                {s.calendarsNew}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewRow(false);
                  setShowSubscriptionRow(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-muted-foreground transition hover:bg-muted/50"
              >
                <Link2 className="h-4 w-4" strokeWidth={2} />
                {s.calendarsAddSubscription}
              </button>
            </div>
          )}
        </div>
      </section>
    </AppPushLayer>
  );
}

function CompactCategoryRow({
  row,
  busy,
  onPatch,
  onPatchSubscriptionUrl,
  onDelete,
}: {
  row: CalendarCategoryRow;
  busy: boolean;
  onPatch: (body: { name?: string; color?: string }) => void;
  onPatchSubscriptionUrl: (url: string | null) => void;
  onDelete?: () => void;
}) {
  const { schedule: s, common } = useAppMessages();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const [urlDraft, setUrlDraft] = useState(row.icsSubscriptionUrl ?? "");
  const [feedExpanded, setFeedExpanded] = useState(false);

  useEffect(() => {
    setName(row.name);
  }, [row.name]);

  useEffect(() => {
    setUrlDraft(row.icsSubscriptionUrl ?? "");
  }, [row.icsSubscriptionUrl]);

  useEffect(() => {
    if (row.icsSubscriptionUrl) setFeedExpanded(true);
  }, [row.icsSubscriptionUrl]);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commitName() {
    setEditing(false);
    const trimmed = name.trim();
    if (!trimmed) {
      setName(row.name);
      return;
    }
    if (trimmed !== row.name) onPatch({ name: trimmed });
  }

  function commitUrl() {
    const trimmed = urlDraft.trim();
    const next = trimmed ? trimmed : null;
    const prev = row.icsSubscriptionUrl;
    if (next === prev) return;
    onPatchSubscriptionUrl(next);
  }

  const canEditFeed = !row.presetKey;

  return (
    <div className="px-2 py-1">
      <div className="flex items-center gap-2">
        <CalendarCategoryColorPopover
          value={row.color}
          onChange={(hex) => onPatch({ color: normalizeCalendarCategoryHex(hex) })}
          disabled={busy}
          ariaLabel={formatMessage(s.calendarsColorForAria, { name: row.name })}
          triggerClassName={cn("min-h-10 min-w-10 -ml-0.5", busy && "pointer-events-none opacity-50")}
        />

        {editing ? (
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitName();
              if (e.key === "Escape") {
                setName(row.name);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 border-0 bg-transparent py-0.5 text-[13px] font-medium text-foreground outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={busy}
            className="min-w-0 flex-1 truncate py-0.5 text-left text-[13px] font-medium text-foreground disabled:opacity-60"
          >
            {row.name}
          </button>
        )}

        {busy ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label={common.delete}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 transition hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        ) : null}
      </div>

      {canEditFeed ? (
        <div className="mt-1 pl-10">
          {row.icsSubscriptionUrl !== null || feedExpanded ? (
            <input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              onBlur={commitUrl}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              placeholder={s.calendarsFeedUrlOptionalPlaceholder}
              disabled={busy}
              className="w-full rounded-md border border-border/40 bg-muted/20 px-2 py-0.5 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/55 disabled:opacity-50"
              autoComplete="off"
              spellCheck={false}
            />
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setFeedExpanded(true)}
              className="text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
            >
              {s.calendarsAddSubscriptionUrl}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
