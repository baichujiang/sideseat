import { redirect } from "next/navigation";

import { BackLink } from "@/components/nav/back-link";
import { DeleteAccountForm } from "@/components/profile/delete-account-form";
import { getSessionUser } from "@/lib/auth/session";

export default async function DeleteAccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!user.onboardingComplete) redirect("/onboarding");

  return (
    <div className="space-y-5 pb-2">
      <header className="flex items-center gap-2 px-0.5">
        <BackLink href="/profile/account" label="Back" />
        <div>
          <h1 className="page-screen-title-ink">Delete account</h1>
          <p className="page-screen-subtitle mt-0.5">注销账号 · Permanent and irreversible.</p>
        </div>
      </header>

      <DeleteAccountForm username={user.username} />
    </div>
  );
}
