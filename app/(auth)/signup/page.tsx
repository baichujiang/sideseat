import Link from "next/link";

import { AuthForm } from "@/components/forms/auth-form";

export default async function SignupPage({
  searchParams,
}: {
  searchParams?: Promise<{ user?: string; password?: string }>;
}) {
  const query = (await searchParams) ?? {};

  return (
    <div className="space-y-4">
      <AuthForm
        mode="signup"
        initialIdentifier={query.user ?? ""}
        initialPassword={query.password ?? ""}
      />
      <p className="text-center text-sm text-muted-foreground">
        Have an account?{" "}
        <Link className="font-medium text-primary underline-offset-4 hover:underline" href="/login">
          Log in
        </Link>
      </p>
    </div>
  );
}
