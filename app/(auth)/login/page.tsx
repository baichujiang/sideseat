import type { Route } from "next";
import { redirect } from "next/navigation";

import { AuthLoginFooter } from "@/components/auth/auth-login-footer";
import { AuthForm } from "@/components/forms/auth-form";
import { getSessionUser } from "@/lib/auth/session";
import { resolveBackHref, withReturnTo } from "@/lib/nav/back";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ user?: string; password?: string; returnTo?: string }>;
}) {
  const query = (await searchParams) ?? {};
  const user = await getSessionUser();
  if (user && !user.isGuest) {
    // Honor the destination even when the browser already has a valid session.
    const origin = "https://sideseat.local";
    const destination = resolveBackHref(query.returnTo, "/home", "/login");
    const target = new URL(URL.canParse(destination, origin) ? destination : "/home", origin);
    redirect((target.origin === origin
      ? resolveBackHref(`${target.pathname}${target.search}${target.hash}`, "/home", "/login")
      : "/home") as Route);
  }

  return (
    <div className="space-y-4">
      <AuthForm
        mode="login"
        initialIdentifier={query.user ?? ""}
        initialPassword={query.password ?? ""}
        returnTo={query.returnTo}
      />
      <AuthLoginFooter
        signupHref={
          (query.returnTo ? withReturnTo("/signup", query.returnTo) : "/signup") as Route
        }
        forgotPasswordHref={
          (query.returnTo ? withReturnTo("/forgot-password", query.returnTo) : "/forgot-password") as Route
        }
      />
    </div>
  );
}
