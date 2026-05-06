"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { Loader2, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

  useEffect(() => {
    if (!open) return;
    setNewName("");
    setNewColor("#64748B");
    setBusyId(null);
    setAdding(false);
  }, [open]);

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
    if (
      !window.confirm(
        "Delete this category? Events using it will become uncategorized.",
      )
    )
      return;
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
    router.refresh();
  }

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close category manager"
        className="fixed inset-0 z-40 bg-foreground/12 backdrop-blur-[1px]"
        onClick={onClose}
      />

      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
        <section className="flex max-h-[min(78vh,36rem)] flex-col overflow-hidden rounded-[2rem] border border-border/60 bg-card shadow-[0_-8px_40px_-18px_rgba(15,23,42,0.28)]">
          <div className="flex justify-center pt-2">
            <span className="h-1 w-10 rounded-full bg-muted-foreground/20" />
          </div>
          <div className="flex items-center justify-between gap-3 border-b border-border/50 px-4 pb-3 pt-2">
            <div>
              <h2 className="text-[16px] font-semibold text-foreground">Calendar categories</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Built-in lists can be renamed or recolored; custom lists can be deleted.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {categories.map((row) => (
              <CategoryEditorRow
                key={row.id}
                row={row}
                busy={busyId === row.id}
                onPatch={(body) => void patchRow(row.id, body)}
                onDelete={row.presetKey ? undefined : () => void removeRow(row.id)}
              />
            ))}

            <div className="rounded-2xl border border-border/70 bg-muted/[0.06] p-3">
              <p className="mb-2 text-[12px] font-medium text-muted-foreground">New category</p>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name"
                  className="h-10 min-w-[8rem] flex-1 rounded-xl border-border/70 bg-background"
                />
                <label className="flex h-10 cursor-pointer items-center gap-2 rounded-xl border border-border/70 bg-background px-2 text-[12px] text-muted-foreground">
                  <input
                    type="color"
                    value={normalizeHex(newColor)}
                    onChange={(e) => setNewColor(normalizeHex(e.target.value))}
                    className="h-8 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
                    aria-label="Color"
                  />
                  Color
                </label>
                <Button
                  type="button"
                  size="sm"
                  className="h-10 shrink-0 rounded-xl"
                  disabled={adding || !newName.trim()}
                  onClick={() => void addRow()}
                >
                  {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function CategoryEditorRow({
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
  const [name, setName] = useState(row.name);
  const [color, setColor] = useState(row.color);

  useEffect(() => {
    setName(row.name);
    setColor(row.color);
  }, [row.id, row.name, row.color]);

  const dirty = name.trim() !== row.name || normalizeHex(color) !== row.color;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-muted/[0.04] p-2.5",
        row.presetKey && "border-dashed",
      )}
    >
      <label className="flex cursor-pointer items-center">
        <input
          type="color"
          value={normalizeHex(color)}
          disabled={busy}
          onChange={(e) => setColor(normalizeHex(e.target.value))}
          className="h-9 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0 disabled:opacity-50"
          aria-label={`Color for ${row.name}`}
        />
      </label>
      <Input
        value={name}
        disabled={busy}
        onChange={(e) => setName(e.target.value)}
        className="h-9 min-w-[6rem] flex-1 rounded-xl border-border/70 bg-background text-[13px]"
      />
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="h-9 shrink-0 rounded-xl"
        disabled={busy || !dirty || !name.trim()}
        onClick={() =>
          onPatch({
            ...(name.trim() !== row.name ? { name: name.trim() } : {}),
            ...(normalizeHex(color) !== row.color ? { color: normalizeHex(color) } : {}),
          })
        }
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
      </Button>
      {onDelete ? (
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          aria-label="Delete category"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-destructive/30 text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" strokeWidth={2.25} />
        </button>
      ) : null}
    </div>
  );
}
