"use client";

import Link from "next/link";
import type { Route } from "next";

import { useAppMessages } from "@/hooks/use-app-locale";

export function AuthSignupFooter({ loginHref }: { loginHref: Route }) {
  const a = useAppMessages();

  return (
    <p className="text-center text-sm text-muted-foreground">
      {a.auth.signupHaveAccount}{" "}
      <Link className="font-medium text-primary underline-offset-4 hover:underline" href={loginHref}>
        {a.auth.signupLogInLink}
      </Link>
    </p>
  );
}
