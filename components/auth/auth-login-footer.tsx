"use client";

import Link from "next/link";
import type { Route } from "next";

import { useAppMessages } from "@/hooks/use-app-locale";

export function AuthLoginFooter({
  signupHref,
  forgotPasswordHref = "/forgot-password" as Route,
}: {
  signupHref: Route;
  forgotPasswordHref?: Route;
}) {
  const a = useAppMessages();

  return (
    <div className="flex items-center justify-between text-sm">
      <Link className="text-muted-foreground hover:text-foreground" href={forgotPasswordHref}>
        {a.auth.forgotPassword}
      </Link>
      <Link className="font-medium text-primary underline-offset-4 hover:underline" href={signupHref}>
        {a.auth.signUpLink}
      </Link>
    </div>
  );
}
