"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AppPushLayer } from "@/components/ui/app-push-layer";
import { cn } from "@/lib/utils";

export type CalendarCategoryRow = {
  id: string;
  name: string;
  color: string;
  presetKey: string | null;
};

function normalizeHex(color: string): string {
  const t = color.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(t)) return t;
  return "#64748B";
}

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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#64748B");
  const [showNewRow, setShowNewRow] = useState(false);
  const newNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setNewName("");
    setNewColor("#64748B");
    setBusyId(null);
    setAdding(false);
    setShowNewRow(false);
  }, [open]);

  useEffect(() => {
    if (showNewRow) newNameRef.current?.focus();
  }, [showNewRow]);

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
      window.alert(t.trim().slice(0, 200) || "Could not update.");
      return;
    }
    router.refresh();
  }

  async function removeRow(id: string) {
    if (!window.confirm("Delete this category? Events using it will become uncategorized.")) return;
    setBusyId(id);
    const res = await apiFetch(`/api/calendar/categories/${id}`, { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      const t = await res.text();
      window.alert(t.trim().slice(0, 200) || "Could not delete.");
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
      body: JSON.stringify({ name, color: normalizeHex(newColor) }),
    });
    setAdding(false);
    if (!res.ok) {
      const t = await res.text();
      window.alert(t.trim().slice(0, 200) || "Could not add.");
      return;
    }
    setNewName("");
    setNewColor("#64748B");
    setShowNewRow(false);
    router.refresh();
  }

  return (
    <AppPushLayer
      open={open}
      onClose={onClose}
      zClassName="z-50"
      panelClassName="w-[min(100vw,28rem)] border-0 bg-card shadow-none dark:shadow-none"
    >
      <section className="flex h-full min-h-0 flex-col overflow-hidden px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-muted-foreground/20" />
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 pb-3 pt-2">
          <h2 className="text-[15px] font-semibold text-foreground">Categories</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-1 py-2">
          <div className="divide-y divide-border/40">
            {categories.map((row) => (
              <CompactCategoryRow
                key={row.id}
                row={row}
                busy={busyId === row.id}
                onPatch={(body) => void patchRow(row.id, body)}
                onDelete={row.presetKey ? undefined : () => void removeRow(row.id)}
              />
            ))}
          </div>

          {showNewRow ? (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-border/60 bg-muted/10 px-2 py-1.5">
              <label className="relative flex shrink-0 cursor-pointer items-center">
                <input
                  type="color"
                  value={normalizeHex(newColor)}
                  onChange={(e) => setNewColor(normalizeHex(e.target.value))}
                  className="absolute inset-0 cursor-pointer opacity-0"
                  aria-label="Pick color"
                />
                <span
                  className="block h-5 w-5 rounded-full border border-black/10 shadow-sm dark:border-white/15"
                  style={{ backgroundColor: normalizeHex(newColor) }}
                />
              </label>
              <input
                ref={newNameRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addRow();
                  if (e.key === "Escape") setShowNewRow(false);
                }}
                placeholder="Category name"
                className="min-w-0 flex-1 border-0 bg-transparent py-0.5 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/60"
              />
              <button
                type="button"
                disabled={adding || !newName.trim()}
                onClick={() => void addRow()}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-primary transition hover:bg-primary/10 disabled:opacity-40"
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
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.25} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNewRow(true)}
              className="mt-2 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-muted-foreground transition hover:bg-muted/50"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              New category
            </button>
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
  onDelete,
}: {
  row: CalendarCategoryRow;
  busy: boolean;
  onPatch: (body: { name?: string; color?: string }) => void;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(row.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(row.name);
  }, [row.name]);

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

  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <label className="relative flex shrink-0 cursor-pointer items-center">
        <input
          type="color"
          value={normalizeHex(row.color)}
          disabled={busy}
          onChange={(e) => onPatch({ color: normalizeHex(e.target.value) })}
          className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-default"
          aria-label={`Color for ${row.name}`}
        />
        <span
          className={cn(
            "block h-5 w-5 rounded-full border border-black/10 shadow-sm transition dark:border-white/15",
            busy && "opacity-50",
          )}
          style={{ backgroundColor: normalizeHex(row.color) }}
        />
      </label>

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
          aria-label="Delete"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/50 transition hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      ) : null}
    </div>
  );
}
