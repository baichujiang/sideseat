"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { buildClientContext } from "@/lib/client/install-context";
import { loginSchema, signupSchema } from "@/lib/validators/auth";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FormMessage } from "@/components/forms/form-message";

type SignupValues = z.infer<typeof signupSchema>;
type LoginValues = z.infer<typeof loginSchema>;

export function AuthForm({
  mode,
  initialIdentifier = "",
  initialPassword = "",
}: {
  mode: "login" | "signup";
  initialIdentifier?: string;
  initialPassword?: string;
}) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");

  const signupForm = useForm<SignupValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      username: mode === "signup" ? initialIdentifier : "",
      password: initialPassword,
    },
  });

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      identifier: mode === "login" ? initialIdentifier : "",
      password: initialPassword,
    },
  });

  const onSubmitSignup = signupForm.handleSubmit(async (values) => {
    setServerError("");
    const response = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        clientContext: buildClientContext(),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setServerError(payload.error ?? "Unable to continue.");
      return;
    }
    const nextPath = payload.data?.onboardingComplete ? "/home" : "/onboarding";
    router.push(nextPath);
    router.refresh();
  });

  const onSubmitLogin = loginForm.handleSubmit(async (values) => {
    setServerError("");
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...values,
        clientContext: buildClientContext(),
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setServerError(payload.error ?? "Unable to continue.");
      return;
    }
    const nextPath = payload.data?.onboardingComplete ? "/home" : "/onboarding";
    router.push(nextPath);
    router.refresh();
  });

  if (mode === "signup") {
    return (
      <Card className="space-y-5 border-border/90 bg-card/95 shadow-soft backdrop-blur-[2px]">
        <CardTitle className="text-xl">Create account</CardTitle>
        <form className="space-y-4" onSubmit={onSubmitSignup}>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Username</label>
            <Input
              autoComplete="username"
              placeholder="letters, numbers, _ or -"
              {...signupForm.register("username")}
            />
            <FormMessage message={signupForm.formState.errors.username?.message} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Password</label>
            <Input
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              {...signupForm.register("password")}
            />
            <FormMessage message={signupForm.formState.errors.password?.message} />
          </div>
          <p className="text-xs text-muted-foreground">
            Add your TUM email later in Profile to verify as a student.
          </p>
          <FormMessage message={serverError} />
          <Button className="w-full" disabled={signupForm.formState.isSubmitting} type="submit">
            {signupForm.formState.isSubmitting ? "Please wait..." : "Create account"}
          </Button>
        </form>
      </Card>
    );
  }

  return (
    <Card className="space-y-5 border-border/90 bg-card/95 shadow-soft backdrop-blur-[2px]">
      <CardTitle className="text-xl">Log in</CardTitle>
      <form className="space-y-4" onSubmit={onSubmitLogin}>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Username or email</label>
          <Input
            autoComplete="username"
            placeholder="you@tum.de"
            {...loginForm.register("identifier")}
          />
          <FormMessage message={loginForm.formState.errors.identifier?.message} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Password</label>
          <Input
            type="password"
            autoComplete="current-password"
            {...loginForm.register("password")}
          />
          <FormMessage message={loginForm.formState.errors.password?.message} />
        </div>
        <FormMessage message={serverError} />
        <Button className="w-full" disabled={loginForm.formState.isSubmitting} type="submit">
          {loginForm.formState.isSubmitting ? "Please wait..." : "Log in"}
        </Button>
      </form>
    </Card>
  );
}
