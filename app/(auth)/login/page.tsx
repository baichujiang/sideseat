import type { Route } from "next";
import { redirect } from "next/navigation";

import { AuthLoginFooter } from "@/components/auth/auth-login-footer";
import { AuthForm } from "@/components/forms/auth-form";
import { getSessionUser } from "@/lib/auth/session";
import { withReturnTo } from "@/lib/nav/back";

export default async function LoginPage({
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
        mode="login"
        initialIdentifier={query.user ?? ""}
        initialPassword={query.password ?? ""}
        returnTo={query.returnTo}
      />
      <AuthLoginFooter
        signupHref={
          (query.returnTo ? withReturnTo("/signup", query.returnTo) : "/signup") as Route
        }
      />
    </div>
  );
}
