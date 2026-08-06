"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import type { AssistantFaqKey } from "@/lib/assistant/faq-keys";
import { buildFaqTrigger } from "@/lib/assistant/faq-keys";
import {
  ASSISTANT_CHIP_GROUP,
  primarySuggestedFaqChips,
  suggestedFaqChips,
  type AssistantChipGroupId,
} from "@/lib/assistant/suggested-chips";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

export function AssistantQuickReplies({
  connectionId,
  className,
  surface = "composer",
  isGuest = false,
  verifiedStudent = false,
  compact = true,
  onPendingChange,
}: {
  connectionId: string;
  className?: string;
  surface?: "composer" | "bubble";
  isGuest?: boolean;
  verifiedStudent?: boolean;
  /** Show top contextual chips; false shows the full ordered set. */
  compact?: boolean;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { assistant: a } = useAppMessages();
  const router = useRouter();
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [showAll, setShowAll] = useState(!compact);
  const [, startTransition] = useTransition();

  const chipLabel: Record<AssistantFaqKey, string> = {
    getting_started: a.chips.gettingStarted,
    discover: a.chips.discover,
    verification: a.chips.verification,
    guest_signup: a.chips.guestSignup,
    schedule: a.chips.schedule,
    inbox: a.chips.inbox,
  };

  const groupLabel: Record<AssistantChipGroupId, string> = {
    start: a.chipGroups.start,
    schedule: a.chipGroups.schedule,
    social: a.chipGroups.social,
    account: a.chipGroups.account,
  };

  const viewer = useMemo(
    () => ({ isGuest, verifiedStudent }),
    [isGuest, verifiedStudent],
  );

  const keys = useMemo(() => {
    const ordered = suggestedFaqChips(viewer);
    if (!compact || showAll) return ordered;
    return primarySuggestedFaqChips(viewer);
  }, [compact, showAll, viewer]);

  const sendFaq = (key: AssistantFaqKey) => {
    if (sending) return;
    startTransition(() => {
      void (async () => {
        setError("");
        setSending(true);
        onPendingChange?.(true);
        try {
          const response = await apiFetch(`/api/connections/${connectionId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: buildFaqTrigger(key) }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            setError(typeof payload.error === "string" ? payload.error : "Unable to send.");
            return;
          }
          router.refresh();
        } finally {
          setSending(false);
          onPendingChange?.(false);
        }
      })();
    });
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {a.chipsAria}
        </p>
        {compact && !showAll ? (
          <button
            type="button"
            className="text-[10px] font-medium text-rose-600 hover:text-rose-700 dark:text-rose-400"
            onClick={() => setShowAll(true)}
          >
            {a.chipsMore}
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={a.chipsAria}>
        {keys.map((key) => (
          <button
            key={key}
            type="button"
            disabled={sending}
            onClick={() => sendFaq(key)}
            title={groupLabel[ASSISTANT_CHIP_GROUP[key]]}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-50",
              surface === "bubble"
                ? "border-border/80 bg-background/90 text-foreground shadow-sm hover:bg-background dark:border-border dark:bg-card/80 dark:hover:bg-card"
                : "border-rose-200/70 bg-rose-50/80 text-rose-900 hover:bg-rose-100/90 dark:border-rose-500/30 dark:bg-rose-950/35 dark:text-rose-100 dark:hover:bg-rose-950/55",
            )}
          >
            {chipLabel[key]}
          </button>
        ))}
      </div>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
