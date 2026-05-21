import { redirect } from "next/navigation";

import { ForgotPasswordForm } from "@/components/forms/forgot-password-form";
import { getSessionUser } from "@/lib/auth/session";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ email?: string; returnTo?: string }>;
}) {
  const user = await getSessionUser();
  if (user && !user.isGuest) {
    redirect("/home");
  }

  const query = (await searchParams) ?? {};

  return (
    <ForgotPasswordForm initialEmail={query.email ?? ""} returnTo={query.returnTo} />
  );
}
