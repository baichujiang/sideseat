import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";

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
      <p className="text-center text-sm text-muted-foreground">
        Have an account?{" "}
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          href={
            (query.returnTo
              ? withReturnTo("/login", query.returnTo)
              : "/login") as Route
          }
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
