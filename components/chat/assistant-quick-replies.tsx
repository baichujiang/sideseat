"use client";

import { apiFetch } from "@/lib/auth/api-fetch";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { AssistantFaqKey } from "@/lib/assistant/faq-keys";
import { buildFaqTrigger } from "@/lib/assistant/faq-keys";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

const CHIP_KEYS: AssistantFaqKey[] = [
  "getting_started",
  "discover",
  "verification",
  "guest_signup",
  "schedule",
  "inbox",
];

export function AssistantQuickReplies({
  connectionId,
  className,
}: {
  connectionId: string;
  className?: string;
}) {
  const { assistant: a } = useAppMessages();
  const router = useRouter();
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const chipLabel: Record<AssistantFaqKey, string> = {
    getting_started: a.chips.gettingStarted,
    discover: a.chips.discover,
    verification: a.chips.verification,
    guest_signup: a.chips.guestSignup,
    schedule: a.chips.schedule,
    inbox: a.chips.inbox,
  };

  const sendFaq = (key: AssistantFaqKey) =>
    startTransition(async () => {
      setError("");
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
    });

  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {a.chipsAria}
      </p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={a.chipsAria}>
        {CHIP_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            disabled={isPending}
            onClick={() => sendFaq(key)}
            className="rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-foreground transition hover:bg-muted disabled:opacity-50 dark:border-border"
          >
            {chipLabel[key]}
          </button>
        ))}
      </div>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  );
}
