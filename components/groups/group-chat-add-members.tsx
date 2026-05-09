"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";

import { AppPushLayer } from "@/components/ui/app-push-layer";
import { Button } from "@/components/ui/button";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { apiFetch } from "@/lib/auth/api-fetch";
import { GROUP_CHAT_MAX_MEMBERS } from "@/lib/group-chats/constants";
import type { DirectContactRow } from "@/lib/queries/direct-contacts";
import { cn } from "@/lib/utils";

export function GroupChatAddMembers({
  groupChatId,
  currentMemberIds,
  initialContacts,
}: {
  groupChatId: string;
  currentMemberIds: readonly string[];
  initialContacts: DirectContactRow[];
}) {
  const router = useRouter();
  const memberSet = useMemo(() => new Set(currentMemberIds), [currentMemberIds]);
  const eligible = useMemo(
    () => initialContacts.filter((c) => !memberSet.has(c.peerId)),
    [initialContacts, memberSet],
  );
  const remainingSlots = GROUP_CHAT_MAX_MEMBERS - currentMemberIds.length;
  const [open, setOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setSelectedIds([]);
      setError("");
    }
  }, [open]);

  const toggle = (peerId: string) => {
    setSelectedIds((current) => {
      if (current.includes(peerId)) {
        return current.filter((id) => id !== peerId);
      }
      if (current.length >= remainingSlots) {
        return current;
      }
      return [...current, peerId];
    });
  };

  const submit = async () => {
    if (submitting || selectedIds.length === 0) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/group-chats/${groupChatId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participantIds: selectedIds }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
      };
      if (!res.ok) {
        setError(typeof payload.error === "string" ? payload.error : "Could not add members.");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  if (remainingSlots <= 0) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Add members to group chat"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background text-foreground shadow-sm transition hover:bg-muted active:scale-[0.98]"
      >
        <Plus className="h-5 w-5" strokeWidth={2.25} />
      </button>

      <AppPushLayer
        open={open}
        onClose={() => setOpen(false)}
        zClassName="z-40"
        panelClassName="w-[min(100vw,28rem)] border-0"
        ariaLabelledBy="group-add-members-title"
      >
        <div className="flex h-full min-h-0 flex-col bg-background pt-[env(safe-area-inset-top)]">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border/60 px-4 py-3">
            <div className="min-w-0">
              <h2 id="group-add-members-title" className="text-[15px] font-semibold text-foreground">
                Add members
              </h2>
              <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
                Only your contacts can be added. You can add up to {remainingSlots} more
                {remainingSlots === 1 ? " person" : " people"}.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" strokeWidth={2.25} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 pt-3">
            {eligible.length === 0 ? (
              <p className="text-[13px] leading-relaxed text-muted-foreground">
                Everyone you can add is already in this group, or you have no contacts yet. Add people from
                Chats first, then invite them here.
              </p>
            ) : (
              <ul className="space-y-2">
                {eligible.map((contact) => {
                  const selected = selectedIds.includes(contact.peerId);
                  const atCap = selectedIds.length >= remainingSlots && !selected;
                  return (
                    <li key={contact.connectionId}>
                      <button
                        type="button"
                        disabled={atCap}
                        onClick={() => toggle(contact.peerId)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition",
                          selected
                            ? "border-primary/60 bg-primary/5"
                            : atCap
                              ? "cursor-not-allowed border-border/50 bg-muted/20 opacity-60"
                              : "border-border/70 bg-card/50 hover:bg-muted/30",
                        )}
                      >
                        <PresetAvatar id={contact.avatarUrl} size={44} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-semibold text-foreground">
                            {contact.nickname?.trim() || contact.username}
                          </p>
                          <p className="truncate text-[12px] text-muted-foreground">@{contact.username}</p>
                        </div>
                        <span
                          className={cn(
                            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border",
                            selected
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border bg-background text-transparent",
                          )}
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {error ? <p className="mt-3 text-[12px] text-destructive">{error}</p> : null}
          </div>

          {eligible.length > 0 ? (
            <div className="shrink-0 border-t border-border/60 px-4 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <Button
                type="button"
                className="h-11 w-full rounded-xl"
                disabled={submitting || selectedIds.length === 0}
                onClick={() => void submit()}
              >
                {submitting
                  ? "Adding…"
                  : selectedIds.length === 0
                    ? "Select contacts"
                    : `Add ${selectedIds.length}`}
              </Button>
            </div>
          ) : null}
        </div>
      </AppPushLayer>
    </>
  );
}
