"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { setAccessToken } from "@/lib/auth/client-access-token";
import {
  mapForgotPasswordResetApiError,
  mapForgotPasswordSendApiError,
} from "@/lib/auth/map-auth-api-errors";
import { forgotPasswordResetSchema } from "@/lib/validators/auth";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/forms/form-message";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";
import { safeReturnPath } from "@/lib/nav/back";

type ForgotPasswordValues = z.infer<typeof forgotPasswordResetSchema>;

export function ForgotPasswordForm({
  initialEmail = "",
  returnTo,
}: {
  initialEmail?: string;
  returnTo?: string | null;
}) {
  const router = useRouter();
  const { authForm: af } = useAppMessages();
  const fp = af.forgotPassword;
  const [otpFeedback, setOtpFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(
    null,
  );
  const [otpSending, setOtpSending] = useState(false);
  const [serverError, setServerError] = useState("");

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordResetSchema),
    defaultValues: {
      email: initialEmail,
      code: "",
      password: "",
      confirmPassword: "",
    },
  });

  async function sendResetOtp() {
    const email = form.getValues("email").trim();
    if (!email) {
      form.setError("email", { type: "manual", message: af.enterEmailAddress });
      return;
    }
    setOtpSending(true);
    setOtpFeedback(null);
    try {
      const response = await fetch("/api/auth/forgot-password/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setOtpFeedback({
          kind: "error",
          message: mapForgotPasswordSendApiError(payload, fp.errors),
        });
        return;
      }
      setOtpFeedback({ kind: "success", message: fp.errors.codeSent });
    } catch {
      setOtpFeedback({ kind: "error", message: fp.errors.networkError });
    } finally {
      setOtpSending(false);
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError("");
    const response = await fetch("/api/auth/forgot-password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(values),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setServerError(mapForgotPasswordResetApiError(payload, fp.errors));
      return;
    }
    if (payload.data?.accessToken) {
      setAccessToken(payload.data.accessToken);
    }
    setOtpFeedback({ kind: "success", message: fp.errors.resetSuccess });
    const dest =
      payload.data?.onboardingComplete === false
        ? "/onboarding"
        : safeReturnPath(returnTo, "/home");
    router.push(dest as Route);
    router.refresh();
  });

  return (
    <Card className="space-y-5 border-border/90 bg-card/95 shadow-soft backdrop-blur-[2px]">
      <div className="space-y-1">
        <CardTitle className="text-xl">{fp.title}</CardTitle>
        <CardDescription className="leading-relaxed">{fp.description}</CardDescription>
      </div>

      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="forgot-email">
            {af.emailLabel}
          </label>
          <div className="flex gap-2">
            <Input
              id="forgot-email"
              type="email"
              autoComplete="email"
              placeholder={af.emailPlaceholder}
              className="min-w-0 flex-1"
              {...form.register("email")}
            />
            <Button
              type="button"
              variant="secondary"
              className="shrink-0"
              disabled={otpSending || form.formState.isSubmitting}
              onClick={() => void sendResetOtp()}
            >
              {otpSending ? af.sendingCode : af.sendEmailCode}
            </Button>
          </div>
          <FormMessage message={form.formState.errors.email?.message} />
          {otpFeedback ? (
            <p
              className={cn(
                "text-[12px] leading-snug",
                otpFeedback.kind === "success"
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-destructive",
              )}
              role={otpFeedback.kind === "error" ? "alert" : "status"}
            >
              {otpFeedback.message}
            </p>
          ) : (
            <p className="text-[11px] leading-snug text-muted-foreground">{fp.codeHint}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="forgot-code">
            {af.emailOtpCodeLabel}
          </label>
          <Input
            id="forgot-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder={af.otpCodePlaceholder}
            {...form.register("code")}
          />
          <FormMessage message={form.formState.errors.code?.message} />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="forgot-password">
            {af.passwordLabel}
          </label>
          <Input
            id="forgot-password"
            type="password"
            autoComplete="new-password"
            placeholder={af.passwordPlaceholderNew}
            {...form.register("password")}
          />
          <FormMessage message={form.formState.errors.password?.message} />
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium" htmlFor="forgot-confirm">
            {af.confirmPasswordLabel}
          </label>
          <Input
            id="forgot-confirm"
            type="password"
            autoComplete="new-password"
            placeholder={af.confirmPasswordPlaceholder}
            {...form.register("confirmPassword")}
          />
          <FormMessage message={form.formState.errors.confirmPassword?.message} />
        </div>

        <FormMessage message={serverError} />
        <Button className="w-full" disabled={form.formState.isSubmitting} type="submit">
          {form.formState.isSubmitting ? af.pleaseWait : fp.submitReset}
        </Button>
      </form>

      <Link
        className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
        href={(returnTo ? `/login?returnTo=${encodeURIComponent(returnTo)}` : "/login") as Route}
      >
        {fp.backToLogin}
      </Link>
    </Card>
  );
}
