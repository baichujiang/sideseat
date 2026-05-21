"use client";

import { Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { apiFetch } from "@/lib/auth/api-fetch";
import { mapLoginEmailApiError } from "@/lib/auth/map-login-email-errors";
import { meSettingsRowListIconShellLargeClass } from "@/components/profile/me-settings-row";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

const cardClass =
  "rounded-2xl border border-classmates-edge bg-classmates-surface px-4 py-4 shadow-[0_4px_14px_rgba(15,23,42,0.04)] dark:border-border dark:bg-card";

export function LoginEmailCard({
  currentEmail,
  variant = "page",
}: {
  currentEmail: string | null;
  /** `page` = full card with title; `form` = fields only (detail screen has its own header). */
  variant?: "page" | "form";
}) {
  const { account } = useAppMessages();
  const t = account.loginEmail;
  const router = useRouter();
  const [draftEmail, setDraftEmail] = useState("");
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(
    null,
  );
  const [otpSending, setOtpSending] = useState(false);
  const [isPending, startTransition] = useTransition();

  const displayCurrent = currentEmail?.trim() ? currentEmail.trim() : null;

  const sendOtp = async () => {
    const email = draftEmail.trim();
    if (!email) {
      setFeedback({ kind: "error", message: t.enterEmail });
      return;
    }
    setOtpSending(true);
    setFeedback(null);
    try {
      const response = await apiFetch("/api/profile/login-email/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        code?: string;
      } | null;
      if (!response.ok || !payload?.success) {
        setFeedback({
          kind: "error",
          message: mapLoginEmailApiError(payload, t.errors),
        });
        return;
      }
      setFeedback({ kind: "success", message: t.errors.codeSent });
    } catch {
      setFeedback({ kind: "error", message: t.errors.networkError });
    } finally {
      setOtpSending(false);
    }
  };

  const save = () =>
    startTransition(async () => {
      const email = draftEmail.trim();
      if (!email) {
        setFeedback({ kind: "error", message: t.enterEmail });
        return;
      }
      if (!/^\d{6}$/.test(code.trim())) {
        setFeedback({ kind: "error", message: t.errors.codeInvalid });
        return;
      }
      setFeedback(null);
      try {
        const response = await apiFetch("/api/profile/login-email", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code: code.trim() }),
        });
        const payload = (await response.json().catch(() => null)) as {
          success?: boolean;
          error?: string;
          code?: string;
        } | null;
        if (!response.ok || !payload?.success) {
          setFeedback({
            kind: "error",
            message: mapLoginEmailApiError(payload, t.errors),
          });
          return;
        }
        setFeedback({ kind: "success", message: t.errors.saved });
        setCode("");
        setDraftEmail("");
        router.refresh();
      } catch {
        setFeedback({ kind: "error", message: t.errors.networkError });
      }
    });

  return (
    <div className={cn(cardClass, "space-y-4")}>
      {variant === "page" ? (
        <div className="flex items-start gap-3">
          <span className={meSettingsRowListIconShellLargeClass}>
            <Mail className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-[15px] font-semibold leading-tight text-classmates-ink dark:text-foreground">
              {t.title}
            </p>
            <p className="text-[12px] leading-snug text-classmates-sub dark:text-zinc-400">{t.hint}</p>
          </div>
        </div>
      ) : null}

      <div className="space-y-1.5 rounded-xl border border-classmates-hairline bg-classmates-warm-alt/40 px-3 py-2.5 dark:border-border/60 dark:bg-muted/25">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t.currentLabel}
        </p>
        <p className="truncate text-[14px] font-semibold text-foreground">
          {displayCurrent ?? t.notSet}
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-foreground" htmlFor="login-email-new">
            {t.newLabel}
          </label>
          <div className="flex gap-2">
            <Input
              id="login-email-new"
              type="email"
              autoComplete="email"
              placeholder={t.newPlaceholder}
              className="min-w-0 flex-1"
              value={draftEmail}
              onChange={(e) => setDraftEmail(e.target.value)}
            />
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              disabled={otpSending || isPending}
              onClick={() => void sendOtp()}
            >
              {otpSending ? t.sendingCode : t.sendCode}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[13px] font-medium text-foreground" htmlFor="login-email-otp">
            {t.codeLabel}
          </label>
          <Input
            id="login-email-otp"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder={t.codePlaceholder}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <p className="text-[11px] leading-snug text-muted-foreground">{t.codeHint}</p>
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
      </div>
    </div>
  );
}
