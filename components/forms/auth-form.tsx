"use client";

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { setAccessToken } from "@/lib/auth/client-access-token";
import {
  createSignupSchema,
  createSignupEmailSchema,
  createSignupPhoneSchema,
  loginSchema,
  signupSchema,
  signupEmailSchema,
  signupPhoneSchema,
} from "@/lib/validators/auth";
import {
  mapEmailOtpApiError,
  mapSignupApiError,
  mapSignupEmailApiError,
} from "@/lib/auth/map-auth-api-errors";
import { safeReturnPath } from "@/lib/nav/back";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/forms/form-message";
import { useAppMessages } from "@/hooks/use-app-locale";
import type { AppMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type SignupValues = z.infer<typeof signupSchema>;
type SignupEmailValues = z.infer<typeof signupEmailSchema>;
type SignupPhoneValues = z.infer<typeof signupPhoneSchema>;
type LoginValues = z.infer<typeof loginSchema>;

type AuthFormCopy = AppMessages["authForm"];

function SignupBlock({
  af,
  initialIdentifier,
  initialPassword,
  returnTo,
}: {
  af: AuthFormCopy;
  initialIdentifier: string;
  initialPassword: string;
  returnTo?: string | null;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const schema = useMemo(
    () =>
      createSignupSchema(
        {
          tooShort: af.signupUsernameTooShort,
          tooLong: af.signupUsernameTooLong,
          invalid: af.signupUsernameInvalid,
          reserved: af.signupUsernameReserved,
        },
        { tooShort: af.signupPasswordTooShort },
      ),
    [
      af.signupPasswordTooShort,
      af.signupUsernameInvalid,
      af.signupUsernameReserved,
      af.signupUsernameTooLong,
      af.signupUsernameTooShort,
    ],
  );
  const seededUsername = /^[a-zA-Z0-9_-]{2,32}$/.test(initialIdentifier.trim())
    ? initialIdentifier.trim().toLowerCase()
    : "";

  const form = useForm<SignupValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      username: seededUsername,
      password: initialPassword,
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError("");
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(values),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setServerError(mapSignupApiError(payload, af.signupErrors));
      return;
    }
    if (payload.data?.accessToken) {
      setAccessToken(payload.data.accessToken);
    }
    router.push(safeReturnPath(returnTo, "/home") as Route);
    router.refresh();
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <p className="text-sm leading-snug text-muted-foreground">{af.signupIntro}</p>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{af.usernameLabel}</label>
        <Input
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={af.usernamePlaceholder}
          className="font-mono"
          {...form.register("username")}
        />
        <p className="text-[11px] leading-snug text-muted-foreground">{af.usernameHint}</p>
        <FormMessage message={form.formState.errors.username?.message} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{af.passwordLabel}</label>
        <Input
          type="password"
          autoComplete="new-password"
          placeholder={af.passwordPlaceholderNew}
          {...form.register("password")}
        />
        <FormMessage message={form.formState.errors.password?.message} />
      </div>
      <FormMessage message={serverError} />
      <Button className="w-full" disabled={form.formState.isSubmitting} type="submit">
        {form.formState.isSubmitting ? af.pleaseWait : af.submitCreate}
      </Button>
    </form>
  );
}

function EmailSignupBlock({
  af,
  initialIdentifier,
  initialPassword,
}: {
  af: AuthFormCopy;
  initialIdentifier: string;
  initialPassword: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [otpFeedback, setOtpFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(
    null,
  );
  const [otpSending, setOtpSending] = useState(false);
  const schema = useMemo(
    () =>
      createSignupEmailSchema(
        {
          tooShort: af.signupDisplayNameTooShort,
          tooLong: af.signupDisplayNameTooLong,
          notEmailLike: af.signupDisplayNameNotEmail,
        },
        {
          tooShort: af.signupUsernameTooShort,
          tooLong: af.signupUsernameTooLong,
          invalid: af.signupUsernameInvalid,
          reserved: af.signupUsernameReserved,
        },
      ),
    [
      af.signupDisplayNameTooShort,
      af.signupDisplayNameTooLong,
      af.signupDisplayNameNotEmail,
      af.signupUsernameTooShort,
      af.signupUsernameTooLong,
      af.signupUsernameInvalid,
      af.signupUsernameReserved,
    ],
  );

  const form = useForm<SignupEmailValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: "",
      username: "",
      email: "",
      code: "",
      password: initialPassword,
      confirmPassword: "",
    },
  });

  useEffect(() => {
    const id = initialIdentifier.trim();
    if (id.includes("@")) {
      form.reset({
        displayName: "",
        email: id,
        code: "",
        password: initialPassword,
        confirmPassword: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed from URL once; avoid reset loops
  }, [initialIdentifier, initialPassword]);

  async function sendSignupOtp() {
    const email = form.getValues("email").trim();
    if (!email) {
      form.setError("email", { type: "manual", message: af.enterEmailAddress });
      return;
    }
    setOtpSending(true);
    setOtpFeedback(null);
    try {
      const response = await fetch("/api/auth/email/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, purpose: "signup" }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setOtpFeedback({
          kind: "error",
          message: mapEmailOtpApiError(payload, af.emailOtpErrors),
        });
        return;
      }
      setOtpFeedback({ kind: "success", message: af.emailOtpErrors.codeSent });
    } catch {
      setOtpFeedback({ kind: "error", message: af.emailOtpErrors.networkError });
    } finally {
      setOtpSending(false);
    }
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError("");
    const response = await fetch("/api/auth/signup-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(values),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setServerError(mapSignupEmailApiError(payload, af.signupEmailErrors));
      return;
    }
    if (payload.data?.accessToken) {
      setAccessToken(payload.data.accessToken);
    }
    router.push("/home");
    router.refresh();
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{af.signupDisplayNameLabel}</label>
        <Input
          autoComplete="nickname"
          placeholder={af.signupDisplayNamePlaceholder}
          {...form.register("displayName")}
        />
        <p className="text-[11px] leading-snug text-muted-foreground">{af.signupDisplayNameHint}</p>
        <FormMessage message={form.formState.errors.displayName?.message} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{af.usernameLabel}</label>
        <Input
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={af.usernamePlaceholder}
          className="font-mono"
          {...form.register("username")}
        />
        <p className="text-[11px] leading-snug text-muted-foreground">{af.usernameHint}</p>
        <FormMessage message={form.formState.errors.username?.message} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{af.emailLabel}</label>
        <div className="flex gap-2">
          <Input
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
            disabled={otpSending}
            onClick={() => void sendSignupOtp()}
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
          <p className="text-[11px] leading-snug text-muted-foreground">{af.emailCodeSentHint}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{af.emailOtpCodeLabel}</label>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={af.otpCodePlaceholder}
          {...form.register("code")}
        />
        <FormMessage message={form.formState.errors.code?.message} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{af.passwordLabel}</label>
        <Input
          type="password"
          autoComplete="new-password"
          placeholder={af.passwordPlaceholderNew}
          {...form.register("password")}
        />
        <FormMessage message={form.formState.errors.password?.message} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{af.confirmPasswordLabel}</label>
        <Input
          type="password"
          autoComplete="new-password"
          placeholder={af.confirmPasswordPlaceholder}
          {...form.register("confirmPassword")}
        />
        <FormMessage message={form.formState.errors.confirmPassword?.message} />
      </div>
      <FormMessage message={serverError} />
      <Button className="w-full" disabled={form.formState.isSubmitting} type="submit">
        {form.formState.isSubmitting ? af.pleaseWait : af.submitCreate}
      </Button>
    </form>
  );
}

function PhoneSignupBlock({
  af,
  initialIdentifier,
  initialPassword,
}: {
  af: AuthFormCopy;
  initialIdentifier: string;
  initialPassword: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [otpSending, setOtpSending] = useState(false);
  const schema = useMemo(
    () =>
      createSignupPhoneSchema(
        {
          tooShort: af.signupDisplayNameTooShort,
          tooLong: af.signupDisplayNameTooLong,
          notEmailLike: af.signupDisplayNameNotEmail,
        },
        {
          tooShort: af.signupUsernameTooShort,
          tooLong: af.signupUsernameTooLong,
          invalid: af.signupUsernameInvalid,
          reserved: af.signupUsernameReserved,
        },
      ),
    [
      af.signupDisplayNameTooShort,
      af.signupDisplayNameTooLong,
      af.signupDisplayNameNotEmail,
      af.signupUsernameTooShort,
      af.signupUsernameTooLong,
      af.signupUsernameInvalid,
      af.signupUsernameReserved,
    ],
  );

  const form = useForm<SignupPhoneValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: "",
      username: "",
      phone: "",
      code: "",
      password: initialPassword,
      confirmPassword: "",
    },
  });

  useEffect(() => {
    const id = initialIdentifier.trim();
    if (/^\+?\d[\d\s-]{6,}$/.test(id)) {
      form.reset({
        displayName: "",
        username: "",
        phone: id,
        code: "",
        password: initialPassword,
        confirmPassword: "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed from URL once; avoid reset loops
  }, [initialIdentifier, initialPassword]);

  async function sendSignupOtp() {
    const phone = form.getValues("phone").trim();
    if (!phone) {
      form.setError("phone", { type: "manual", message: af.enterPhoneNumber });
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

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError("");
    const response = await fetch("/api/auth/signup-phone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(values),
    });
    const payload = await response.json();
    if (!response.ok) {
      setServerError(mapSignupEmailApiError(payload, af.signupEmailErrors));
      return;
    }
    if (payload.data?.accessToken) {
      setAccessToken(payload.data.accessToken);
    }
    router.push("/home");
    router.refresh();
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{af.signupDisplayNameLabel}</label>
        <Input
          autoComplete="nickname"
          placeholder={af.signupDisplayNamePlaceholder}
          {...form.register("displayName")}
        />
        <p className="text-[11px] leading-snug text-muted-foreground">{af.signupDisplayNameHint}</p>
        <FormMessage message={form.formState.errors.displayName?.message} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{af.usernameLabel}</label>
        <Input
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={af.usernamePlaceholder}
          className="font-mono"
          {...form.register("username")}
        />
        <p className="text-[11px] leading-snug text-muted-foreground">{af.usernameHint}</p>
        <FormMessage message={form.formState.errors.username?.message} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{af.phoneLabel}</label>
        <div className="flex gap-2">
          <Input
            type="tel"
            autoComplete="tel"
            placeholder={af.phonePlaceholder}
            className="min-w-0 flex-1"
            {...form.register("phone")}
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
        <FormMessage message={form.formState.errors.phone?.message} />
        <p className="text-[11px] leading-snug text-muted-foreground">{af.codeSentHint}</p>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{af.otpCodeLabel}</label>
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder={af.otpCodePlaceholder}
          {...form.register("code")}
        />
        <FormMessage message={form.formState.errors.code?.message} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{af.passwordLabel}</label>
        <Input
          type="password"
          autoComplete="new-password"
          placeholder={af.passwordPlaceholderNew}
          {...form.register("password")}
        />
        <FormMessage message={form.formState.errors.password?.message} />
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium">{af.confirmPasswordLabel}</label>
        <Input
          type="password"
          autoComplete="new-password"
          placeholder={af.confirmPasswordPlaceholder}
          {...form.register("confirmPassword")}
        />
        <FormMessage message={form.formState.errors.confirmPassword?.message} />
      </div>
      <FormMessage message={serverError} />
      <Button className="w-full" disabled={form.formState.isSubmitting} type="submit">
        {form.formState.isSubmitting ? af.pleaseWait : af.submitCreate}
      </Button>
    </form>
  );
}

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

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: mode === "login" ? initialIdentifier : "",
      password: initialPassword,
    },
  });

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
    router.push(safeReturnPath(returnTo, "/home") as Route);
    router.refresh();
  });

  if (mode === "signup") {
    return (
      <Card className="space-y-5 border-border/90 bg-card/95 shadow-soft backdrop-blur-[2px]">
        <CardTitle className="text-xl">{af.createAccountTitle}</CardTitle>
        <SignupBlock
          af={af}
          initialIdentifier={initialIdentifier}
          initialPassword={initialPassword}
          returnTo={returnTo}
        />
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
