"use client";

import Link from "next/link";
import { KeyRound } from "lucide-react";
import { useState, useTransition } from "react";

import { apiFetch } from "@/lib/auth/api-fetch";
import { mapPasswordChangeApiError } from "@/lib/auth/map-password-change-errors";
import { meSettingsRowListIconShellLargeClass } from "@/components/profile/me-settings-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

const cardClass =
  "rounded-2xl border border-classmates-edge bg-classmates-surface px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card";

export function ChangePasswordCard({ variant = "page" }: { variant?: "page" | "form" }) {
  const { account } = useAppMessages();
  const t = account.changePassword;
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      if (!currentPassword) {
        setFeedback({ kind: "error", message: t.enterCurrent });
        return;
      }
      if (password.length < 8) {
        setFeedback({ kind: "error", message: t.passwordTooShort });
        return;
      }
      if (password !== confirmPassword) {
        setFeedback({ kind: "error", message: t.passwordsMismatch });
        return;
      }
      if (currentPassword === password) {
        setFeedback({ kind: "error", message: t.errors.sameAsCurrent });
        return;
      }

      setFeedback(null);
      try {
        const response = await apiFetch("/api/profile/password", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword, password, confirmPassword }),
        });
        const payload = (await response.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
          code?: string;
        } | null;
        if (!response.ok || !payload?.success) {
          setFeedback({
            kind: "error",
            message: mapPasswordChangeApiError(payload, t.errors),
          });
          return;
        }
        setCurrentPassword("");
        setPassword("");
        setConfirmPassword("");
        setFeedback({ kind: "success", message: t.errors.saved });
      } catch {
        setFeedback({ kind: "error", message: t.errors.networkError });
      }
    });

  return (
    <div className={cn(cardClass, "space-y-4")}>
      {variant === "page" ? (
        <div className="flex items-start gap-3">
          <span className={meSettingsRowListIconShellLargeClass}>
            <KeyRound className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[15px] font-semibold leading-tight text-classmates-ink dark:text-foreground">
              {t.title}
            </p>
            <p className="text-[12px] leading-snug text-classmates-sub dark:text-zinc-400">{t.hint}</p>
          </div>
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-foreground" htmlFor="change-password-current">
            {t.currentLabel}
          </label>
          <Input
            id="change-password-current"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-foreground" htmlFor="change-password-new">
            {t.newLabel}
          </label>
          <Input
            id="change-password-new"
            type="password"
            autoComplete="new-password"
            placeholder={t.newPlaceholder}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-foreground" htmlFor="change-password-confirm">
            {t.confirmLabel}
          </label>
          <Input
            id="change-password-confirm"
            type="password"
            autoComplete="new-password"
            placeholder={t.confirmPlaceholder}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>

        {feedback ? (
          <p
            className={cn(
              "text-[12px] leading-snug",
              feedback.kind === "success"
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-destructive",
            )}
            role={feedback.kind === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        ) : null}

        <Button className="w-full" type="button" disabled={isPending} onClick={() => void save()}>
          {isPending ? t.saving : t.save}
        </Button>

        <p className="text-center text-[12px] text-muted-foreground">
          <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/forgot-password">
            {t.forgotLink}
          </Link>
        </p>
      </div>
    </div>
  );
}
