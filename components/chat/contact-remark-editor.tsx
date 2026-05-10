"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, Pencil, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/auth/api-fetch";
import { CONTACT_REMARK_MAX_LEN } from "@/lib/connections/contact-remark";

const REMARK_PLACEHOLDER = "Private name or note";

export function ContactRemarkEditor({
  connectionId,
  initialRemark,
  isSelfNotes,
  variant = "profile",
}: {
  connectionId: string;
  initialRemark: string | null;
  /** Self-DM: optional custom title; default is your nickname + (self). */
  isSelfNotes?: boolean;
  /**
   * `profile` — one quiet row for user profile (default).
   * `minimal` — single row for Notes-to-self in chat (no profile to open).
   * `inline` — compact inline edit button + input for chat header.
   * `underName` — Me /profile summary: no section label, sits under display name.
   */
  variant?: "profile" | "minimal" | "inline" | "underName";
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialRemark ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [inlineEditing, setInlineEditing] = useState(false);

  useEffect(() => {
    setValue(initialRemark ?? "");
  }, [initialRemark]);

  const dirty = value.trim() !== (initialRemark ?? "").trim();

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const res = await apiFetch(`/api/connections/${connectionId}/contact-remark`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remark: value.trim() === "" ? null : value.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Could not save.");
        return;
      }
      setInlineEditing(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  if (variant === "minimal") {
    return (
      <div className="border-b border-border/60 bg-muted/15">
        <div className="flex items-center gap-2 px-3 py-1.5">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, CONTACT_REMARK_MAX_LEN))}
            maxLength={CONTACT_REMARK_MAX_LEN}
            placeholder={REMARK_PLACEHOLDER}
            aria-label={REMARK_PLACEHOLDER}
            className="h-8 min-w-0 flex-1 border-0 bg-transparent px-0 text-[13px] shadow-none focus-visible:ring-0"
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 px-2 text-[12px]"
            disabled={saving || !dirty}
            onClick={() => void save()}
          >
            {saving ? "…" : "Save"}
          </Button>
        </div>
        {error ? <p className="px-3 pb-1 text-[10px] text-destructive">{error}</p> : null}
      </div>
    );
  }

  if (variant === "underName") {
    return (
      <div className="w-full min-w-0">
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value.slice(0, CONTACT_REMARK_MAX_LEN))}
            maxLength={CONTACT_REMARK_MAX_LEN}
            placeholder={REMARK_PLACEHOLDER}
            aria-label={REMARK_PLACEHOLDER}
            className="h-8 min-w-0 flex-1 border-classmates-edge/80 bg-background/70 text-[13px] shadow-none dark:border-border dark:bg-background/50"
          />
          <Button
            type="button"
            size="sm"
            className="h-8 shrink-0 px-3 text-[12px]"
            disabled={saving || !dirty}
            onClick={() => void save()}
          >
            {saving ? "…" : "Save"}
          </Button>
        </div>
        {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
      </div>
    );
  }

  if (variant === "inline") {
    if (!inlineEditing) {
      return (
        <button
          type="button"
          onClick={() => {
            setError("");
            setInlineEditing(true);
          }}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
          aria-label={REMARK_PLACEHOLDER}
          title={REMARK_PLACEHOLDER}
        >
          <Pencil className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      );
    }

    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, CONTACT_REMARK_MAX_LEN))}
          maxLength={CONTACT_REMARK_MAX_LEN}
          placeholder={REMARK_PLACEHOLDER}
          className="h-7 w-28 rounded-full px-2.5 text-[11px]"
        />
        <button
          type="button"
          disabled={saving || !dirty}
          onClick={() => void save()}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-35"
          aria-label="Save"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setValue(initialRemark ?? "");
            setError("");
            setInlineEditing(false);
          }}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted disabled:opacity-40"
          aria-label="Cancel"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        {error ? <p className="sr-only">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, CONTACT_REMARK_MAX_LEN))}
          maxLength={CONTACT_REMARK_MAX_LEN}
          placeholder={REMARK_PLACEHOLDER}
          aria-label={REMARK_PLACEHOLDER}
          className="h-9 min-w-0 flex-1 text-[13px]"
        />
        <Button
          type="button"
          size="sm"
          className="h-9 shrink-0 px-3 text-[12px]"
          disabled={saving || !dirty}
          onClick={() => void save()}
        >
          {saving ? "…" : "Save"}
        </Button>
      </div>
      {error ? <p className="mt-1 text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
