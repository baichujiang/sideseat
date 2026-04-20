import { redirect } from "next/navigation";

import { AppEntryGate } from "@/components/app/app-entry-gate";
import { getSessionUser } from "@/lib/auth/session";

export default async function RootPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/home");
  }

  return <AppEntryGate />;
}
