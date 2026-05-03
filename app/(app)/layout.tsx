import { AppShell } from "@/components/layout/app-shell";
import { getSessionUser } from "@/lib/auth/session";
import { getInboxUnreadTotal } from "@/lib/queries/inbox-merge";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const sessionUser = await getSessionUser();
  const inboxUnreadTotal = sessionUser ? await getInboxUnreadTotal(sessionUser.id) : 0;

  return <AppShell inboxUnreadTotal={inboxUnreadTotal}>{children}</AppShell>;
}
