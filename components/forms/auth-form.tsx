"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { setAccessToken } from "@/lib/auth/client-access-token";
import { loginSchema, signupEmailSchema, signupPhoneSchema } from "@/lib/validators/auth";
import { safeReturnPath } from "@/lib/nav/back";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/forms/form-message";
import { useAppMessages } from "@/hooks/use-app-locale";
import { cn } from "@/lib/utils";

type SignupEmailValues = z.infer<typeof signupEmailSchema>;
type SignupPhoneValues = z.infer<typeof signupPhoneSchema>;
type LoginValues = z.infer<typeof loginSchema>;

export function AuthForm({
  mode,
  initialIdentifier = "",
  initialPassword = "",
  returnTo,
}: {
  mode: "login" | "signup";
  initialIdentifier?: string;
  initialPassword?: string;
  /** Safe in-app path to open after a successful login (onboarding must already be complete). */
  returnTo?: string | null;
}) {
  const router = useRouter();
  const a = useAppMessages();
  const af = a.authForm;
  const [serverError, setServerError] = useState("");
  const [signupMethod, setSignupMethod] = useState<"email" | "phone">("email");
  const [otpSending, setOtpSending] = useState(false);

  const emailSignupForm = useForm<SignupEmailValues>({
    resolver: zodResolver(signupEmailSchema),
    defaultValues: {
      email: "",
      password: initialPassword,
      confirmPassword: "",
    },
  });

  const phoneSignupForm = useForm<SignupPhoneValues>({
    resolver: zodResolver(signupPhoneSchema),
    defaultValues: {
      phone: "",
      code: "",
      password: initialPassword,
      confirmPassword: "",
    },
  });

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: mode === "login" ? initialIdentifier : "",
      password: initialPassword,
    },
  });

  useEffect(() => {
    if (mode !== "signup") return;
    const id = initialIdentifier.trim();
    if (id.includes("@")) {
      setSignupMethod("email");
      emailSignupForm.reset({
        email: id,
        password: initialPassword,
        confirmPassword: "",
      });
    } else if (/^\+?\d[\d\s-]{6,}$/.test(id)) {
      setSignupMethod("phone");
      phoneSignupForm.reset({
        phone: id,
        code: "",
        password: initialPassword,
        confirmPassword: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed from URL once; avoid reset loops
  }, [mode, initialIdentifier, initialPassword]);

  const onSubmitSignupEmail = emailSignupForm.handleSubmit(async (values) => {
    setServerError("");
    const response = await fetch("/api/auth/signup-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(values),
    });
    const payload = await response.json();
    if (!response.ok) {
      setServerError(payload.error ?? af.unableToContinue);
      return;
    }
    if (payload.data?.accessToken) {
      setAccessToken(payload.data.accessToken);
    }
    router.push("/onboarding");
    router.refresh();
  });

  const onSubmitSignupPhone = phoneSignupForm.handleSubmit(async (values) => {
    setServerError("");
    const response = await fetch("/api/auth/signup-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(values),
    });
    const payload = await response.json();
    if (!response.ok) {
      setServerError(payload.error ?? af.unableToContinue);
      return;
    }
    if (payload.data?.accessToken) {
      setAccessToken(payload.data.accessToken);
    }
    router.push("/onboarding");
    router.refresh();
  });

  async function sendSignupOtp() {
    const phone = phoneSignupForm.getValues("phone").trim();
    if (!phone) {
      phoneSignupForm.setError("phone", { type: "manual", message: af.enterPhoneNumber });
      return;
    }
    setOtpSending(true);
    setServerError("");
    try {
      const response = await fetch("/api/auth/phone/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone, purpose: "signup" }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setServerError(typeof payload.error === "string" ? payload.error : af.unableToContinue);
        return;
      }
      setServerError("");
    } finally {
      setOtpSending(false);
    }
  }

  const onSubmitLogin = loginForm.handleSubmit(async (values) => {
    setServerError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(values),
    });
    const payload = await response.json();
    if (!response.ok) {
      setServerError(payload.error ?? af.unableToContinue);
      return;
    }
    if (payload.data?.accessToken) {
      setAccessToken(payload.data.accessToken);
    }
    const nextPath = payload.data?.onboardingComplete
      ? safeReturnPath(returnTo, "/home")
      : "/onboarding";
    router.push(nextPath as Route);
    router.refresh();
  });

  if (mode === "signup") {
    return (
      <Card className="space-y-5 border-border/90 bg-card/95 shadow-soft backdrop-blur-[2px]">
        <CardTitle className="text-xl">{af.createAccountTitle}</CardTitle>

        <div
          className="flex rounded-full border border-border bg-muted/40 p-1"
          role="tablist"
          aria-label="Sign up method"
        >
          <button
            type="button"
            role="tab"
            aria-selected={signupMethod === "email"}
            onClick={() => setSignupMethod("email")}
            className={cn(
              "min-h-9 flex-1 rounded-full px-3 text-sm font-semibold transition-colors",
              signupMethod === "email"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {af.signupWithEmail}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={signupMethod === "phone"}
            onClick={() => setSignupMethod("phone")}
            className={cn(
              "min-h-9 flex-1 rounded-full px-3 text-sm font-semibold transition-colors",
              signupMethod === "phone"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {af.signupWithPhone}
          </button>
        </div>

        {signupMethod === "email" ? (
          <form className="space-y-4" onSubmit={onSubmitSignupEmail}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{af.emailLabel}</label>
              <Input
                type="email"
                autoComplete="email"
                placeholder={af.emailPlaceholder}
                {...emailSignupForm.register("email")}
              />
              <FormMessage message={emailSignupForm.formState.errors.email?.message} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{af.passwordLabel}</label>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={af.passwordPlaceholderNew}
                {...emailSignupForm.register("password")}
              />
              <FormMessage message={emailSignupForm.formState.errors.password?.message} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{af.confirmPasswordLabel}</label>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={af.confirmPasswordPlaceholder}
                {...emailSignupForm.register("confirmPassword")}
              />
              <FormMessage message={emailSignupForm.formState.errors.confirmPassword?.message} />
            </div>
            <FormMessage message={serverError} />
            <Button className="w-full" disabled={emailSignupForm.formState.isSubmitting} type="submit">
              {emailSignupForm.formState.isSubmitting ? af.pleaseWait : af.submitCreate}
            </Button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={onSubmitSignupPhone}>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{af.phoneLabel}</label>
              <div className="flex gap-2">
                <Input
                  type="tel"
                  autoComplete="tel"
                  placeholder={af.phonePlaceholder}
                  className="min-w-0 flex-1"
                  {...phoneSignupForm.register("phone")}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="shrink-0"
                  disabled={otpSending}
                  onClick={() => void sendSignupOtp()}
                >
                  {otpSending ? af.sendingCode : af.sendCode}
                </Button>
              </div>
              <FormMessage message={phoneSignupForm.formState.errors.phone?.message} />
              <p className="text-[11px] leading-snug text-muted-foreground">{af.codeSentHint}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{af.otpCodeLabel}</label>
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={af.otpCodePlaceholder}
                {...phoneSignupForm.register("code")}
              />
              <FormMessage message={phoneSignupForm.formState.errors.code?.message} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{af.passwordLabel}</label>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={af.passwordPlaceholderNew}
                {...phoneSignupForm.register("password")}
              />
              <FormMessage message={phoneSignupForm.formState.errors.password?.message} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{af.confirmPasswordLabel}</label>
              <Input
                type="password"
                autoComplete="new-password"
                placeholder={af.confirmPasswordPlaceholder}
                {...phoneSignupForm.register("confirmPassword")}
              />
              <FormMessage message={phoneSignupForm.formState.errors.confirmPassword?.message} />
            </div>
            <FormMessage message={serverError} />
            <Button className="w-full" disabled={phoneSignupForm.formState.isSubmitting} type="submit">
              {phoneSignupForm.formState.isSubmitting ? af.pleaseWait : af.submitCreate}
            </Button>
          </form>
        )}
      </Card>
    );
  }

  return (
    <Card className="space-y-5 border-border/90 bg-card/95 shadow-soft backdrop-blur-[2px]">
      <CardTitle className="text-xl">{af.logInTitle}</CardTitle>
      <form className="space-y-4" onSubmit={onSubmitLogin}>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{af.identifierLabel}</label>
          <Input
            autoComplete="username"
            placeholder={af.identifierPlaceholder}
            {...loginForm.register("identifier")}
          />
          <FormMessage message={loginForm.formState.errors.identifier?.message} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{af.passwordLabel}</label>
          <Input
            type="password"
            autoComplete="current-password"
            {...loginForm.register("password")}
          />
          <FormMessage message={loginForm.formState.errors.password?.message} />
        </div>
        <FormMessage message={serverError} />
        <Button className="w-full" disabled={loginForm.formState.isSubmitting} type="submit">
          {loginForm.formState.isSubmitting ? af.pleaseWait : af.submitLogIn}
        </Button>
      </form>
    </Card>
  );
}
