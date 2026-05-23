"use client";

import { AtSign } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { apiFetch } from "@/lib/auth/api-fetch";
import { meSettingsRowListIconShellLargeClass } from "@/components/profile/me-settings-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

const cardClass =
  "rounded-2xl border border-classmates-edge bg-classmates-surface px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card";

function mapUsernameApiError(
  payload: { error?: string; code?: string } | null | undefined,
  errors: {
    invalidRequest: string;
    usernameTaken: string;
    unknown: string;
  },
): string {
  if (payload?.code === "USERNAME_TAKEN") return errors.usernameTaken;
  if (payload?.code === "INVALID_REQUEST") return errors.invalidRequest;
  return payload?.error?.trim() || errors.unknown;
}

export function LoginUsernameCard({
  currentUsername,
  variant = "page",
}: {
  currentUsername: string;
  variant?: "page" | "form";
}) {
  const { account } = useAppMessages();
  const t = account.loginUsername;
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const username = draft.trim().toLowerCase();
      if (!username) {
        setFeedback({ kind: "error", message: t.enterUsername });
        return;
      }
      setFeedback(null);
      try {
        const response = await apiFetch("/api/profile/username", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username }),
        });
        const payload = (await response.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
          code?: string;
        } | null;
        if (!response.ok || !payload?.success) {
          setFeedback({
            kind: "error",
            message: mapUsernameApiError(payload, t.errors),
          });
          return;
        }
        setFeedback({ kind: "success", message: t.errors.saved });
        setDraft("");
        router.refresh();
      } catch {
        setFeedback({ kind: "error", message: t.errors.networkError });
      }
    });

  const body = (
    <>
      <p className="text-[12px] leading-snug text-muted-foreground">{t.hint}</p>
      <div className="mt-4 space-y-1.5">
        <p className="text-[13px] font-medium text-foreground">{t.currentLabel}</p>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-foreground">{currentUsername}</p>
      </div>
      <div className="mt-4 space-y-1.5">
        <label className="text-[13px] font-medium text-foreground" htmlFor="login-username-new">
          {t.newLabel}
        </label>
        <Input
          id="login-username-new"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t.newPlaceholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="font-mono text-[15px]"
        />
      </div>
      {feedback ? (
        <p
          className={cn(
            "mt-3 text-[12px] leading-snug",
            feedback.kind === "success"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-destructive",
          )}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
      <Button
        type="button"
        className="mt-4 w-full"
        disabled={isPending}
        onClick={() => void save()}
      >
        {isPending ? t.saving : t.save}
      </Button>
    </>
  );

  if (variant === "form") {
    return <div className={cardClass}>{body}</div>;
  }

  return (
    <div className={cardClass}>
      <div className="mb-3 flex items-center gap-3">
        <span className={meSettingsRowListIconShellLargeClass}>
          <AtSign className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <h2 className="text-[15px] font-semibold text-foreground">{t.title}</h2>
      </div>
      {body}
    </div>
  );
}
