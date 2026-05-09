"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/auth/api-fetch";
import { GROUP_CHAT_TITLE_MAX_LEN } from "@/lib/validators/chat-directory";

export function GroupChatTitleEditor({
  groupChatId,
  storedTitle,
  autoTitle,
}: {
  groupChatId: string;
  storedTitle: string | null;
  /** Shown as placeholder — the name derived from members when there is no custom title. */
  autoTitle: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(storedTitle ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setValue(storedTitle ?? "");
  }, [storedTitle]);

  const normalizedInitial = (storedTitle ?? "").trim();
  const dirty = value.trim() !== normalizedInitial;

  const save = async () => {
    setError("");
    setSaving(true);
    try {
      const res = await apiFetch(`/api/group-chats/${groupChatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: value.trim() }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Could not save.");
        return;
      }
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/60 bg-card px-3 py-3">
      <p className="mb-2 text-sm font-medium text-foreground">Group chat name</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, GROUP_CHAT_TITLE_MAX_LEN))}
          maxLength={GROUP_CHAT_TITLE_MAX_LEN}
          placeholder={autoTitle}
          aria-label="Group chat name"
          className="min-w-0 flex-1"
        />
        <Button
          type="button"
          className="shrink-0 sm:w-auto"
          disabled={saving || !dirty}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
