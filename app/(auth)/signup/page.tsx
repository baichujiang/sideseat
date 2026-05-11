import type { Route } from "next";
import { redirect } from "next/navigation";

import { AuthSignupFooter } from "@/components/auth/auth-signup-footer";
import { AuthForm } from "@/components/forms/auth-form";
import { getSessionUser } from "@/lib/auth/session";
import { withReturnTo } from "@/lib/nav/back";

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<{ user?: string; password?: string; returnTo?: string }>;
}) {
  const user = await getSessionUser();
  if (user && !user.isGuest) {
    redirect("/home");
  }

  const query = (await searchParams) ?? {};

  return (
    <div className="space-y-4">
      <AuthForm
        mode="signup"
        initialIdentifier={query.user ?? ""}
        initialPassword={query.password ?? ""}
        returnTo={query.returnTo}
      />
      <AuthSignupFooter
        loginHref={(query.returnTo ? withReturnTo("/login", query.returnTo) : "/login") as Route}
      />
    </div>
  );
}
