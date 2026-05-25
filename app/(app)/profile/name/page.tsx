import { redirect } from "next/navigation";

import { getSessionUser } from "@/lib/auth/session";

export default async function ProfileNamePage() {
  const user = await getSessionUser();
  if (!user || user.isGuest) redirect("/profile");

  redirect("/profile/account/login-username");
}
