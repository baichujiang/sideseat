import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";

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
      <div className="flex items-center justify-between text-sm">
        <Link className="text-muted-foreground hover:text-foreground" href="/forgot-password">
          Forgot password?
        </Link>
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          href={
            (query.returnTo
              ? withReturnTo("/signup", query.returnTo)
              : "/signup") as Route
          }
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
