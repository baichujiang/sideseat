import Link from "next/link";

import { AuthForm } from "@/components/forms/auth-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ user?: string; password?: string }>;
}) {
  const query = (await searchParams) ?? {};

  return (
    <div className="space-y-4">
      <AuthForm
        mode="login"
        initialIdentifier={query.user ?? ""}
        initialPassword={query.password ?? ""}
      />
      <div className="flex items-center justify-between text-sm">
        <Link className="text-muted-foreground hover:text-foreground" href="/forgot-password">
          Forgot password?
        </Link>
        <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/signup">
          Sign up
        </Link>
      </div>
    </div>
  );
}
